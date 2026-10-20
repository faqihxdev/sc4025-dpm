import { CHAT_END_REASONS } from '../chat/contracts';
import { isFeedbackPreview } from '../feedback/preview';
import type { ChatEndReason } from '../chat/contracts';

export type AnalyticsSource = 'menu' | 'quick_choices' | 'chat';
export type FeedbackVote = 'yes' | 'no';

type EventName = 'visit_started' | 'feature_used' | 'finder_started' | 'recommendations_shown'
  | 'drink_viewed' | 'flow_completed' | 'active_time_120s' | 'idea_feedback' | 'feedback_comment' | 'chat_ended';
interface AnalyticsEvent {
  id: string;
  name: EventName;
  properties: Record<string, string | number | string[]>;
  timestamp: string;
}
export interface AnalyticsEnvelope { sessionId: string; events: AnalyticsEvent[] }

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface AnalyticsEnvironment {
  hostname: () => string;
  now: () => number;
  uuid: () => string | null;
  sessionStorage?: StorageLike;
  localStorage?: StorageLike;
  referrer: () => string;
  viewportWidth: () => number;
  privacySignal: () => boolean;
  visible: () => boolean;
  onActivity: (listener: () => void) => () => void;
  onVisibility: (listener: () => void) => () => void;
  onPageHide: (listener: () => void) => () => void;
  onPreferenceChange?: (listener: () => void) => () => void;
  schedule: (callback: () => void, milliseconds: number) => () => void;
  every: (callback: () => void, milliseconds: number) => () => void;
  transport: (envelope: AnalyticsEnvelope, keepalive: boolean) => Promise<boolean>;
}

const SESSION_KEY = 'sc4025-analytics-session:v1';
const OPT_OUT_KEY = 'sc4025-analytics-opt-out:v1';
const SOURCES: AnalyticsSource[] = ['menu', 'quick_choices', 'chat'];
const PRODUCTION_HOSTS = ['starbucks.utf.sh', 'starbucks-drink-finder.pages.dev'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUEUE = 40;
const MAX_ENVELOPE_BYTES = 12_288;
const ACTIVE_TARGET = 120_000;
const IDLE_AFTER = 30_000;

interface Flow { id: string; completed: boolean }
interface Session {
  id: string;
  visited: boolean;
  features: AnalyticsSource[];
  activeMilliseconds: number;
  activeReached: boolean;
  endedConversations: string[];
  flows: Partial<Record<AnalyticsSource, Flow>>;
}

function read(storage: StorageLike | undefined, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
function write(storage: StorageLike | undefined, key: string, value: string): void {
  try { storage?.setItem(key, value); } catch { /* Storage is optional. */ }
}
function restoreSession(storage: StorageLike | undefined): Session | null {
  try {
    const value: unknown = JSON.parse(read(storage, SESSION_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const session = value as Partial<Session>;
    if (typeof session.id !== 'string' || !UUID.test(session.id)) return null;
    const flows: Session['flows'] = {};
    for (const source of SOURCES) {
      const flow = session.flows?.[source];
      if (flow && typeof flow.id === 'string' && UUID.test(flow.id) && typeof flow.completed === 'boolean') flows[source] = flow;
    }
    return {
      id: session.id,
      visited: session.visited === true,
      features: Array.isArray(session.features) ? SOURCES.filter(source => session.features?.includes(source)) : [],
      activeMilliseconds: typeof session.activeMilliseconds === 'number' && Number.isFinite(session.activeMilliseconds)
        ? Math.min(ACTIVE_TARGET, Math.max(0, session.activeMilliseconds)) : 0,
      activeReached: session.activeReached === true,
      endedConversations: Array.isArray(session.endedConversations)
        ? session.endedConversations.filter((id): id is string => typeof id === 'string' && UUID.test(id)).slice(-20) : [],
      flows,
    };
  } catch { return null; }
}

function referralCategory(referrer: string): 'direct' | 'search' | 'social' | 'other' {
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (/^(?:www\.)?(?:google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|yahoo\.com|baidu\.com)$/.test(host)) return 'search';
    if (/(^|\.)(?:facebook\.com|instagram\.com|t\.co|twitter\.com|x\.com|tiktok\.com|reddit\.com|linkedin\.com|youtube\.com|wa\.me|whatsapp\.com|telegram\.me|t\.me)$/.test(host)) return 'social';
    return 'other';
  } catch { return 'other'; }
}

/** Explicit events only. User text is accepted only for feedback or a permitted chat-stop review. */
export function createAnalytics(environment: AnalyticsEnvironment) {
  let optOut = read(environment.localStorage, OPT_OUT_KEY) === '1';
  let session: Session | null = null;
  let queue: AnalyticsEvent[] = [];
  let cancelFlush: (() => void) | undefined;
  let flushing = false;
  let starts = 0;
  let cleanupListeners: (() => void) | undefined;
  let lastTick = environment.now();
  let lastActivity = lastTick;
  let wasVisible = environment.visible();
  const subscribers = new Set<() => void>();

  const isEnabled = () => {
    const stored = read(environment.localStorage, OPT_OUT_KEY);
    if (stored === '1' || stored === '0') optOut = stored === '1';
    return !optOut && !environment.privacySignal() && PRODUCTION_HOSTS.includes(environment.hostname());
  };
  const save = () => { if (session) write(environment.sessionStorage, SESSION_KEY, JSON.stringify(session)); };
  const newId = () => {
    const id = environment.uuid();
    return id && UUID.test(id) ? id : null;
  };
  function getSession(): Session | null {
    if (!isEnabled()) return null;
    if (session) return session;
    session = restoreSession(environment.sessionStorage);
    if (!session) {
      const id = newId();
      if (!id) return null;
      session = { id, visited: false, features: [], activeMilliseconds: 0, activeReached: false, endedConversations: [], flows: {} };
      save();
    }
    return session;
  }
  function makeEvent(name: EventName, properties: AnalyticsEvent['properties']): AnalyticsEvent | null {
    const id = newId();
    return id ? { id, name, properties, timestamp: new Date(environment.now()).toISOString() } : null;
  }
  function scheduleFlush() {
    if (!cancelFlush && queue.length && starts) cancelFlush = environment.schedule(() => { cancelFlush = undefined; void flush(false); }, 800);
  }
  async function flush(keepalive: boolean) {
    if (flushing || !queue.length) return;
    if (!isEnabled()) { queue = []; return; }
    const current = getSession();
    if (!current) return;
    flushing = true;
    const events: AnalyticsEvent[] = [];
    const encoder = new TextEncoder();
    while (queue.length && events.length < 10) {
      const next = queue[0];
      const bytes = encoder.encode(JSON.stringify({ sessionId: current.id, events: [...events, next] })).byteLength;
      if (bytes > MAX_ENVELOPE_BYTES) {
        if (events.length) break;
        // An invalid oversized event must not block the remaining queue.
        queue.shift();
        continue;
      }
      events.push(next);
      queue.shift();
    }
    if (!events.length) { flushing = false; scheduleFlush(); return; }
    try { await environment.transport({ sessionId: current.id, events }, keepalive); } catch { /* Best effort, without retries. */ }
    finally { flushing = false; scheduleFlush(); }
  }
  function event(name: EventName, properties: AnalyticsEvent['properties']) {
    if (!getSession()) return;
    const next = makeEvent(name, properties);
    if (!next) return;
    if (queue.length === MAX_QUEUE) queue.shift();
    queue.push(next);
    scheduleFlush();
  }
  function visit() {
    const current = getSession();
    if (!current || current.visited) return;
    current.visited = true;
    save();
    const width = environment.viewportWidth();
    event('visit_started', {
      referral_source: referralCategory(environment.referrer()),
      device: width < 600 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop',
    });
  }
  function accrue() {
    const now = environment.now();
    const elapsed = wasVisible ? Math.max(0, Math.min(now, lastActivity + IDLE_AFTER) - lastTick) : 0;
    lastTick = now;
    const current = getSession();
    if (!current || current.activeReached || !elapsed) return;
    current.activeMilliseconds = Math.min(ACTIVE_TARGET, current.activeMilliseconds + elapsed);
    if (current.activeMilliseconds >= ACTIVE_TARGET) {
      current.activeReached = true;
      event('active_time_120s', { active_seconds: 120 });
    }
    save();
  }
  function beginFlow(source: Exclude<AnalyticsSource, 'menu'>) {
    if (source !== 'quick_choices' && source !== 'chat') return;
    const current = getSession();
    const id = newId();
    if (!current || !id) return;
    current.flows[source] = { id, completed: false };
    save();
    event('finder_started', { source, flow_id: id });
  }
  function flowFor(source: AnalyticsSource): Flow | null {
    const current = getSession();
    if (!current || !SOURCES.includes(source)) return null;
    if (!current.flows[source]) {
      if (source !== 'menu') beginFlow(source);
      else {
        const id = newId();
        if (!id) return null;
        current.flows.menu = { id, completed: false };
        save();
      }
    }
    return current.flows[source] ?? null;
  }
  async function feedback(name: 'idea_feedback' | 'feedback_comment', vote: FeedbackVote, responseId: string, comment?: string): Promise<boolean> {
    const current = getSession();
    if (!current || !UUID.test(responseId) || (vote !== 'yes' && vote !== 'no')) return false;
    const properties: AnalyticsEvent['properties'] = { vote, response_id: responseId, question_version: 1 };
    if (name === 'feedback_comment') {
      const text = comment?.trim();
      if (!text || text.length > 500) return false;
      properties.comment = text;
    }
    const next = makeEvent(name, properties);
    if (!next) return false;
    try { return await environment.transport({ sessionId: current.id, events: [next] }, false); } catch { return false; }
  }

  return {
    isEnabled,
    setEnabled(enabled: boolean) {
      optOut = !enabled;
      write(environment.localStorage, OPT_OUT_KEY, optOut ? '1' : '0');
      queue = [];
      cancelFlush?.();
      cancelFlush = undefined;
      lastTick = lastActivity = environment.now();
      wasVisible = environment.visible();
      if (isEnabled() && starts) visit();
      subscribers.forEach(listener => listener());
    },
    subscribe(listener: () => void) {
      subscribers.add(listener);
      return () => { subscribers.delete(listener); };
    },
    start() {
      starts += 1;
      if (starts === 1) {
        lastTick = lastActivity = environment.now();
        wasVisible = environment.visible();
        visit();
        const cleanups = [
          environment.onActivity(() => { accrue(); lastActivity = environment.now(); }),
          environment.onVisibility(() => {
            accrue();
            wasVisible = environment.visible();
            if (wasVisible) lastActivity = environment.now();
            else void flush(true);
          }),
          environment.onPageHide(() => { accrue(); void flush(true); }),
          environment.onPreferenceChange?.(() => {
            if (!isEnabled()) {
              queue = [];
              cancelFlush?.();
              cancelFlush = undefined;
            } else visit();
            lastTick = lastActivity = environment.now();
            subscribers.forEach(listener => listener());
          }) ?? (() => {}),
          environment.every(accrue, 5000),
        ];
        cleanupListeners = () => { cleanups.forEach(cleanup => cleanup()); };
        scheduleFlush();
      }
      let cleaned = false;
      return () => {
        if (cleaned) return;
        cleaned = true;
        starts = Math.max(0, starts - 1);
        if (!starts) {
          accrue();
          cleanupListeners?.();
          cleanupListeners = undefined;
          cancelFlush?.();
          cancelFlush = undefined;
        }
      };
    },
    feature(source: AnalyticsSource) {
      const current = getSession();
      if (!current || !SOURCES.includes(source) || current.features.includes(source)) return;
      current.features.push(source);
      save();
      event('feature_used', { source });
    },
    beginFlow,
    recommendations(source: AnalyticsSource, count: number) {
      if (!Number.isInteger(count) || count < 0 || count > 3) return;
      const flow = flowFor(source);
      if (!flow) return;
      event('recommendations_shown', { source, flow_id: flow.id, count });
    },
    view(source: AnalyticsSource) {
      if (SOURCES.includes(source)) event('drink_viewed', { source });
    },
    complete(source: AnalyticsSource) {
      if (source === 'menu') {
        const current = getSession();
        const id = newId();
        if (!current || !id) return;
        current.flows.menu = { id, completed: false };
        save();
      }
      const flow = flowFor(source);
      if (!flow || flow.completed) return;
      flow.completed = true;
      save();
      event('flow_completed', { source, flow_id: flow.id });
    },
    chatEnded(reason: ChatEndReason, turnCount: number, conversationId: string, reviewMessages?: string[]) {
      const current = getSession();
      if (!current || !CHAT_END_REASONS.includes(reason) || !UUID.test(conversationId)
        || !Number.isInteger(turnCount) || turnCount < 1 || turnCount > 20 || current.endedConversations.includes(conversationId)) return;
      current.endedConversations.push(conversationId);
      current.endedConversations = current.endedConversations.slice(-20);
      save();
      const properties: AnalyticsEvent['properties'] = { reason, turn_count: turnCount, conversation_id: conversationId };
      if (reason !== 'turn_limit' && Array.isArray(reviewMessages)) {
        const bounded = reviewMessages.slice(-3).filter(value => typeof value === 'string').map(value => value.trim().slice(0, 600)).filter(Boolean);
        if (bounded.length) properties.review_messages = bounded;
      }
      event('chat_ended', properties);
    },
    submitVote: (vote: FeedbackVote, responseId: string) => feedback('idea_feedback', vote, responseId),
    submitComment: (vote: FeedbackVote, responseId: string, comment: string) => feedback('feedback_comment', vote, responseId, comment),
  };
}

function browserStorage(name: 'localStorage' | 'sessionStorage'): StorageLike | undefined {
  try { return typeof window === 'undefined' ? undefined : window[name]; } catch { return undefined; }
}
function listen(target: EventTarget | undefined, event: string, listener: () => void, capture = false) {
  target?.addEventListener(event, listener, { passive: true, capture });
  return () => { target?.removeEventListener(event, listener, capture); };
}
function browserUuid(): string | null {
  try { return globalThis.crypto?.randomUUID() ?? null; } catch { return null; }
}
const browserEnvironment: AnalyticsEnvironment = {
  hostname: () => typeof window === 'undefined' ? '' : window.location.hostname,
  now: () => Date.now(),
  uuid: browserUuid,
  sessionStorage: browserStorage('sessionStorage'),
  localStorage: browserStorage('localStorage'),
  referrer: () => typeof document === 'undefined' ? '' : document.referrer,
  viewportWidth: () => typeof window === 'undefined' ? 0 : window.innerWidth,
  privacySignal: () => isFeedbackPreview() || typeof navigator !== 'undefined' && (navigator.doNotTrack === '1'
    || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true),
  visible: () => typeof document !== 'undefined' && document.visibilityState === 'visible',
  onActivity: listener => {
    const target = typeof window === 'undefined' ? undefined : window;
    const cleanups = ['pointerdown', 'keydown', 'scroll'].map(event => listen(target, event, listener, event === 'scroll'));
    return () => { cleanups.forEach(cleanup => cleanup()); };
  },
  onVisibility: listener => listen(typeof document === 'undefined' ? undefined : document, 'visibilitychange', listener),
  onPageHide: listener => listen(typeof window === 'undefined' ? undefined : window, 'pagehide', listener),
  onPreferenceChange: listener => {
    if (typeof window === 'undefined') return () => {};
    const onStorage = (event: StorageEvent) => { if (event.key === OPT_OUT_KEY || event.key === null) listener(); };
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('storage', onStorage); };
  },
  schedule: (callback, milliseconds) => { const timer = setTimeout(callback, milliseconds); return () => { clearTimeout(timer); }; },
  every: (callback, milliseconds) => { const timer = setInterval(callback, milliseconds); return () => { clearInterval(timer); }; },
  transport: async (envelope, keepalive) => {
    const response = await fetch('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope), keepalive,
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  },
};

export const analytics = createAnalytics(browserEnvironment);
