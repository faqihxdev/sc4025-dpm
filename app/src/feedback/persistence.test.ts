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
  it('does not create an analytics identity just to check eligibility', async () => {
    const feedback = await import('./persistence');
    expect(feedback.readFeedbackState()).toEqual({ questionVersion: 1, responseId: null, vote: null, dismissedUntil: 0 });
    expect(feedback.isFeedbackPromptEligible()).toBe(true);
    expect(local.size).toBe(0);
    expect(session.size).toBe(0);
  });

  it('keeps one response ID when a visitor revises a vote or opens another tab', async () => {
    const feedback = await import('./persistence');
    const id = feedback.getFeedbackResponseId();
    expect(id).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i);
    feedback.noteFeedbackVote('yes', id);
    feedback.noteFeedbackVote('no', id);
    session.clear();
    vi.resetModules();
    const newTab = await import('./persistence');
    expect(newTab.getFeedbackResponseId()).toBe(id);
    expect(newTab.readFeedbackState().vote).toBe('no');
    expect(newTab.isFeedbackPromptEligible()).toBe(false);
  });

  it.each(['yes', 'no'] as const)('never automatically asks again after an acknowledged %s vote', async vote => {
    const feedback = await import('./persistence');
    feedback.noteFeedbackVote(vote, responseId);
    expect(feedback.isFeedbackPromptEligible()).toBe(false);
    vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);
    session.clear();
    vi.resetModules();
    const reopened = await import('./persistence');
    expect(reopened.isFeedbackPromptEligible()).toBe(false);
    expect(reopened.readFeedbackState()).toMatchObject({ responseId, vote });
  });

  it('keeps the response available when no vote has been acknowledged', async () => {
    const feedback = await import('./persistence');
    feedback.getFeedbackResponseId();
    expect(feedback.readFeedbackState().vote).toBeNull();
    expect(feedback.isFeedbackPromptEligible()).toBe(true);
  });

  it('keeps feedback independent of demo state and never stores a written comment', async () => {
    const feedback = await import('./persistence');
    session.set('sc4025-drink-finder:v2', '{"cart":[]}');
    feedback.noteFeedbackVote('yes', responseId);
    const saved = JSON.parse(local.get(feedback.FEEDBACK_STORAGE_KEY)!);
    expect(Object.keys(saved).sort()).toEqual(['dismissedUntil', 'questionVersion', 'responseId', 'vote']);
    session.delete('sc4025-drink-finder:v2');
    expect(feedback.isFeedbackPromptEligible()).toBe(false);
  });

  it.each([null, '', '{', '[]', 'null', '{"questionVersion":0}', '{"questionVersion":2}', '{"questionVersion":"1"}'])('ignores corrupt or another-version state: %s', async raw => {
    const feedback = await import('./persistence');
    if (raw !== null) local.set(feedback.FEEDBACK_STORAGE_KEY, raw);
    expect(feedback.readFeedbackState()).toEqual({ questionVersion: 1, responseId: null, vote: null, dismissedUntil: 0 });
    expect(feedback.isFeedbackPromptEligible()).toBe(true);
  });

  it('drops unknown fields and invalid values instead of accepting forged preference state', async () => {
    const feedback = await import('./persistence');
    local.set(feedback.FEEDBACK_STORAGE_KEY, JSON.stringify({ questionVersion: 1, responseId: 'somebody@email.test', vote: 'yes', dismissedUntil: -10, comment: 'Private text', chat: 'Transcript' }));
    expect(feedback.readFeedbackState()).toEqual({ questionVersion: 1, responseId: null, vote: null, dismissedUntil: 0 });
    feedback.getFeedbackResponseId();
    expect(local.get(feedback.FEEDBACK_STORAGE_KEY)).not.toContain('Private text');
    expect(local.get(feedback.FEEDBACK_STORAGE_KEY)).not.toContain('Transcript');
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

  it('allows another session if the prompt was neither dismissed nor answered', async () => {
    const feedback = await import('./persistence');
    feedback.markFeedbackPromptShown();
    session.clear();
    vi.resetModules();
    const newTab = await import('./persistence');
    expect(newTab.isFeedbackPromptEligible()).toBe(true);
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

  it('does not nag again after a storage write fails', async () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } },
      sessionStorage: { getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } },
    });
    const feedback = await import('./persistence');
    feedback.dismissFeedbackPrompt();
    expect(feedback.isFeedbackPromptEligible()).toBe(false);
    expect(feedback.readFeedbackState().dismissedUntil).toBeGreaterThan(Date.now());
  });

  it('does not throw or show an automatic prompt outside a browser', async () => {
    vi.stubGlobal('window', undefined);
    const feedback = await import('./persistence');
    expect(feedback.isFeedbackPromptEligible()).toBe(false);
    expect(feedback.readFeedbackState().vote).toBeNull();
  });
});
