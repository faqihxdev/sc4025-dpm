import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from './_middleware';

const ORIGIN = 'https://sbx.utf.sh';
const CODE = '123456';
const env = { DEMO_ACCESS_CODE: CODE, DEMO_SESSION_SECRET: 'test-fixture-session-key-32-characters-long' };
const next = vi.fn(async () => new Response('private app bytes', { headers: { 'cache-control': 'public, max-age=31536000, immutable' } }));
const run = (request: Request, variables: { DEMO_ACCESS_CODE?: string; DEMO_SESSION_SECRET?: string } = env) => onRequest({ request, env: variables, next });
function entry(fields: Record<string, string> = {}, origin = ORIGIN) {
  return new Request(`${ORIGIN}/_access`, {
    method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: CODE, acknowledged: 'yes', returnTo: '/#/chat', ...fields }),
  });
}
async function session() {
  const response = await run(entry());
  return { response, cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
afterEach(() => { next.mockClear(); vi.useRealTimers(); });

describe('private prototype boundary', () => {
  it('protects documents, assets and APIs without exposing private bytes or accepting a query code', async () => {
    for (const path of ['/', '/?c=must-not-be-echoed', '/assets/app.js', '/media/images/drink.webp', '/api/chat', '/api/events']) {
      const response = await run(new Request(ORIGIN + path));
      const body = await response.text();
      expect(body).not.toContain('private app bytes');
      expect(body).not.toContain('must-not-be-echoed');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('requires the correct code, explicit acknowledgement and same-origin submission', async () => {
    for (const request of [entry({ code: 'wrong' }), entry({ acknowledged: '' }), entry({}, 'https://other.example')]) {
      const response = await run(request);
      expect(response.status).toBe(403);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('issues a host-only secure seven-day cookie and returns to the requested app route', async () => {
    const { response, cookie } = await session();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/#/chat');
    expect(response.headers.get('set-cookie')).toContain('Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=604800');
    expect(cookie).not.toContain(CODE);
    const privateResponse = await run(new Request(`${ORIGIN}/media/images/drink.webp`, { headers: { cookie } }));
    expect(await privateResponse.text()).toBe('private app bytes');
    expect(privateResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(privateResponse.headers.get('set-cookie')).toBeNull();
  });

  it('rejects expired, modified, cross-host and rotated-code sessions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    const { cookie } = await session();
    for (const [target, token, variables] of [
      [ORIGIN, `${cookie}x`, env],
      ['https://fmd-a5f.pages.dev', cookie, env],
      [ORIGIN, cookie, { ...env, DEMO_ACCESS_CODE: '654321' }],
    ] as const) {
      expect((await run(new Request(`${target}/api/chat`, { headers: { cookie: token } }), variables)).status).toBe(401);
    }
    vi.advanceTimersByTime(604800_000);
    expect((await run(new Request(`${ORIGIN}/api/chat`, { headers: { cookie } }))).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed with no public-host secret, including on deployment aliases', async () => {
    expect((await run(new Request('https://preview.fmd-a5f.pages.dev/'), {})).status).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('prevents external redirects and removes the query code for returning visitors', async () => {
    expect((await run(entry({ returnTo: '//other.example/' }))).headers.get('location')).toBe('/');
    const { cookie } = await session();
    const response = await run(new Request(`${ORIGIN}/?c=hidden&keep=yes`, { headers: { cookie } }));
    expect(response.headers.get('location')).toBe('/?keep=yes');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects oversized entry bodies without issuing a session', async () => {
    const response = await run(entry({ code: 'x'.repeat(5000) }));
    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('temporarily blocks repeated incorrect guesses from one address', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    const attempt = () => { const request = entry({ code: '000000' }); request.headers.set('cf-connecting-ip', '192.0.2.75'); return run(request); };
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(403);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('900');
    vi.advanceTimersByTime(900_000);
    expect((await attempt()).status).toBe(403);
  });
});
