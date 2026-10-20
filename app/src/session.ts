import { defaultAvailability, defaultPreferences, drinks } from './domain/catalogue';
import { cartItemKey, getDrinkSizes } from './domain/drink-sizes';
import type { CartItem, Preferences } from './domain/model';

export const SESSION_KEY = 'sc4025-drink-finder:v1';
export interface DemoState { preferences: Preferences; cart: CartItem[]; availability: Record<string, boolean> }
export const freshState = (): DemoState => ({ preferences: { ...defaultPreferences }, cart: [], availability: { ...defaultAvailability } });
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function decodeSession(raw: string | null): DemoState {
  const state = freshState();
  if (!raw) return state;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!record(saved) || (saved.version !== 1 && saved.version !== 2)) return state;
    const p = saved.preferences;
    if (record(p)) {
      state.preferences = {
        goal: p.goal === 'refreshing' || p.goal === 'coffee' || p.goal === 'comfort' ? p.goal : null,
        temperature: p.temperature === 'hot' || p.temperature === 'iced' ? p.temperature : null,
        avoidCoffee: p.avoidCoffee === true,
        sweetness: p.sweetness === 'less' || p.sweetness === 'more' ? p.sweetness : 'any',
        milk: p.milk === 'dairy' || p.milk === 'oat' || p.milk === 'none' ? p.milk : null,
        budgetCents: typeof p.budgetCents === 'number' && Number.isInteger(p.budgetCents) && p.budgetCents >= 0 && p.budgetCents <= 100000 ? p.budgetCents : null,
      };
    }
    if (Array.isArray(saved.cart)) {
      const items = new Map<string, CartItem>();
      for (const item of saved.cart) {
        if (record(item) && typeof item.drinkId === 'string' && typeof item.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99) {
          const drink = drinks.find(d => d.id === item.drinkId);
          if (!drink) continue;
          const candidate = item.sizeId === undefined ? 'tall' : item.sizeId;
          const size = getDrinkSizes(drink).find(option => option.id === candidate);
          if (!size) continue;
          const restored: CartItem = { drinkId: drink.id, sizeId: size.id, quantity: item.quantity };
          const key = cartItemKey(restored);
          restored.quantity = Math.min(99, (items.get(key)?.quantity ?? 0) + restored.quantity);
          items.set(key, restored);
        }
      }
      state.cart = [...items.values()];
    }
    if (record(saved.availability)) {
      for (const drink of drinks) {
        const available = saved.availability[drink.id];
        if (typeof available === 'boolean') state.availability[drink.id] = available;
      }
    }
  } catch { /* Corrupt or old demo state starts fresh. */ }
  return state;
}
export function readSession(): DemoState {
  try { return decodeSession(window.sessionStorage.getItem(SESSION_KEY)); }
  catch { return freshState(); }
}
export function saveSession(state: DemoState): boolean {
  try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ version: 2, ...state })); return true; }
  catch { return false; }
}
