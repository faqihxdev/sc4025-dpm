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

describe('fresh demo state', () => {
  it('returns independent preferences, cart and availability for each call', () => {
    const first = freshState();
    const second = freshState();

    first.preferences.goal = 'coffee';
    first.cart.push({ drinkId: firstId, sizeId: 'tall', quantity: 2 });
    first.availability[firstId] = false;

    expect(second).toEqual({
      preferences: defaultPreferences,
      cart: [],
      availability: defaultAvailability,
    });
    expect(freshState()).toEqual(second);
    expect(defaultPreferences.goal).toBeNull();
    expect(defaultAvailability[firstId]).toBe(true);
  });
});

describe('session envelope', () => {
  it.each([null, '', '{', 'not JSON'])('starts fresh for empty or malformed input %s', (raw) => {
    expect(decodeSession(raw)).toEqual(freshState());
  });

  it.each([null, [], 42, true, 'saved', {}, { version: '1' }, { version: 0 }, { version: 3 }])(
    'starts fresh for an unsupported envelope %j',
    (value) => {
      expect(decodeSession(JSON.stringify(value))).toEqual(freshState());
    },
  );

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

  it('preserves valid sections when another section is malformed', () => {
    const result = decodeSession(saved({
      preferences: [],
      cart: [{ drinkId: firstId, quantity: 3 }],
      availability: { [secondId]: false },
    }));

    expect(result.preferences).toEqual(defaultPreferences);
    expect(result.cart).toEqual([{ drinkId: firstId, sizeId: 'tall', quantity: 3 }]);
    expect(result.availability[secondId]).toBe(false);
  });
});

describe('saved preferences', () => {
  it.each<Preferences>([
    { goal: 'refreshing', temperature: 'iced', avoidCoffee: true, sweetness: 'less', milk: 'none', budgetCents: 0 },
    { goal: 'coffee', temperature: 'hot', avoidCoffee: false, sweetness: 'more', milk: 'dairy', budgetCents: 100000 },
    { goal: 'comfort', temperature: null, avoidCoffee: false, sweetness: 'any', milk: 'oat', budgetCents: 700 },
    { ...defaultPreferences },
  ])('accepts the supported preference values %j', (preferences) => {
    expect(decodeSession(saved({ preferences })).preferences).toEqual(preferences);
  });

  it('normalises invalid enums while retaining valid fields', () => {
    const result = decodeSession(saved({
      preferences: {
        goal: 'energy',
        temperature: 'cold',
        avoidCoffee: true,
        sweetness: 'sugar-free',
        milk: 'almond',
        budgetCents: 800,
      },
    }));

    expect(result.preferences).toEqual({ ...defaultPreferences, avoidCoffee: true, budgetCents: 800 });
  });

  it.each([false, 1, 'true', {}, null])('does not coerce avoidCoffee value %j into true', (avoidCoffee) => {
    expect(decodeSession(saved({ preferences: { avoidCoffee } })).preferences.avoidCoffee).toBe(false);
  });

  it.each([-1, 1.5, 100001, '700', null, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects an invalid budget %j',
    (budgetCents) => {
      expect(decodeSession(saved({ preferences: { budgetCents } })).preferences.budgetCents).toBeNull();
    },
  );

  it.each([null, [], 'preferences', 7])('ignores a non-object preferences section %j', (preferences) => {
    expect(decodeSession(saved({ preferences })).preferences).toEqual(defaultPreferences);
  });

  it('does not accept missing fields as specific requirements', () => {
    expect(decodeSession(saved({ preferences: {} })).preferences).toEqual(defaultPreferences);
  });
});

describe('saved cart', () => {
  it.each([1, 2])('migrates missing size IDs to Tall in version %s without losing preferences or stock', (version) => {
    const preferences = { ...defaultPreferences, goal: 'coffee' as const, avoidCoffee: true };
    const result = decodeSession(saved({
      version, preferences,
      cart: [{ drinkId: firstId, quantity: 2 }],
      availability: { [firstId]: false },
    }));
    expect(result.cart).toEqual([{ drinkId: firstId, sizeId: 'tall', quantity: 2 }]);
    expect(result.preferences).toEqual(preferences);
    expect(result.availability[firstId]).toBe(false);
  });

  it.each([1, 2])('restores supported recipe and size pairs in version %s', (version) => {
    const cart = [
      { drinkId: secondId, sizeId: 'short', quantity: 1 },
      { drinkId: firstId, sizeId: 'tall', quantity: 2 },
      { drinkId: firstId, sizeId: 'grande', quantity: 3 },
      { drinkId: firstId, sizeId: 'venti', quantity: 4 },
    ];
    expect(decodeSession(saved({ version, cart })).cart).toEqual(cart);
  });

  it.each([null, '', 'Tall', 'large', 12, {}, []])('drops an explicitly invalid size %j instead of choosing Tall', (sizeId) => {
    const result = decodeSession(saved({ version: 2, cart: [
      { drinkId: firstId, sizeId, quantity: 2 },
      { drinkId: secondId, sizeId: 'tall', quantity: 1 },
    ] }));
    expect(result.cart).toEqual([{ drinkId: secondId, sizeId: 'tall', quantity: 1 }]);
  });

  it('drops unavailable Short on iced recipes while preserving hot Short', () => {
    expect(decodeSession(saved({ version: 2, cart: [
      { drinkId: firstId, sizeId: 'short', quantity: 2 },
      { drinkId: secondId, sizeId: 'short', quantity: 1 },
    ] })).cart).toEqual([{ drinkId: secondId, sizeId: 'short', quantity: 1 }]);
  });

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

  it('does not restore forged price or size labels as catalogue data', () => {
    expect(decodeSession(saved({ version: 2, cart: [{
      drinkId: firstId, sizeId: 'grande', quantity: 2, priceCents: 1, ounces: 99, label: 'Free',
    }] })).cart).toEqual([{ drinkId: firstId, sizeId: 'grande', quantity: 2 }]);
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

  it('merges duplicate recipes, caps the combined quantity and keeps first-seen order', () => {
    const result = decodeSession(saved({ cart: [
      { drinkId: secondId, quantity: 2 },
      { drinkId: firstId, quantity: 50 },
      { drinkId: secondId, quantity: 3 },
      { drinkId: firstId, quantity: 70 },
    ] }));

    expect(result.cart).toEqual([
      { drinkId: secondId, sizeId: 'tall', quantity: 5 },
      { drinkId: firstId, sizeId: 'tall', quantity: 99 },
    ]);
  });

  it('accepts both quantity boundaries', () => {
    expect(decodeSession(saved({ cart: [
      { drinkId: firstId, quantity: 1 },
      { drinkId: secondId, quantity: 99 },
    ] })).cart).toEqual([
      { drinkId: firstId, sizeId: 'tall', quantity: 1 },
      { drinkId: secondId, sizeId: 'tall', quantity: 99 },
    ]);
  });

  it.each([null, {}, 'cart', 2])('ignores a non-array cart section %j', (cart) => {
    expect(decodeSession(saved({ cart })).cart).toEqual([]);
  });
});

describe('saved availability', () => {
  it('restores booleans for known recipes and ignores unknown IDs or non-booleans', () => {
    const result = decodeSession(saved({ availability: {
      [firstId]: false,
      [secondId]: 'false',
      'unknown-recipe': false,
    } }));

    expect(result.availability).toEqual({ ...defaultAvailability, [firstId]: false });
    expect(result.availability).not.toHaveProperty('unknown-recipe');
  });

  it.each([null, [], 'stock', 2])('ignores a non-object availability section %j', (availability) => {
    expect(decodeSession(saved({ availability })).availability).toEqual(defaultAvailability);
  });
});

describe('browser session storage', () => {
  it('reads the app-specific key and returns defaults when it is absent', () => {
    const { storage } = memoryStorage();

    expect(readSession()).toEqual(freshState());
    expect(storage.getItem).toHaveBeenCalledWith(SESSION_KEY);
  });

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

  it('recovers when access to sessionStorage is blocked', () => {
    vi.stubGlobal('window', {
      get sessionStorage() {
        throw new Error('Storage blocked');
      },
    });

    expect(readSession()).toEqual(freshState());
    expect(saveSession(freshState())).toBe(false);
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

  it('starts fresh when no browser window exists', () => {
    vi.stubGlobal('window', undefined);

    expect(readSession()).toEqual(freshState());
    expect(saveSession(freshState())).toBe(false);
  });
});
