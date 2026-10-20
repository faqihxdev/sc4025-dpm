import { CHAT_END_REASONS } from '../../src/chat/contracts';
import { redactReviewMessage } from './redaction';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SOURCES = ['menu', 'quick_choices', 'chat'];
const FLOW_SOURCES = ['quick_choices', 'chat'];

export const MAX_EVENT_BATCH = 10;

export interface ValidatedEvent {
  id: string;
  name: string;
  properties: Record<string, string | number | string[]>;
  timestamp: string;
}

export interface ValidatedBatch {
  sessionId: string;
  events: ValidatedEvent[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function choice(value: unknown, choices: readonly string[]): value is string {
  return typeof value === 'string' && choices.includes(value);
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function propertiesFor(name: string, value: unknown): Record<string, string | number | string[]> | null {
  if (!record(value)) return null;
  switch (name) {
    case 'visit_started':
      return exactKeys(value, ['referral_source', 'device']) &&
        choice(value.referral_source, ['direct', 'search', 'social', 'other']) &&
        choice(value.device, ['mobile', 'tablet', 'desktop'])
        ? { referral_source: value.referral_source, device: value.device } : null;
    case 'feature_used':
    case 'drink_viewed':
      return exactKeys(value, ['source']) && choice(value.source, SOURCES)
        ? { source: value.source } : null;
    case 'finder_started':
      return exactKeys(value, ['source', 'flow_id']) && choice(value.source, FLOW_SOURCES) && uuid(value.flow_id)
        ? { source: value.source, flow_id: value.flow_id } : null;
    case 'recommendations_shown':
      return exactKeys(value, ['source', 'flow_id', 'count']) && choice(value.source, FLOW_SOURCES) &&
        uuid(value.flow_id) && integer(value.count, 0, 3)
        ? { source: value.source, flow_id: value.flow_id, count: value.count } : null;
    case 'flow_completed':
      return exactKeys(value, ['source', 'flow_id']) && choice(value.source, SOURCES) && uuid(value.flow_id)
        ? { source: value.source, flow_id: value.flow_id } : null;
    case 'active_time_120s':
      return exactKeys(value, ['active_seconds']) && value.active_seconds === 120
        ? { active_seconds: 120 } : null;
    case 'idea_feedback':
    case 'feedback_comment': {
      const keys = ['vote', 'response_id', 'question_version'];
      if (name === 'feedback_comment') keys.push('comment');
      if (!exactKeys(value, keys) || !choice(value.vote, ['yes', 'no']) ||
        !uuid(value.response_id) || value.question_version !== 1) return null;
      const base = { vote: value.vote, response_id: value.response_id, question_version: 1 };
      if (name === 'idea_feedback') return base;
      if (typeof value.comment !== 'string') return null;
      const comment = value.comment.trim();
      // Feedback is explicit free text, separate from the limited closed-chat review.
      if (!comment || comment.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|<\/?[a-z][^>]*>/i.test(comment)) return null;
      return { ...base, comment: redactReviewMessage(comment) };
    }
    case 'chat_ended': {
      const keys = ['reason', 'turn_count', 'conversation_id'];
      const hasReview = Object.hasOwn(value, 'review_messages');
      if (hasReview) keys.push('review_messages');
      if (!exactKeys(value, keys) || !choice(value.reason, CHAT_END_REASONS) ||
        !integer(value.turn_count, 1, 20) || !uuid(value.conversation_id)) return null;
      const base = { reason: value.reason, turn_count: value.turn_count, conversation_id: value.conversation_id };
      if (!hasReview) return base;
      if (value.reason === 'turn_limit' || !Array.isArray(value.review_messages) ||
        value.review_messages.length < 1 || value.review_messages.length > 3 ||
        value.review_messages.some((message) => typeof message !== 'string' || !message.trim() || message.length > 600)) return null;
      const reviewMessages = value.review_messages.map((message: string) => redactReviewMessage(message)).filter(Boolean);
      return reviewMessages.length ? { ...base, review_messages: reviewMessages } : base;
    }
    default:
      return null;
  }
}

export function validateAnalyticsBatch(value: unknown): ValidatedBatch | null {
  if (!record(value) || !exactKeys(value, ['sessionId', 'events']) || !uuid(value.sessionId) ||
    !Array.isArray(value.events) || value.events.length < 1 || value.events.length > MAX_EVENT_BATCH) return null;
  const events: ValidatedEvent[] = [];
  const eventIds = new Set<string>();
  for (const event of value.events) {
    if (!record(event) || !exactKeys(event, ['id', 'name', 'properties', 'timestamp']) ||
      !uuid(event.id) || eventIds.has(event.id) || typeof event.name !== 'string' ||
      typeof event.timestamp !== 'string' || !ISO_UTC.test(event.timestamp)) return null;
    const time = Date.parse(event.timestamp);
    if (!Number.isFinite(time) || new Date(time).toISOString().replace('.000Z', 'Z') !== event.timestamp.replace('.000Z', 'Z')) return null;
    const properties = propertiesFor(event.name, event.properties);
    if (!properties) return null;
    events.push({ id: event.id, name: event.name, properties, timestamp: event.timestamp });
    eventIds.add(event.id);
  }
  return { sessionId: value.sessionId, events };
}
