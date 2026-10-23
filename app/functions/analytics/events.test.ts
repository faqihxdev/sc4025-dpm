import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnalyticsHandler } from '../api/events';
import { validateAnalyticsBatch } from './validation';

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

  it('does not leak the remainder of an escaped quoted secret', () => {
    expect(redactReviewMessage('password="one \\"two\\" three"')).toBe('[secret removed]');
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

  it.each(['dnt', 'sec-gpc'])('honours a browser privacy signal without forwarding', async (header) => {
    const fetcher = successFetcher();
    const result = await createAnalyticsHandler(fetcher)({ request: request({}, { [header]: '1' }), env: ENV });
    expect(result.status).toBe(204);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires a matching browser Origin', async () => {
    const fetcher = successFetcher();
    const incoming = request();
    incoming.headers.delete('origin');
    expect((await createAnalyticsHandler(fetcher)({ request: incoming, env: ENV })).status).toBe(403);
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
