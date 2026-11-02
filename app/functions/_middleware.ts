import { accessPage } from '../server/access-page';

interface AccessContext {
  request: Request;
  env: { DEMO_ACCESS_CODE?: string; DEMO_SESSION_SECRET?: string };
  next: () => Promise<Response>;
}

const COOKIE = '__Host-fmd-access';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
const ATTEMPT_WINDOW = 15 * 60;
const failures = new Map<string, { count: number; until: number }>();

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}

async function signingKey(code: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(code), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const signedMessage = (origin: string, expires: number, code: string) => encoder.encode(`concept-v1|${origin}|${expires}|${code}`);

async function validSession(request: Request, code: string, secret: string, now: number): Promise<boolean> {
  const value = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!value || value.length > 160) return false;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== '1' || !/^\d{10}$/.test(parts[1]) || !/^[\w-]{43}$/.test(parts[2])) return false;
  const expires = Number(parts[1]);
  if (expires <= now || expires > now + SESSION_SECONDS) return false;
  try {
    return await crypto.subtle.verify('HMAC', await signingKey(secret), fromBase64url(parts[2]), signedMessage(new URL(request.url).origin, expires, code));
  } catch { return false; }
}

function protect(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.set('cache-control', 'private, no-store');
  result.headers.set('cloudflare-cdn-cache-control', 'no-store');
  result.headers.set('referrer-policy', 'no-referrer');
  result.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  result.headers.set('x-content-type-options', 'nosniff');
  result.headers.append('vary', 'Cookie');
  return result;
}

function screen(error = '', status = 200): Response {
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(18)));
  const response = protect(new Response(accessPage(nonce, error), { status, headers: {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `default-src 'none'; img-src data:; connect-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  } }));
  // Keep the form's Origin header intact while suppressing external referrers.
  response.headers.set('referrer-policy', 'same-origin');
  return response;
}

const denied = (status = 401) => protect(Response.json({ error: 'Reload the app to enter the access code.' }, { status }));

function returnPath(value: FormDataEntryValue | null, origin: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 2048) return '/';
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname === '/_access') return '/';
    url.searchParams.delete('c');
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}

async function readForm(request: Request): Promise<URLSearchParams> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing form');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error('Form too large'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export async function onRequest({ request, env, next }: AccessContext): Promise<Response> {
  const url = new URL(request.url);
  // Vite and Wrangler are bound to loopback for local development. Public hosts
  // always require the production secret and a signed session.
  if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return next();
  const code = env.DEMO_ACCESS_CODE?.trim();
  const secret = env.DEMO_SESSION_SECRET?.trim();
  if (!code || !/^\d{6}$/.test(code) || !secret || secret.length < 32) return screen('Access is unavailable.', 503);
  const now = Math.floor(Date.now() / 1000);

  if (url.pathname === '/_access/session') {
    if (request.method !== 'GET') return denied(405);
    return await validSession(request, code, secret, now) ? protect(new Response(null, { status: 204 })) : denied();
  }

  if (url.pathname === '/_access/logout') {
    if (request.method !== 'POST') return denied(405);
    if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return denied(403);
    return protect(new Response(null, { status: 204, headers: {
      'set-cookie': `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
    } }));
  }

  if (url.pathname === '/_access' || url.pathname === '/_access/check') {
    const checking = url.pathname === '/_access/check';
    const failure = (error: string, status: number) => checking ? protect(Response.json({ error }, { status })) : screen(error, status);
    if (request.method !== 'POST') return denied(405);
    if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return denied(403);
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return denied(400);
    let form: URLSearchParams;
    try { form = await readForm(request); } catch { return denied(400); }
    const address = request.headers.get('cf-connecting-ip') || 'unknown';
    for (const [ip, attempts] of failures) if (attempts.until <= now) failures.delete(ip);
    const attempts = failures.get(address);
    if ((attempts && attempts.count >= 5) || (!attempts && failures.size >= 1000)) {
      const wait = Math.max(1, (attempts?.until ?? now + ATTEMPT_WINDOW) - now);
      const response = failure(`Try again in ${Math.ceil(wait / 60)} minutes.`, 429);
      response.headers.set('retry-after', String(wait));
      return response;
    }
    const supplied = form.get('code')?.trim();
    if (!supplied || supplied.length > 128 || (!checking && form.get('acknowledged') !== 'yes')) return failure('Enter the code and confirm the notice.', 403);
    const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(code)));
    const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(supplied)));
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ actual[i];
    if (difference) {
      failures.set(address, { count: (attempts?.count ?? 0) + 1, until: attempts?.until ?? now + ATTEMPT_WINDOW });
      return failure('Check the code and try again.', 403);
    }
    failures.delete(address);
    if (checking) return protect(new Response(null, { status: 204 }));
    const expires = now + SESSION_SECONDS;
    const signature = base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), signedMessage(url.origin, expires, code))));
    return protect(new Response(null, { status: 303, headers: {
      location: returnPath(form.get('returnTo'), url.origin),
      'set-cookie': `${COOKIE}=1.${expires}.${signature}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}`,
    } }));
  }

  if (await validSession(request, code, secret, now)) {
    if (url.searchParams.has('c') && request.method === 'GET') {
      url.searchParams.delete('c');
      return protect(new Response(null, { status: 303, headers: { location: url.pathname + url.search } }));
    }
    return protect(await next());
  }
  const document = request.headers.get('sec-fetch-dest') === 'document' || request.headers.get('accept')?.includes('text/html') || ['/', '/index.html'].includes(url.pathname);
  return request.method === 'GET' && document ? screen() : denied();
}
