import { defaultPreferences, drinks } from '../domain/catalogue';
import type { Preferences } from '../domain/model';
import { CHAT_END_REASONS, CHAT_HISTORY_LIMIT, CHAT_MESSAGE_LIMIT, CHAT_TURN_LIMIT } from './contracts';
import type { ChatEndReason, ChatMessage, ChatResponse } from './contracts';

const storageKey = 'sc4025-drink-chat:v1';
const drinkIds = new Set(drinks.map(drink => drink.id));

export interface StoredChatMessage extends ChatMessage {
  picks?: ChatResponse['picks'];
  suggestions?: string[];
}

export interface ChatSession {
  messages: StoredChatMessage[];
  preferences: Preferences;
  turnCount: number;
  endedReason: ChatEndReason | null;
}

let memorySession: ChatSession | null = null;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;

export function freshChatSession(): ChatSession {
  return { messages: [], preferences: { ...defaultPreferences }, turnCount: 0, endedReason: null };
}

function parsePreferences(value: unknown): Preferences | null {
  if (!record(value) || ![null, 'refreshing', 'coffee', 'comfort'].includes(value.goal as null | string)
    || ![null, 'hot', 'iced'].includes(value.temperature as null | string)
    || typeof value.avoidCoffee !== 'boolean' || !['any', 'less', 'more'].includes(value.sweetness as string)
    || ![null, 'dairy', 'oat', 'none'].includes(value.milk as null | string)
    || !(value.budgetCents === null || typeof value.budgetCents === 'number' && Number.isFinite(value.budgetCents) && Number.isInteger(value.budgetCents) && value.budgetCents >= 0 && value.budgetCents <= 100_000)) return null;
  return { goal: value.goal, temperature: value.temperature, avoidCoffee: value.avoidCoffee, sweetness: value.sweetness, milk: value.milk, budgetCents: value.budgetCents } as Preferences;
}

function parseSuggestions(value: unknown): string[] | null {
  return Array.isArray(value) && value.length <= 3 && value.every(item => text(item, 80)) ? [...new Set(value)] : null;
}

function parsePicks(value: unknown): ChatResponse['picks'] | null {
  if (!Array.isArray(value) || value.length > 2) return null;
  const seen = new Set<string>();
  const picks: ChatResponse['picks'] = [];
  for (const item of value) {
    if (!record(item) || typeof item.drinkId !== 'string' || !drinkIds.has(item.drinkId) || seen.has(item.drinkId) || !text(item.reason, 240)) return null;
    seen.add(item.drinkId);
    picks.push({ drinkId: item.drinkId, reason: item.reason.trim() });
  }
  return picks;
}

export function parseChatResponse(value: unknown): ChatResponse | null {
  if (!record(value) || !text(value.reply, CHAT_MESSAGE_LIMIT)) return null;
  const preferences = parsePreferences(value.preferences);
  const suggestions = parseSuggestions(value.suggestions);
  const picks = parsePicks(value.picks);
  if (!preferences || !suggestions || !picks) return null;
  if (value.endedReason === undefined) return { reply: value.reply.trim(), preferences, suggestions, picks };
  if (!CHAT_END_REASONS.includes(value.endedReason as ChatEndReason) || suggestions.length || picks.length) return null;
  return { reply: value.reply.trim(), preferences, suggestions, picks, endedReason: value.endedReason as ChatEndReason };
}

export function boundChatMessages(messages: StoredChatMessage[]): StoredChatMessage[] {
  const bounded = messages.slice(-CHAT_HISTORY_LIMIT);
  while (bounded.length && bounded[0].role !== 'user') bounded.shift();
  return bounded;
}

function parseSession(value: unknown): ChatSession | null {
  if (!record(value) || !Array.isArray(value.messages) || value.messages.length > CHAT_HISTORY_LIMIT) return null;
  const preferences = parsePreferences(value.preferences);
  if (!preferences) return null;
  const messages: StoredChatMessage[] = [];
  for (const item of value.messages) {
    if (!record(item) || !['user', 'assistant'].includes(item.role as string) || !text(item.content, CHAT_MESSAGE_LIMIT)) return null;
    const message: StoredChatMessage = { role: item.role as ChatMessage['role'], content: item.content };
    if (item.role === 'assistant') {
      const picks = parsePicks(item.picks ?? []);
      const suggestions = parseSuggestions(item.suggestions ?? []);
      if (!picks || !suggestions) return null;
      message.picks = picks;
      message.suggestions = suggestions;
    }
    messages.push(message);
  }
  const visibleTurns = messages.filter(message => message.role === 'user').length;
  const turnCount = value.turnCount === undefined ? visibleTurns : value.turnCount;
  if (typeof turnCount !== 'number' || !Number.isInteger(turnCount) || turnCount < visibleTurns || turnCount > CHAT_TURN_LIMIT) return null;
  const suppliedEndReason = value.endedReason ?? null;
  if (suppliedEndReason !== null && !CHAT_END_REASONS.includes(suppliedEndReason as ChatEndReason)) return null;
  const endedReason = suppliedEndReason as ChatEndReason | null
    ?? (turnCount === CHAT_TURN_LIMIT && messages.at(-1)?.role === 'assistant' ? 'turn_limit' : null);
  // Legacy sample controls are ignored. Order history now belongs to the server tool.
  return { messages: boundChatMessages(messages), preferences, turnCount, endedReason };
}

export function readChatSession(): ChatSession {
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      const parsed = parseSession(JSON.parse(stored));
      if (parsed) { memorySession = parsed; return parsed; }
    }
  } catch { /* Use in-memory state when browser storage is unavailable. */ }
  return memorySession ?? freshChatSession();
}

export function saveChatSession(session: ChatSession): void {
  memorySession = session;
  try { sessionStorage.setItem(storageKey, JSON.stringify(session)); } catch { /* The conversation still survives in-app navigation. */ }
}

export function clearChatSession(): ChatSession {
  memorySession = freshChatSession();
  try { sessionStorage.removeItem(storageKey); } catch { /* Reset the in-memory copy too. */ }
  return memorySession;
}
