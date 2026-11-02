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
  const state = { hostname: 'sbx.utf.sh', visible: true, privacy: false, width: 390, referrer: '' };
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
  it.each(['localhost', '127.0.0.1', 'a4f1d870.fmd-a5f.pages.dev', 'sbx.utf.sh.example.com'])('does not send from %s', async hostname => {
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
});

describe('flows and conversation stops', () => {

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
});
