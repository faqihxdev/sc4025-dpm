export const FEEDBACK_QUESTION_VERSION = 1;
export const FEEDBACK_STORAGE_KEY = 'sc4025-drink-feedback:v1';
export const FEEDBACK_PROMPT_SESSION_KEY = 'sc4025-drink-feedback-prompt:v1';
export const FEEDBACK_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type FeedbackVote = 'yes' | 'no';
export interface FeedbackState {
  questionVersion: typeof FEEDBACK_QUESTION_VERSION;
  responseId: string | null;
  vote: FeedbackVote | null;
  dismissedUntil: number;
}

const responseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emptyState = (): FeedbackState => ({ questionVersion: FEEDBACK_QUESTION_VERSION, responseId: null, vote: null, dismissedUntil: 0 });
let memory = emptyState();
let promptShown = false;
let storageUnavailable = false;

function decode(raw: string | null): FeedbackState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)
      || !('questionVersion' in value) || value.questionVersion !== FEEDBACK_QUESTION_VERSION) return null;
    const responseId = 'responseId' in value && typeof value.responseId === 'string' && responseIdPattern.test(value.responseId) ? value.responseId : null;
    return {
      questionVersion: FEEDBACK_QUESTION_VERSION,
      responseId,
      vote: responseId && 'vote' in value && (value.vote === 'yes' || value.vote === 'no') ? value.vote : null,
      dismissedUntil: 'dismissedUntil' in value && typeof value.dismissedUntil === 'number'
        && Number.isFinite(value.dismissedUntil) && value.dismissedUntil > 0 ? value.dismissedUntil : 0,
    };
  } catch { return null; }
}

function save(next: FeedbackState): void {
  memory = next;
  try { window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(next)); }
  catch { storageUnavailable = true; }
}

/** The saved vote is preference state, not an analytics identity or transcript. */
export function readFeedbackState(): FeedbackState {
  try {
    const saved = decode(window.localStorage.getItem(FEEDBACK_STORAGE_KEY));
    if (saved) memory = saved;
  } catch { storageUnavailable = true; }
  return { ...memory };
}

export function isFeedbackPromptEligible(): boolean {
  const state = readFeedbackState();
  try { promptShown ||= window.sessionStorage.getItem(FEEDBACK_PROMPT_SESSION_KEY) === 'shown'; }
  catch { storageUnavailable = true; }
  return !storageUnavailable && !promptShown && !state.vote && state.dismissedUntil <= Date.now();
}

export function markFeedbackPromptShown(): void {
  promptShown = true;
  try { window.sessionStorage.setItem(FEEDBACK_PROMPT_SESSION_KEY, 'shown'); }
  catch { storageUnavailable = true; }
}

export function dismissFeedbackPrompt(): void {
  markFeedbackPromptShown();
  save({ ...readFeedbackState(), dismissedUntil: Date.now() + FEEDBACK_DISMISS_COOLDOWN_MS });
}

/** Revisions share one response ID so a second vote does not count as a new respondent. */
export function getFeedbackResponseId(): string {
  const state = readFeedbackState();
  if (state.responseId) return state.responseId;
  const responseId = crypto.randomUUID();
  save({ ...state, responseId });
  return responseId;
}

/** Call only after the event endpoint acknowledges the vote. */
export function noteFeedbackVote(vote: FeedbackVote, responseId: string): void {
  if ((vote !== 'yes' && vote !== 'no') || !responseIdPattern.test(responseId)) return;
  save({ ...readFeedbackState(), responseId, vote });
  markFeedbackPromptShown();
}
