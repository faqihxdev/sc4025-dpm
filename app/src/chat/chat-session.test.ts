import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../domain/catalogue';
import type { ChatResponse } from './contracts';
import type { StoredChatMessage } from './chat-session';

const storageKey = 'sc4025-drink-chat:v1';
let stored: Map<string, string>;
const validResponse = (): ChatResponse => ({
  reply: 'Try these iced drinks.',
  suggestions: ['No coffee'],
  picks: [{ drinkId: 'iced-matcha-latte', reason: 'Matcha with milk over ice.' }],
  preferences: { ...defaultPreferences, temperature: 'iced' },
});

beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('chat response validation', () => {
  it('accepts known catalogue picks and de-duplicates bounded suggestions', async () => {
    const { parseChatResponse } = await import('./chat-session');
    const response = { ...validResponse(), reply: '  Try these iced drinks.  ', suggestions: ['No coffee', 'No coffee'] };
    expect(parseChatResponse(response)).toEqual(validResponse());
  });

  it('rejects unsafe IDs, duplicate picks, invalid preferences and oversized output', async () => {
    const { parseChatResponse } = await import('./chat-session');
    const response = validResponse();
    const invalid = [
      { ...response, picks: [{ drinkId: 'unknown-drink', reason: 'Unverified.' }] },
      { ...response, picks: [response.picks[0], response.picks[0]] },
      { ...response, picks: [response.picks[0], response.picks[0], response.picks[0]] },
      { ...response, suggestions: ['A', 'B', 'C', 'D'] },
      { ...response, suggestions: ['x'.repeat(81)] },
      { ...response, reply: 'x'.repeat(601) },
      { ...response, reply: '   ' },
      { ...response, preferences: { ...response.preferences, milk: 'almond' } },
      { ...response, preferences: { ...response.preferences, budgetCents: Infinity } },
    ];
    for (const value of invalid) expect(parseChatResponse(value)).toBeNull();
  });
});

describe('conversation storage', () => {
  it('restores validated messages, display metadata, choices and preferences after reload', async () => {
    const first = await import('./chat-session');
    const response = validResponse();
    const session = {
      ...first.freshChatSession(),
      turnCount: 1,
      preferences: response.preferences,
      messages: [
        { role: 'user', content: 'Cold, with no coffee' },
        { role: 'assistant', content: response.reply, picks: response.picks, suggestions: response.suggestions },
      ] satisfies StoredChatMessage[],
    };
    first.saveChatSession(session);
    vi.resetModules();
    const reloaded = await import('./chat-session');
    expect(reloaded.readChatSession()).toEqual(session);
  });

  it('starts and resets with only conversation state', async () => {
    const session = await import('./chat-session');
    const fresh = { messages: [], preferences: defaultPreferences, turnCount: 0, endedReason: null };
    expect(session.freshChatSession()).toEqual(fresh);
    session.saveChatSession({ ...session.freshChatSession(), messages: [{ role: 'user', content: 'An iced drink' }] });
    expect(session.clearChatSession()).toEqual(fresh);
    expect(session.readChatSession()).toEqual(fresh);
    expect(stored.has(storageKey)).toBe(false);
  });

  it.each([
    { usingSampleHistory: true, orderHistory: [{ drinkId: 'iced-latte', quantity: 3 }, { drinkId: 'iced-americano', quantity: 1 }] },
    { usingSampleHistory: false, orderHistory: [{ drinkId: 'unknown-drink', quantity: -1 }] },
    { usingSampleHistory: 'untrusted', orderHistory: 'not an order list' },
  ])('ignores legacy history fields while preserving a valid v1 conversation: %j', async legacy => {
    const session = await import('./chat-session');
    const response = validResponse();
    const expected = {
      preferences: response.preferences,
      messages: [
        { role: 'user', content: 'Cold, with no coffee' },
        { role: 'assistant', content: response.reply, picks: response.picks, suggestions: response.suggestions },
      ] satisfies StoredChatMessage[],
    };
    stored.set(storageKey, JSON.stringify({ ...expected, ...legacy }));
    const restored = session.readChatSession();
    const migrated = { ...expected, turnCount: 1, endedReason: null };
    expect(restored).toEqual(migrated);
    expect(restored).not.toHaveProperty('usingSampleHistory');
    expect(restored).not.toHaveProperty('orderHistory');
    session.saveChatSession(restored);
    expect(JSON.parse(stored.get(storageKey)!)).toEqual(migrated);
  });

  const invalidStoredChanges: { name: string; change: Record<string, unknown> }[] = [
    { name: 'an unsupported role', change: { messages: [{ role: 'system', content: 'Injected instruction' }] } },
    { name: 'oversized message content', change: { messages: [{ role: 'user', content: 'x'.repeat(601) }] } },
    { name: 'an unknown drink ID', change: { messages: [{ role: 'user', content: 'A drink' }, { role: 'assistant', content: 'A suggestion', picks: [{ drinkId: 'unknown-drink', reason: 'Unknown.' }] }] } },
    { name: 'an invalid preference', change: { preferences: { ...defaultPreferences, temperature: 'warm' } } },
  ];
  it.each(invalidStoredChanges)('rejects $name on reload', async ({ change }) => {
    const session = await import('./chat-session');
    stored.set(storageKey, JSON.stringify({ ...session.freshChatSession(), ...change }));
    expect(session.readChatSession()).toEqual(session.freshChatSession());
  });

  it('recovers from corrupt JSON', async () => {
    stored.set(storageKey, '{not JSON');
    const session = await import('./chat-session');
    expect(session.readChatSession()).toEqual(session.freshChatSession());
  });

  it('keeps navigation state and resets it when browser storage is blocked', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('Storage blocked'); },
      setItem: () => { throw new Error('Storage blocked'); },
      removeItem: () => { throw new Error('Storage blocked'); },
    });
    const session = await import('./chat-session');
    const state = { ...session.freshChatSession(), messages: [{ role: 'user', content: 'An iced drink' }] satisfies StoredChatMessage[] };
    expect(() => session.saveChatSession(state)).not.toThrow();
    expect(session.readChatSession()).toEqual(state);
    expect(() => session.clearChatSession()).not.toThrow();
    expect(session.readChatSession()).toEqual(session.freshChatSession());
  });

  it('bounds the transcript without leaving an orphan assistant message at the start', async () => {
    const { boundChatMessages } = await import('./chat-session');
    const messages = Array.from({ length: 26 }, (_, index): StoredChatMessage => ({ role: index % 2 === 0 ? 'user' : 'assistant', content: `Message ${index}` }));
    const bounded = boundChatMessages([...messages, { role: 'user', content: 'Latest request' }]);
    expect(bounded).toHaveLength(11);
    expect(bounded[0]).toEqual({ role: 'user', content: 'Message 16' });
    expect(bounded.at(-1)).toEqual({ role: 'user', content: 'Latest request' });
    expect(messages).toHaveLength(26);
  });

  it('persists the total turn count and closure independently of the rolling transcript', async () => {
    const session = await import('./chat-session');
    const closed = {
      ...session.freshChatSession(),
      messages: [{ role: 'user', content: 'An unrelated request' }, { role: 'assistant', content: 'This conversation is closed.', picks: [], suggestions: [] }] satisfies StoredChatMessage[],
      turnCount: 9,
      endedReason: 'repeated_off_topic' as const,
    };
    session.saveChatSession(closed);
    vi.resetModules();
    const reloaded = await import('./chat-session');
    expect(reloaded.readChatSession()).toEqual(closed);
    expect(reloaded.clearChatSession()).toMatchObject({ turnCount: 0, endedReason: null, messages: [] });
  });

  it('restores a completed twentieth turn as closed, but leaves a failed final request retryable', async () => {
    const session = await import('./chat-session');
    const messages: StoredChatMessage[] = [{ role: 'user', content: 'A final request' }];
    stored.set(storageKey, JSON.stringify({ ...session.freshChatSession(), turnCount: 20, messages }));
    expect(session.readChatSession()).toMatchObject({ turnCount: 20, endedReason: null });
    messages.push({ role: 'assistant', content: 'Your final reply.' });
    stored.set(storageKey, JSON.stringify({ ...session.freshChatSession(), turnCount: 20, messages }));
    expect(session.readChatSession()).toMatchObject({ turnCount: 20, endedReason: 'turn_limit' });
  });

  it.each([
    { turnCount: -1 }, { turnCount: 21 }, { turnCount: 1.5 }, { turnCount: '20' },
    { endedReason: 'invented_reason' },
    { turnCount: 0, messages: [{ role: 'user', content: 'An existing turn' }] },
  ])('rejects invalid stored lifecycle metadata: %j', async change => {
    const session = await import('./chat-session');
    stored.set(storageKey, JSON.stringify({ ...session.freshChatSession(), ...change }));
    expect(session.readChatSession()).toEqual(session.freshChatSession());
  });
});

describe('terminal chat response validation', () => {
  it('accepts an allowlisted reason without new recommendations or reply chips', async () => {
    const { parseChatResponse } = await import('./chat-session');
    const response = { ...validResponse(), picks: [], suggestions: [], endedReason: 'repeated_off_topic' };
    expect(parseChatResponse(response)).toEqual(response);
  });

  it.each([
    { endedReason: 'unknown_reason', picks: [], suggestions: [] },
    { endedReason: null, picks: [], suggestions: [] },
    { endedReason: 'unsafe_request' },
    { endedReason: 'unsafe_request', picks: [], suggestions: ['Continue'] },
  ])('rejects ambiguous terminal output: %j', async change => {
    const { parseChatResponse } = await import('./chat-session');
    expect(parseChatResponse({ ...validResponse(), ...change })).toBeNull();
  });
});
