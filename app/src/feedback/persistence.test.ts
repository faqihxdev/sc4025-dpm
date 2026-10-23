import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let local: Map<string, string>;
let session: Map<string, string>;
const responseId = '6873b2f4-59ce-4fa6-8a64-7d4c3572a271';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
  local = new Map();
  session = new Map();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => { local.set(key, value); },
    },
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => { session.set(key, value); },
    },
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('feedback state', () => {

  it('keeps feedback independent of demo state and never stores a written comment', async () => {
    const feedback = await import('./persistence');
    session.set('sc4025-drink-finder:v2', '{"cart":[]}');
    feedback.noteFeedbackVote('yes', responseId);
    const saved = JSON.parse(local.get(feedback.FEEDBACK_STORAGE_KEY)!);
    expect(Object.keys(saved).sort()).toEqual(['dismissedUntil', 'questionVersion', 'responseId', 'vote']);
    session.delete('sc4025-drink-finder:v2');
    expect(feedback.isFeedbackPromptEligible()).toBe(false);
  });
});

describe('quiet feedback prompting', () => {
  it('shows at most once in a tab, including after refresh', async () => {
    const feedback = await import('./persistence');
    feedback.markFeedbackPromptShown();
    expect(feedback.isFeedbackPromptEligible()).toBe(false);
    vi.resetModules();
    const refreshed = await import('./persistence');
    expect(refreshed.isFeedbackPromptEligible()).toBe(false);
    expect(local.size).toBe(0);
  });

  it('persists a seven-day dismissal cooldown across new tabs and then permits a new session', async () => {
    const feedback = await import('./persistence');
    feedback.dismissFeedbackPrompt();
    const until = Date.now() + feedback.FEEDBACK_DISMISS_COOLDOWN_MS;
    expect(feedback.readFeedbackState().dismissedUntil).toBe(until);
    session.clear();
    vi.resetModules();
    const newTab = await import('./persistence');
    vi.setSystemTime(until - 1);
    expect(newTab.isFeedbackPromptEligible()).toBe(false);
    vi.setSystemTime(until);
    expect(newTab.isFeedbackPromptEligible()).toBe(true);
  });

  it('stays quiet with blocked storage but still keeps manual votes in memory', async () => {
    vi.stubGlobal('window', {
      get localStorage() { throw new Error('Blocked'); },
      get sessionStorage() { throw new Error('Blocked'); },
    });
    const feedback = await import('./persistence');
    expect(feedback.isFeedbackPromptEligible()).toBe(false);
    const id = feedback.getFeedbackResponseId();
    expect(() => feedback.noteFeedbackVote('no', id)).not.toThrow();
    expect(feedback.readFeedbackState()).toMatchObject({ responseId: id, vote: 'no' });
    expect(feedback.isFeedbackPromptEligible()).toBe(false);
  });
});
