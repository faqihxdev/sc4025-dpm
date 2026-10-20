import type { Preferences } from '../domain/model';

export const CHAT_END_REASONS = ['repeated_off_topic', 'unsafe_request', 'abusive_behavior', 'security_misuse', 'turn_limit'] as const;
export type ChatEndReason = typeof CHAT_END_REASONS[number];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  availability: Record<string, boolean>;
  preferences: Preferences;
}

export interface ChatResponse {
  reply: string;
  suggestions: string[];
  picks: { drinkId: string; reason: string }[];
  preferences: Preferences;
  endedReason?: ChatEndReason;
}

export interface ChatError {
  error: string;
}

export const CHAT_MESSAGE_LIMIT = 600;
export const CHAT_HISTORY_LIMIT = 12;
export const CHAT_TURN_LIMIT = 20;
