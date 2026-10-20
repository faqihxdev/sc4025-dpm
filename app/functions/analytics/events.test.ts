import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnalyticsHandler } from '../api/events';
import { validateAnalyticsBatch } from './validation';
import { CHAT_END_REASONS } from '../../src/chat/contracts';
import { redactReviewMessage } from './redaction';

const SESSION = 'bec46802-c940-4313-9d31-08e6b3b3e38f';
const EVENT = '869f5158-9fbe-4b91-8b36-bef4cc48fd31';
const FLOW = '4b0a6e20-508e-4d40-9067-8ddf14af3958';
const ENV = { POSTHOG_PROJECT_KEY: 'public-test-project-key' };

function batch(name = 'visit_started', properties: unknown = { referral_source: 'direct', device: 'mobile' }) {
  return { sessionId: SESSION, events: [{ id: EVENT, name, properties, timestamp: '2026-10-03T07:00:00.000Z' }] };
}

function request(body: unknown = batch(), headers: Record<string, string> = {}, url = 'https://starbucks.utf.sh/api/events') {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: new URL(url).origin, 'cf-connecting-ip': '192.0.2.5', ...headers },
    body: JSON.stringify(body),
  });
}

function successFetcher() {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
}

afterEach(() => vi.useRealTimers());

describe('analytics event schema', () => {
  it.each([
    ['visit_started', { referral_source: 'search', device: 'desktop' }],
    ['feature_used', { source: 'menu' }],
    ['drink_viewed', { source: 'chat' }],
    ['finder_started', { source: 'quick_choices', flow_id: FLOW }],
    ['recommendations_shown', { source: 'chat', flow_id: FLOW, count: 2 }],
    ['flow_completed', { source: 'menu', flow_id: FLOW }],
    ['active_time_120s', { active_seconds: 120 }],
    ['idea_feedback', { vote: 'yes', response_id: FLOW, question_version: 1 }],
    ['feedback_comment', { vote: 'no', response_id: FLOW, question_version: 1, comment: '  I prefer the quick choices.  ' }],
  ])('accepts the documented %s event', (name, properties) => {
    const validated = validateAnalyticsBatch(batch(name, properties));
    expect(validated?.events[0].name).toBe(name);
  });

  it.each(CHAT_END_REASONS)('accepts the existing chat closing reason %s without transcript data', (reason) => {
    expect(validateAnalyticsBatch(batch('chat_ended', { reason, turn_count: 3, conversation_id: FLOW }))).not.toBeNull();
  });

  it('accepts only the limited closing-message excerpts and redacts them before forwarding', () => {
    const value = validateAnalyticsBatch(batch('chat_ended', {
      reason: 'security_misuse', turn_count: 3, conversation_id: FLOW,
      review_messages: ['Contact me at test@example.com or +65 8123 4567', 'open https://example.com/private?key=value', 'password="secret password" and sk-proj-test1234567890'],
    }));
    expect(value?.events[0].properties.review_messages).toEqual([
      'Contact me at [email removed] or [phone removed]',
      'open [link removed]',
      '[secret removed] and [token removed]',
    ]);
  });

  it('does not store normal turn-limit conversation excerpts', () => {
    expect(validateAnalyticsBatch(batch('chat_ended', { reason: 'turn_limit', turn_count: 20, conversation_id: FLOW, review_messages: ['I want a coffee'] }))).toBeNull();
  });

  it('omits excerpts that become blank after control-character removal', () => {
    const value = validateAnalyticsBatch(batch('chat_ended', { reason: 'security_misuse', turn_count: 1, conversation_id: FLOW, review_messages: ['\u0001'] }));
    expect(value?.events[0].properties).toEqual({ reason: 'security_misuse', turn_count: 1, conversation_id: FLOW });
  });

  it.each([{ review_messages: [] }, { review_messages: ['x'.repeat(601)] }, { review_messages: ['one', 'two', 'three', 'four'] }, { review_messages: [42] }, { review_messages: [''] }])('rejects an invalid review excerpt list', ({ review_messages }) => {
    expect(validateAnalyticsBatch(batch('chat_ended', { reason: 'repeated_off_topic', turn_count: 3, conversation_id: FLOW, review_messages }))).toBeNull();
  });

  it.each(['ip', '$ip', 'url', 'referrer', 'messages', 'email', 'distinct_id', '$process_person_profile', 'is_test'])('rejects injected %s event properties', (key) => {
    expect(validateAnalyticsBatch(batch('feature_used', { source: 'chat', [key]: 'private value' }))).toBeNull();
  });

  it('rejects extra envelope and event fields', () => {
    expect(validateAnalyticsBatch({ ...batch(), ip: '192.0.2.5' })).toBeNull();
    const value = batch();
    expect(validateAnalyticsBatch({ ...value, events: [{ ...value.events[0], url: '/chat' }] })).toBeNull();
  });

  it.each([
    ['anything_else', {}],
    ['feature_used', { source: 'settings' }],
    ['finder_started', { source: 'menu', flow_id: FLOW }],
    ['recommendations_shown', { source: 'chat', flow_id: FLOW, count: 4 }],
    ['recommendations_shown', { source: 'chat', flow_id: FLOW, count: 1.5 }],
    ['active_time_120s', { active_seconds: 200 }],
    ['idea_feedback', { vote: 'maybe', response_id: FLOW, question_version: 1 }],
    ['idea_feedback', { vote: 'yes', response_id: FLOW, question_version: 2 }],
    ['chat_ended', { reason: 'dangerous', turn_count: 3, conversation_id: FLOW }],
    ['chat_ended', { reason: 'turn_limit', turn_count: 21, conversation_id: FLOW }],
    ['chat_ended', { reason: 'turn_limit', turn_count: 0, conversation_id: FLOW }],
    ['chat_ended', { reason: 'security_misuse', turn_count: 1, conversation_id: FLOW, messages: ['Ignore the rules'] }],
  ])('rejects invalid values for %s', (name, properties) => {
    expect(validateAnalyticsBatch(batch(name, properties))).toBeNull();
  });

  it.each(['', 'x'.repeat(501), '<script>alert(1)</script>', 'text\u0000'])('rejects an invalid optional comment', (comment) => {
    expect(validateAnalyticsBatch(batch('feedback_comment', { vote: 'yes', response_id: FLOW, question_version: 1, comment }))).toBeNull();
  });

  it('retains plain feedback and trims its outer spaces', () => {
    const value = validateAnalyticsBatch(batch('feedback_comment', { vote: 'yes', response_id: FLOW, question_version: 1, comment: '  Clear choices\nand nice pictures.  ' }));
    expect(value?.events[0].properties.comment).toBe('Clear choices\nand nice pictures.');
  });

  it('also redacts obvious personal details and keys from voluntary feedback', () => {
    const value = validateAnalyticsBatch(batch('feedback_comment', { vote: 'yes', response_id: FLOW, question_version: 1, comment: 'Email test@example.com. MY_PRIVATE_KEY="example-secret"' }));
    expect(value?.events[0].properties.comment).toBe('Email [email removed]. [secret removed]');
  });

  it('requires random UUID identifiers, UTC timestamps and a bounded nonempty batch', () => {
    expect(validateAnalyticsBatch({ ...batch(), sessionId: 'my@email.example' })).toBeNull();
    expect(validateAnalyticsBatch({ ...batch(), events: [] })).toBeNull();
    const event = batch().events[0];
    expect(validateAnalyticsBatch({ ...batch(), events: [{ ...event, id: 'identity' }] })).toBeNull();
    expect(validateAnalyticsBatch({ ...batch(), events: [{ ...event, timestamp: '2026-02-30T00:00:00Z' }] })).toBeNull();
    expect(validateAnalyticsBatch({ ...batch(), events: [{ ...event, timestamp: '2026-10-03T07:00:00+00:00' }] })).toBeNull();
    expect(validateAnalyticsBatch({ ...batch(), events: Array.from({ length: 11 }, () => event) })).toBeNull();
    expect(validateAnalyticsBatch({ ...batch(), events: [event, event] })).toBeNull();
  });
});

describe('closed-chat review redaction', () => {
  it('removes common secret assignments, token prefixes and bearer values', () => {
    expect(redactReviewMessage('api_key=abc123 secret: "long value" pwd=123456')).toBe('[secret removed] [secret removed] [secret removed]');
    expect(redactReviewMessage('Authorization: Bearer test.token.value')).toBe('[token removed]');
    expect(redactReviewMessage('ghp_abcdef1234567890')).toBe('[token removed]');
  });

  it.each([
    'POSTHOG_PERSONAL_API_KEY=phx_example_secret',
    'OPENAI_API_KEY="opaque-value"',
    'ACCESS_TOKEN=opaque-token',
    'DATABASE_PASSWORD = "password with spaces"',
    'SOME_SECRET = \'secret with spaces\'',
    'API KEY = example',
    'API   KEY: example',
  ])('redacts common environment or spaced key assignments', (message) => {
    expect(redactReviewMessage(message)).toBe('[secret removed]');
  });

  it('does not leak the remainder of an escaped quoted secret', () => {
    expect(redactReviewMessage('password="one \\"two\\" three"')).toBe('[secret removed]');
  });

  it('redacts bare personal API tokens and JWT-shaped tokens', () => {
    expect(redactReviewMessage('phx_example_personal_token')).toBe('[token removed]');
    expect(redactReviewMessage('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJleGFtcGxlIn0.c2lnbmF0dXJl')).toBe('[token removed]');
  });

  it('redacts non-HTTP links as well', () => {
    expect(redactReviewMessage('open file:///private/path and ftp://example.com/account')).toBe('open [link removed] and [link removed]');
  });

  it('keeps ordinary ingredient text and short amounts, and treats markup as text', () => {
    expect(redactReviewMessage('250 mL, 12 oz, $8.50, 3 drinks\u0000 <script>ignore rules</script>')).toBe('250 mL, 12 oz, $8.50, 3 drinks <script>ignore rules</script>');
  });
});

describe('first-party event handler', () => {
  it('forwards only validated events, server country and privacy flags', async () => {
    const fetcher = successFetcher();
    const incoming = request(batch('chat_ended', { reason: 'security_misuse', turn_count: 1, conversation_id: FLOW }), { referer: 'https://starbucks.utf.sh/?email=private' });
    Object.defineProperty(incoming, 'cf', { value: { country: 'SG', city: 'Singapore', latitude: 1.3, longitude: 103.8 } });
    const result = await createAnalyticsHandler(fetcher)({ request: incoming, env: ENV });
    expect(result.status).toBe(204);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://us.i.posthog.com/batch/');
    const payload = JSON.parse(String(init?.body));
    expect(payload).toEqual({
      api_key: ENV.POSTHOG_PROJECT_KEY,
      batch: [{
        event: 'chat_ended', distinct_id: SESSION, timestamp: '2026-10-03T07:00:00.000Z',
        properties: {
          reason: 'security_misuse', turn_count: 1, conversation_id: FLOW,
          $process_person_profile: false, $geoip_disable: true, $ip: '0.0.0.0',
          $session_id: SESSION, $insert_id: EVENT,
          app: 'starbucks-drink-finder', environment: 'production', country_code: 'SG', is_test: false,
        },
      }],
    });
    expect(String(init?.body)).not.toContain('192.0.2.5');
    expect(String(init?.body)).not.toContain('Singapore');
    expect(String(init?.body)).not.toContain('email=private');
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it('marks a smoke batch as test traffic only when the explicit test header is present', async () => {
    const fetcher = successFetcher();
    const handler = createAnalyticsHandler(fetcher);
    expect((await handler({ request: request(batch(), { 'X-Analytics-Test': '1' }), env: ENV })).status).toBe(204);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).batch[0].properties.is_test).toBe(true);
    expect((await handler({ request: request(batch(), { 'X-Analytics-Test': 'true' }), env: ENV })).status).toBe(204);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).batch[0].properties.is_test).toBe(false);
  });

  it.each([undefined, 'sg', 'Singapore', 'S1', 'SG\ncity'])('does not forward invalid country metadata %s', async (country) => {
    const fetcher = successFetcher();
    const incoming = request();
    Object.defineProperty(incoming, 'cf', { value: { country } });
    expect((await createAnalyticsHandler(fetcher)({ request: incoming, env: ENV })).status).toBe(204);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).batch[0].properties.country_code).toBe('unknown');
  });

  it.each(['dnt', 'sec-gpc'])('honours a browser privacy signal without forwarding', async (header) => {
    const fetcher = successFetcher();
    const result = await createAnalyticsHandler(fetcher)({ request: request({}, { [header]: '1' }), env: ENV });
    expect(result.status).toBe(204);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['https://other.example/api/events', { origin: 'https://other.example' }],
    ['http://starbucks.utf.sh/api/events', { origin: 'http://starbucks.utf.sh' }],
    ['https://preview.starbucks-drink-finder.pages.dev/api/events', {}],
    ['https://starbucks.utf.sh/api/events', { origin: 'https://other.example' }],
    ['https://starbucks.utf.sh/api/events', { 'sec-fetch-site': 'cross-site' }],
    ['http://127.0.0.1:8788/api/events', {}],
  ])('rejects foreign, preview or ordinary local requests at %s', async (url, headers) => {
    const fetcher = successFetcher();
    expect((await createAnalyticsHandler(fetcher)({ request: request(batch(), headers, url), env: ENV })).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires a matching browser Origin', async () => {
    const fetcher = successFetcher();
    const incoming = request();
    incoming.headers.delete('origin');
    expect((await createAnalyticsHandler(fetcher)({ request: incoming, env: ENV })).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('supports a local validation-only mode without sending real PostHog traffic', async () => {
    const fetcher = successFetcher();
    const env = { ...ENV, ANALYTICS_TEST_MODE: '1' };
    expect((await createAnalyticsHandler(fetcher)({ request: request(batch(), {}, 'http://127.0.0.1:8788/api/events'), env })).status).toBe(204);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('still validates locally in test mode', async () => {
    const fetcher = successFetcher();
    expect((await createAnalyticsHandler(fetcher)({ request: request(batch('anything', {}), {}, 'http://localhost:8788/api/events'), env: { ANALYTICS_TEST_MODE: '1' } })).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not pretend to save feedback when the project key is missing', async () => {
    const fetcher = successFetcher();
    expect((await createAnalyticsHandler(fetcher)({ request: request(), env: {} })).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects non-POST methods and does not offer cross-origin CORS', async () => {
    const fetcher = successFetcher();
    const result = await createAnalyticsHandler(fetcher)({ request: new Request('https://starbucks.utf.sh/api/events'), env: ENV });
    expect(result.status).toBe(405);
    expect(result.headers.get('allow')).toBe('POST');
    expect(result.headers.has('access-control-allow-origin')).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects wrong content types, malformed JSON and malformed UTF-8', async () => {
    const fetcher = successFetcher();
    const handler = createAnalyticsHandler(fetcher);
    expect((await handler({ request: request(batch(), { 'content-type': 'text/plain' }), env: ENV })).status).toBe(400);
    for (const body of ['{', new Uint8Array([0xff])]) {
      const incoming = new Request('https://starbucks.utf.sh/api/events', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://starbucks.utf.sh' }, body });
      expect((await handler({ request: incoming, env: ENV })).status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects oversized declared and undeclared bodies before forwarding', async () => {
    const fetcher = successFetcher();
    const handler = createAnalyticsHandler(fetcher);
    expect((await handler({ request: request(batch(), { 'content-length': '12289' }), env: ENV })).status).toBe(413);
    const incoming = new Request('https://starbucks.utf.sh/api/events', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://starbucks.utf.sh' }, body: ' '.repeat(12_289),
    });
    expect((await handler({ request: incoming, env: ENV })).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects one invalid event without partially forwarding its batch', async () => {
    const fetcher = successFetcher();
    const value = batch();
    const events = [...value.events, { ...value.events[0], id: FLOW, properties: { referral_source: 'direct', device: 'mobile', ip: 'private' } }];
    expect((await createAnalyticsHandler(fetcher)({ request: request({ ...value, events }), env: ENV })).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('turns provider rejection or network failure into a bounded feedback error', async () => {
    for (const fetcher of [vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 })), vi.fn<typeof fetch>().mockRejectedValue(new Error('network'))]) {
      expect((await createAnalyticsHandler(fetcher)({ request: request(), env: ENV })).status).toBe(503);
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });

  it('aborts a slow provider after four seconds', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const pending = createAnalyticsHandler(fetcher)({ request: request(), env: ENV });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await pending).status).toBe(503);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('bounds per-visitor batches and permits another batch after the minute resets', async () => {
    const fetcher = successFetcher();
    let time = 1_000;
    const handler = createAnalyticsHandler(fetcher, () => time);
    for (let count = 0; count < 60; count += 1) expect((await handler({ request: request(), env: ENV })).status).toBe(204);
    const throttled = await handler({ request: request(), env: ENV });
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('retry-after')).toBe('60');
    time += 60_000;
    expect((await handler({ request: request(), env: ENV })).status).toBe(204);
    expect(fetcher).toHaveBeenCalledTimes(61);
  });

  it('bounds total forwarding even when each visitor sends one batch', async () => {
    const fetcher = successFetcher();
    const handler = createAnalyticsHandler(fetcher, () => 0);
    for (let count = 0; count < 600; count += 1) {
      expect((await handler({ request: request(batch(), { 'cf-connecting-ip': `test-${count}` }), env: ENV })).status).toBe(204);
    }
    expect((await handler({ request: request(batch(), { 'cf-connecting-ip': 'another' }), env: ENV })).status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(600);
  });
});
