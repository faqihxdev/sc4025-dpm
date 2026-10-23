import { describe, expect, it } from 'vitest';

import { defaultAvailability, defaultPreferences, drinks } from './catalogue';
import type { Drink, Preferences } from './model';

import { getRecommendations, isEligible } from './recommendations';

function preferences(overrides: Partial<Preferences> = {}): Preferences {
  return { ...defaultPreferences, ...overrides };
}

function recipe(id: string, overrides: Partial<Drink> = {}): Drink {
  return {
    id,
    name: id,
    description: 'Test recipe',
    category: 'tea',
    image: `/images/${id}.webp`,
    temperature: 'iced',
    containsCoffee: false,
    milk: 'none',
    sugarPer100ml: 4,
    goals: ['refreshing'],
    priceCents: 700,
    size: 'Tall · 12 oz',
    sourceUrl: 'https://www.starbucks.com.sg/menu',
    ingredientNotes: 'Tea and water; no coffee or milk listed.',
    verifiedPriceCents: null,
    verifiedSize: null,
    evidenceNote: 'Test fixture',
    ...overrides,
  };
}

function available(entries: readonly Drink[]): Record<string, boolean> {
  return Object.fromEntries(entries.map((drink) => [drink.id, true]));
}

describe('hard requirements', () => {

  it('requires every hard requirement to pass together', () => {
    const drink = recipe('oat-matcha', { milk: 'oat', priceCents: 850 });
    const choices = preferences({
      temperature: 'iced',
      avoidCoffee: true,
      milk: 'oat',
      budgetCents: 850,
    });
    const stock = available([drink]);

    expect(isEligible(drink, choices, stock)).toBe(true);
    expect(isEligible(drink, { ...choices, temperature: 'hot' }, stock)).toBe(false);
    expect(isEligible(drink, { ...choices, milk: 'dairy' }, stock)).toBe(false);
    expect(isEligible(drink, { ...choices, budgetCents: 849 }, stock)).toBe(false);
    expect(isEligible({ ...drink, containsCoffee: true }, choices, stock)).toBe(false);
  });

  it('excludes unknown values when the corresponding requirement is selected', () => {
    const drink = recipe('unknown', {
      temperature: null,
      containsCoffee: null,
      milk: null,
    });
    const stock = available([drink]);

    expect(isEligible(drink, preferences(), stock)).toBe(true);
    expect(isEligible(drink, preferences({ temperature: 'iced' }), stock)).toBe(false);
    expect(isEligible(drink, preferences({ avoidCoffee: true }), stock)).toBe(false);
    expect(isEligible(drink, preferences({ milk: 'none' }), stock)).toBe(false);
    expect(
      isEligible({ ...drink, priceCents: Number.NaN }, preferences({ budgetCents: 900 }), stock),
    ).toBe(false);
  });

  it('excludes green coffee extract from no-coffee results', () => {
    const refresher = drinks.find((drink) => drink.id === 'strawberry-acai-lemonade');

    expect(refresher).toBeDefined();
    if (!refresher) throw new Error('The green-coffee recipe is missing');
    expect(refresher.containsCoffee).toBe(true);
    expect(isEligible(refresher, preferences({ avoidCoffee: true }), defaultAvailability)).toBe(false);
    expect(refresher.ingredientNotes).toContain('green coffee extract');
  });
});

describe('recommendation count and recovery states', () => {
  it('returns no results without relaxing incompatible requirements', () => {
    const entries = [recipe('iced-tea')];
    const choices = preferences({ temperature: 'hot', milk: 'oat' });

    expect(getRecommendations(entries, choices, available(entries))).toEqual([]);
    expect(choices.temperature).toBe('hot');
    expect(choices.milk).toBe('oat');
  });

  it('returns one or two matches without filling the list with incompatible recipes', () => {
    const entries = [recipe('a'), recipe('b'), recipe('c', { containsCoffee: true })];
    const choices = preferences({ avoidCoffee: true });

    expect(getRecommendations(entries, choices, available(entries))).toHaveLength(2);
    expect(getRecommendations(entries, choices, { a: true, b: false, c: true })).toHaveLength(1);
  });
});

describe('ranking and explanations', () => {
  it('ranks goal fit before sweetness, and known sugar before unknown within a goal group', () => {
    const entries = [
      recipe('alternative', { goals: ['comfort'], sugarPer100ml: 0 }),
      recipe('unknown', { sugarPer100ml: null }),
      recipe('sweeter', { sugarPer100ml: 10 }),
      recipe('less-sweet', { sugarPer100ml: 2 }),
    ];
    const results = getRecommendations(
      entries,
      preferences({ goal: 'refreshing', sweetness: 'less' }),
      available(entries),
    );

    expect(results.map(({ drink }) => drink.id)).toEqual(['less-sweet', 'sweeter', 'unknown']);
    expect(results.every((result) => result.goalMatch)).toBe(true);
  });
});
