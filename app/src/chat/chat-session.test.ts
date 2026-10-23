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
});
