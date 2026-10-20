import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalytics } from './client';
import type { AnalyticsEnvelope, AnalyticsEnvironment } from './client';

const RESPONSE_ID = '00000000-0000-4000-8000-000000009000';
const CONVERSATION_ID = '00000000-0000-4000-8000-000000009001';
const store = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

function fixture() {
  let counter = 1;
  const state = { hostname: 'starbucks.utf.sh', visible: true, privacy: false, width: 390, referrer: '' };
  const storage = store();
  const preferenceStorage = store();
  const listeners = { activity: new Set<() => void>(), visibility: new Set<() => void>(), pagehide: new Set<() => void>(), preference: new Set<() => void>() };
  const transport = vi.fn<(envelope: AnalyticsEnvelope, keepalive: boolean) => Promise<boolean>>().mockResolvedValue(true);
  const on = (type: keyof typeof listeners, listener: () => void) => { listeners[type].add(listener); return () => { listeners[type].delete(listener); }; };
  const environment: AnalyticsEnvironment = {
    hostname: () => state.hostname,
    now: () => Date.now(),
    uuid: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`,
    sessionStorage: storage,
    localStorage: preferenceStorage,
    referrer: () => state.referrer,
    viewportWidth: () => state.width,
    privacySignal: () => state.privacy,
    visible: () => state.visible,
    onActivity: listener => on('activity', listener),
    onVisibility: listener => on('visibility', listener),
    onPageHide: listener => on('pagehide', listener),
    onPreferenceChange: listener => on('preference', listener),
    schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => { clearTimeout(timer); }; },
    every: (callback, ms) => { const timer = setInterval(callback, ms); return () => { clearInterval(timer); }; },
    transport,
  };
  const emit = (type: keyof typeof listeners) => { listeners[type].forEach(listener => listener()); };
  const events = () => transport.mock.calls.flatMap(([envelope]) => envelope.events);
  const drain = () => vi.advanceTimersByTimeAsync(1000);
  return { state, storage, preferenceStorage, environment, transport, emit, events, drain, client: createAnalytics(environment) };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T00:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('explicit telemetry and privacy', () => {
  it.each(['localhost', '127.0.0.1', 'a4f1d870.starbucks-drink-finder.pages.dev', 'starbucks.utf.sh.example.com'])('does not send from %s', async hostname => {
    const f = fixture();
    f.state.hostname = hostname;
    const stop = f.client.start();
    f.client.feature('chat');
    f.client.chatEnded('unsafe_request', 2, CONVERSATION_ID);
    expect(await f.client.submitVote('yes', RESPONSE_ID)).toBe(false);
    await f.drain();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.storage.values.size).toBe(0);
    stop();
  });

  it('respects a browser privacy signal even after an explicit enable', async () => {
    const f = fixture();
    f.state.privacy = true;
    f.client.setEnabled(true);
    const stop = f.client.start();
    f.client.feature('chat');
    await f.drain();
    expect(f.client.isEnabled()).toBe(false);
    expect(f.transport).not.toHaveBeenCalled();
    stop();
  });

  it('persists opt-out, clears queued events, and resumes only when enabled', async () => {
    const f = fixture();
    const stop = f.client.start();
    f.client.feature('chat');
    f.client.setEnabled(false);
    await f.drain();
    expect(f.transport).not.toHaveBeenCalled();
    const reloaded = createAnalytics(f.environment);
    expect(reloaded.isEnabled()).toBe(false);
    f.client.setEnabled(true);
    f.client.feature('menu');
    await f.drain();
    expect(f.events().map(event => event.name)).toEqual(['feature_used']);
    stop();
  });

  it('deduplicates visit and feature events across reloads without a persistent visitor identifier', async () => {
    const f = fixture();
    const stop = f.client.start();
    f.client.feature('chat');
    f.client.feature('chat');
    await f.drain();
    stop();
    const reloaded = createAnalytics(f.environment);
    const stopAgain = reloaded.start();
    reloaded.feature('chat');
    reloaded.feature('quick_choices');
    await f.drain();
    expect(f.events().map(event => event.name)).toEqual(['visit_started', 'feature_used', 'feature_used']);
    const sessionIds = f.transport.mock.calls.map(([envelope]) => envelope.sessionId);
    expect(new Set(sessionIds).size).toBe(1);
    expect(f.preferenceStorage.values.size).toBe(0);
    stopAgain();
  });

  it('honours opt-out in another tab and notifies the settings subscriber', async () => {
    const f = fixture();
    const stop = f.client.start();
    const notified = vi.fn();
    const unsubscribe = f.client.subscribe(notified);
    f.preferenceStorage.setItem('sc4025-analytics-opt-out:v1', '1');
    f.emit('preference');
    f.client.feature('chat');
    await f.drain();
    expect(f.client.isEnabled()).toBe(false);
    expect(f.transport).not.toHaveBeenCalled();
    expect(notified).toHaveBeenCalledTimes(1);
    unsubscribe();
    stop();
  });

  it('reduces referrers to categories and device width to a label', async () => {
    const f = fixture();
    f.state.referrer = 'https://www.google.com/search?q=sensitive-query&email=example@example.com';
    f.state.width = 1200;
    const stop = f.client.start();
    await f.drain();
    expect(f.events()[0].properties).toEqual({ referral_source: 'search', device: 'desktop' });
    const serialized = JSON.stringify(f.transport.mock.calls);
    expect(serialized).not.toContain('sensitive-query');
    expect(serialized).not.toContain('example@example.com');
    expect(serialized).not.toContain('google.com');
    stop();
  });

  it.each([
    ['', 'direct'], ['https://t.co/private', 'social'], ['https://www.facebook.com/profile?id=123', 'social'],
    ['https://example.com/private', 'other'], ['invalid', 'other'],
  ])('categorizes %s without transmitting the URL', async (referrer, expected) => {
    const f = fixture();
    f.state.referrer = referrer;
    const stop = f.client.start();
    await f.drain();
    expect(f.events()[0].properties.referral_source).toBe(expected);
    stop();
  });

  it('works in memory when storage is unavailable and fails quietly without secure random IDs', async () => {
    const f = fixture();
    const denied = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const client = createAnalytics({ ...f.environment, sessionStorage: denied, localStorage: denied });
    const stop = client.start();
    client.feature('menu');
    await f.drain();
    expect(f.events()).toHaveLength(2);
    stop();
    f.transport.mockClear();
    const noRandom = createAnalytics({ ...f.environment, uuid: () => null });
    const stopNoRandom = noRandom.start();
    noRandom.feature('chat');
    await f.drain();
    expect(f.transport).not.toHaveBeenCalled();
    stopNoRandom();
  });
});

describe('flows and conversation stops', () => {
  it('ties recommendations and a single completion to each guided attempt', async () => {
    const f = fixture();
    const stop = f.client.start();
    f.client.beginFlow('quick_choices');
    f.client.recommendations('quick_choices', 3);
    f.client.complete('quick_choices');
    f.client.complete('quick_choices');
    f.client.beginFlow('quick_choices');
    f.client.recommendations('quick_choices', 1);
    f.client.complete('quick_choices');
    await f.drain();
    const flowEvents = f.events().filter(event => 'flow_id' in event.properties);
    expect(flowEvents.map(event => event.name)).toEqual([
      'finder_started', 'recommendations_shown', 'flow_completed',
      'finder_started', 'recommendations_shown', 'flow_completed',
    ]);
    expect(flowEvents[0].properties.flow_id).toBe(flowEvents[2].properties.flow_id);
    expect(flowEvents[3].properties.flow_id).toBe(flowEvents[5].properties.flow_id);
    expect(flowEvents[0].properties.flow_id).not.toBe(flowEvents[3].properties.flow_id);
    stop();
  });

  it('makes menu additions separate implicit flows', async () => {
    const f = fixture();
    const stop = f.client.start();
    f.client.complete('menu');
    f.client.complete('menu');
    await f.drain();
    const completed = f.events().filter(event => event.name === 'flow_completed');
    expect(completed).toHaveLength(2);
    expect(completed[0].properties.flow_id).not.toBe(completed[1].properties.flow_id);
    stop();
  });

  it('records only the bounded reason and turn count once per conversation, including after reload', async () => {
    const f = fixture();
    const stop = f.client.start();
    f.client.chatEnded('repeated_off_topic', 3, CONVERSATION_ID);
    f.client.chatEnded('repeated_off_topic', 3, CONVERSATION_ID);
    f.client.chatEnded('turn_limit', 21, RESPONSE_ID);
    f.client.chatEnded('unsafe_request', 0, RESPONSE_ID);
    f.client.chatEnded('security_misuse', 2, 'not-an-id');
    await f.drain();
    stop();
    const reloaded = createAnalytics(f.environment);
    const stopReloaded = reloaded.start();
    reloaded.chatEnded('repeated_off_topic', 3, CONVERSATION_ID);
    await f.drain();
    const ended = f.events().filter(event => event.name === 'chat_ended');
    expect(ended).toHaveLength(1);
    expect(ended[0].properties).toEqual({ reason: 'repeated_off_topic', turn_count: 3, conversation_id: CONVERSATION_ID });
    stopReloaded();
  });

  it('accepts bounded review excerpts only for misuse stops, never turn limits', async () => {
    const f = fixture();
    const stop = f.client.start();
    f.client.chatEnded('security_misuse', 3, CONVERSATION_ID, ['Earlier', 'One', 'Two', 'x'.repeat(800)]);
    f.client.chatEnded('turn_limit', 20, RESPONSE_ID, ['Do not collect this']);
    await f.drain();
    const ended = f.events().filter(event => event.name === 'chat_ended');
    expect(ended[0].properties.review_messages).toEqual(['One', 'Two', 'x'.repeat(600)]);
    expect(ended[1].properties).not.toHaveProperty('review_messages');
    stop();
  });
});

describe('active time and delivery', () => {
  it('does not count idle or background time as engagement', async () => {
    const f = fixture();
    const stop = f.client.start();
    await vi.advanceTimersByTimeAsync(90_000);
    f.state.visible = false;
    f.emit('visibility');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(f.events().some(event => event.name === 'active_time_120s')).toBe(false);
    const saved = JSON.parse([...f.storage.values.values()][0]) as { activeMilliseconds: number };
    expect(saved.activeMilliseconds).toBe(30_000);
    stop();
  });

  it('accumulates active time across refresh and emits the two-minute event once', async () => {
    const f = fixture();
    const stop = f.client.start();
    for (let n = 0; n < 3; n += 1) { await vi.advanceTimersByTimeAsync(20_000); f.emit('activity'); }
    stop();
    const reloaded = createAnalytics(f.environment);
    const stopReloaded = reloaded.start();
    for (let n = 0; n < 7; n += 1) { await vi.advanceTimersByTimeAsync(20_000); f.emit('activity'); }
    await f.drain();
    expect(f.events().filter(event => event.name === 'active_time_120s')).toHaveLength(1);
    expect(f.events().find(event => event.name === 'active_time_120s')?.properties).toEqual({ active_seconds: 120 });
    stopReloaded();
  });

  it('caps queue size, batches ten events, and does not retry failed batches', async () => {
    const f = fixture();
    f.transport.mockResolvedValue(false);
    const stop = f.client.start();
    for (let n = 0; n < 100; n += 1) f.client.view('menu');
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.transport).toHaveBeenCalledTimes(4);
    expect(f.transport.mock.calls.every(([envelope]) => envelope.events.length <= 10)).toBe(true);
    expect(f.events()).toHaveLength(40);
    expect(new Set(f.events().map(event => event.id)).size).toBe(40);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.transport).toHaveBeenCalledTimes(4);
    stop();
  });

  it('partitions large non-ASCII chat reviews by UTF-8 bytes without dropping other events', async () => {
    const f = fixture();
    const stop = f.client.start();
    f.client.feature('chat');
    for (let n = 0; n < 6; n += 1) {
      const id = `00000000-0000-4000-8000-${String(9000 + n).padStart(12, '0')}`;
      const text = n % 2 ? '😀'.repeat(300) : '饮'.repeat(600);
      f.client.chatEnded('security_misuse', 3, id, [text, text, text]);
    }
    f.client.view('menu');
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.events().filter(event => event.name === 'chat_ended')).toHaveLength(6);
    expect(f.events().map(event => event.name)).toEqual([
      'visit_started', 'feature_used', ...Array<string>(6).fill('chat_ended'), 'drink_viewed',
    ]);
    expect(f.transport.mock.calls.length).toBeGreaterThan(1);
    for (const [envelope] of f.transport.mock.calls) {
      expect(envelope.events.length).toBeLessThanOrEqual(10);
      expect(new TextEncoder().encode(JSON.stringify(envelope)).byteLength).toBeLessThanOrEqual(12_288);
    }
    expect(new Set(f.events().map(event => event.id)).size).toBe(9);
    stop();
  });

  it('submits feedback immediately and reports success only after the endpoint acknowledges it', async () => {
    const f = fixture();
    expect(await f.client.submitVote('yes', RESPONSE_ID)).toBe(true);
    expect(f.events()[0].properties).toEqual({ vote: 'yes', response_id: RESPONSE_ID, question_version: 1 });
    expect(await f.client.submitComment('yes', RESPONSE_ID, '  Useful idea  ')).toBe(true);
    expect(f.events()[1].properties.comment).toBe('Useful idea');
    f.transport.mockResolvedValue(false);
    expect(await f.client.submitVote('no', RESPONSE_ID)).toBe(false);
    f.transport.mockRejectedValue(new Error('offline'));
    expect(await f.client.submitComment('no', RESPONSE_ID, 'Did not help')).toBe(false);
    expect(await f.client.submitComment('no', RESPONSE_ID, '')).toBe(false);
    expect(await f.client.submitComment('no', RESPONSE_ID, 'x'.repeat(501))).toBe(false);
    expect(await f.client.submitVote('yes', 'not-an-id')).toBe(false);
  });

  it('uses keepalive on page hide and removes listeners on cleanup', async () => {
    const f = fixture();
    const stop = f.client.start();
    f.emit('pagehide');
    await Promise.resolve();
    expect(f.transport.mock.calls[0][1]).toBe(true);
    stop();
    f.transport.mockClear();
    f.emit('activity');
    f.emit('visibility');
    f.emit('pagehide');
    await f.drain();
    expect(f.transport).not.toHaveBeenCalled();
  });
});
