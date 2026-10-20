import { validateAnalyticsBatch } from '../analytics/validation';

interface AnalyticsEnvironment {
  POSTHOG_PROJECT_KEY?: string;
  ANALYTICS_TEST_MODE?: string;
}

interface AnalyticsContext {
  request: Request & { cf?: { country?: unknown } };
  env: AnalyticsEnvironment;
}

const MAX_BODY_BYTES = 12_288;
const FORWARD_TIMEOUT_MS = 4_000;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_VISITOR = 60;
const MAX_GLOBAL_REQUESTS = 600;
const MAX_TRACKED_VISITORS = 1_000;
const PRODUCTION_HOSTS = new Set(['starbucks.utf.sh', 'starbucks-drink-finder.pages.dev']);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function response(status: number, error?: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(error ? JSON.stringify({ error }) : null, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(error ? { 'content-type': 'application/json; charset=utf-8' } : {}),
      ...extraHeaders,
    },
  });
}

async function readBody(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) throw new Error('Missing body');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError('Body too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function createAnalyticsHandler(fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  const visitors = new Map<string, { start: number; count: number }>();
  let globalWindow = { start: now(), count: 0 };

  // Short-lived per-isolate limits, not a durable WAF or a visitor identity.
  function reserveUsage(request: Request): number {
    const time = now();
    if (time - globalWindow.start >= RATE_WINDOW_MS) globalWindow = { start: time, count: 0 };
    let earliestStart = time;
    for (const [address, window] of visitors) {
      if (time - window.start >= RATE_WINDOW_MS) visitors.delete(address);
      else earliestStart = Math.min(earliestStart, window.start);
    }
    const address = request.headers.get('cf-connecting-ip') || 'unknown';
    const visitor = visitors.get(address) || { start: time, count: 0 };
    const remaining = (start: number) => Math.max(1, Math.ceil((start + RATE_WINDOW_MS - time) / 1_000));
    if (globalWindow.count >= MAX_GLOBAL_REQUESTS) return remaining(globalWindow.start);
    if (visitor.count >= MAX_REQUESTS_PER_VISITOR) return remaining(visitor.start);
    if (!visitors.has(address) && visitors.size >= MAX_TRACKED_VISITORS) return remaining(earliestStart);
    visitor.count += 1;
    visitors.set(address, visitor);
    globalWindow.count += 1;
    return 0;
  }

  return async function handleEvents({ request, env }: AnalyticsContext): Promise<Response> {
    if (request.method !== 'POST') return response(405, 'Use POST for events.', { allow: 'POST' });
    // Honour the browser preference even if a stale client still sends a batch.
    if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') return response(204);
    const url = new URL(request.url);
    const isProduction = url.protocol === 'https:' && PRODUCTION_HOSTS.has(url.hostname);
    const isLocalTest = env.ANALYTICS_TEST_MODE === '1' && LOCAL_HOSTS.has(url.hostname);
    if ((!isProduction && !isLocalTest) || request.headers.get('origin') !== url.origin ||
      request.headers.get('sec-fetch-site') === 'cross-site') return response(403, 'Open feedback from the app.');
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return response(400, 'Send a JSON event batch.');
    const declaredLength = request.headers.get('content-length');
    if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) return response(413, 'That event batch is too large.');
    let batch;
    try {
      batch = validateAnalyticsBatch(JSON.parse(await readBody(request.body)));
    } catch (error) {
      return response(error instanceof RangeError ? 413 : 400, 'Send a valid event batch.');
    }
    if (!batch) return response(400, 'Send a valid event batch.');
    // Local verification never sends real telemetry, even with a configured key.
    if (env.ANALYTICS_TEST_MODE === '1') return response(204);
    if (!env.POSTHOG_PROJECT_KEY?.trim()) return response(503, 'Feedback is not connected yet.');
    const retryAfter = reserveUsage(request);
    if (retryAfter) return response(429, 'Please wait before sending more feedback.', { 'retry-after': String(retryAfter) });
    const suppliedCountry = request.cf?.country;
    const country = typeof suppliedCountry === 'string' && /^[A-Z]{2}$/.test(suppliedCountry) ? suppliedCountry : 'unknown';
    const payload = {
      api_key: env.POSTHOG_PROJECT_KEY.trim(),
      batch: batch.events.map((event) => ({
        event: event.name,
        distinct_id: batch.sessionId,
        timestamp: event.timestamp,
        properties: {
          ...event.properties,
          $process_person_profile: false,
          $geoip_disable: true,
          // PostHog replaces null with the ingestion connection address. A
          // fixed sentinel prevents that fallback without forwarding visitor IPs.
          $ip: '0.0.0.0',
          $session_id: batch.sessionId,
          $insert_id: event.id,
          app: 'starbucks-drink-finder',
          environment: 'production',
          is_test: request.headers.get('x-analytics-test') === '1',
          country_code: country,
        },
      })),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
    try {
      const result = await fetcher('https://us.i.posthog.com/batch/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return result.ok ? response(204) : response(503, 'Feedback could not be saved just now.');
    } catch {
      return response(503, 'Feedback could not be saved just now.');
    } finally {
      clearTimeout(timer);
    }
  };
}

const handleEvents = createAnalyticsHandler();
export const onRequest = (context: AnalyticsContext) => handleEvents(context);
