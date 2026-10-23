import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultAvailability, defaultPreferences, drinks } from './domain/catalogue';
import type { Preferences } from './domain/model';
import {
  decodeSession,
  freshState,
  readSession,
  saveSession,
  SESSION_KEY,
} from './session';

const firstId = drinks[0].id;
const secondId = drinks[1].id;

function saved(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ version: 1, ...overrides });
}

function memoryStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  vi.stubGlobal('window', { sessionStorage: storage });
  return { storage, values };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session envelope', () => {

  it('restores valid answers, cart and prepared availability', () => {
    const preferences: Preferences = {
      goal: 'comfort',
      temperature: 'hot',
      avoidCoffee: true,
      sweetness: 'less',
      milk: 'oat',
      budgetCents: 850,
    };
    const cart = [{ drinkId: firstId, quantity: 2 }];
    const result = decodeSession(saved({
      preferences,
      cart,
      availability: { [firstId]: false, [secondId]: true },
      unexpectedField: 'ignored',
    }));

    expect(result.preferences).toEqual(preferences);
    expect(result.cart).toEqual([{ drinkId: firstId, sizeId: 'tall', quantity: 2 }]);
    expect(result.availability).toEqual({ ...defaultAvailability, [firstId]: false });
    expect(result).not.toHaveProperty('unexpectedField');
  });
});

describe('saved cart', () => {

  it('merges only duplicate recipe and size pairs, including migrated Tall lines', () => {
    expect(decodeSession(saved({ version: 2, cart: [
      { drinkId: firstId, quantity: 2 },
      { drinkId: firstId, sizeId: 'grande', quantity: 50 },
      { drinkId: firstId, sizeId: 'tall', quantity: 3 },
      { drinkId: firstId, sizeId: 'grande', quantity: 70 },
      { drinkId: secondId, sizeId: 'grande', quantity: 1 },
    ] })).cart).toEqual([
      { drinkId: firstId, sizeId: 'tall', quantity: 5 },
      { drinkId: firstId, sizeId: 'grande', quantity: 99 },
      { drinkId: secondId, sizeId: 'grande', quantity: 1 },
    ]);
  });

  it('drops unknown IDs and malformed items without dropping valid items', () => {
    const result = decodeSession(saved({ cart: [
      { drinkId: firstId, quantity: 2 },
      { drinkId: 'unknown-recipe', quantity: 1 },
      { drinkId: 123, quantity: 1 },
      { drinkId: secondId, quantity: 0 },
      { drinkId: secondId, quantity: -1 },
      { drinkId: secondId, quantity: 1.5 },
      { drinkId: secondId, quantity: 100 },
      { drinkId: secondId, quantity: '2' },
      { drinkId: secondId },
      null,
      [],
      'cart item',
      { drinkId: secondId, quantity: 1 },
    ] }));

    expect(result.cart).toEqual([
      { drinkId: firstId, sizeId: 'tall', quantity: 2 },
      { drinkId: secondId, sizeId: 'tall', quantity: 1 },
    ]);
  });
});

describe('browser session storage', () => {

  it('round-trips a valid state using a versioned payload', () => {
    const { storage, values } = memoryStorage();
    const state = freshState();
    state.preferences = { ...defaultPreferences, goal: 'refreshing', budgetCents: 800 };
    state.cart = [{ drinkId: firstId, sizeId: 'grande', quantity: 2 }];
    state.availability[secondId] = false;

    expect(saveSession(state)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(values.get(SESSION_KEY) ?? '')).toEqual({ version: 2, ...state });
    expect(readSession()).toEqual(state);
  });

  it('starts fresh for corrupt stored JSON', () => {
    const { values } = memoryStorage();
    values.set(SESSION_KEY, '{corrupt');

    expect(readSession()).toEqual(freshState());
  });

  it('recovers when storage methods throw', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => { throw new Error('Read blocked'); },
        setItem: () => { throw new Error('Quota exceeded'); },
      },
    });

    expect(readSession()).toEqual(freshState());
    expect(saveSession(freshState())).toBe(false);
  });
});
