import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { defaultAvailability, defaultPreferences, drinks } from './catalogue';
import type { Drink, Preferences } from './model';
import { formatPrice } from './model';
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
  it('uses an inclusive per-drink budget', () => {
    const drink = recipe('tea', { priceCents: 700 });
    const stock = available([drink]);

    expect(isEligible(drink, preferences({ budgetCents: 700 }), stock)).toBe(true);
    expect(isEligible(drink, preferences({ budgetCents: 699 }), stock)).toBe(false);
  });

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

  it('requires known availability', () => {
    const drink = recipe('tea');

    expect(isEligible(drink, preferences(), {})).toBe(false);
    expect(isEligible(drink, preferences(), { tea: false })).toBe(false);
    expect(isEligible(drink, preferences(), { tea: true })).toBe(true);
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

  it('returns at most three results without mutating the catalogue', () => {
    const entries = [recipe('d'), recipe('c'), recipe('b'), recipe('a')];
    const originalIds = entries.map((drink) => drink.id);
    const results = getRecommendations(entries, preferences(), available(entries));

    expect(results.map(({ drink }) => drink.id)).toEqual(['a', 'b', 'c']);
    expect(entries.map((drink) => drink.id)).toEqual(originalIds);
  });

  it('excludes a recipe after its prepared availability changes', () => {
    const entries = [recipe('a'), recipe('b')];
    const stock = available(entries);
    expect(getRecommendations(entries, preferences(), stock).map(({ drink }) => drink.id)).toContain('a');

    const changedStock = { ...stock, a: false };
    expect(getRecommendations(entries, preferences(), changedStock).map(({ drink }) => drink.id)).toEqual(['b']);
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

  it('uses descending sugar for sweeter and a stable ID for ties', () => {
    const entries = [
      recipe('z', { sugarPer100ml: 10 }),
      recipe('a', { sugarPer100ml: 10 }),
      recipe('b', { sugarPer100ml: 2 }),
    ];

    expect(
      getRecommendations(entries, preferences({ sweetness: 'more' }), available(entries)).map(({ drink }) => drink.id),
    ).toEqual(['a', 'z', 'b']);
  });

  it('skips sugar ranking when sweetness is unspecified', () => {
    const entries = [
      recipe('a', { sugarPer100ml: null }),
      recipe('b', { sugarPer100ml: 0 }),
      recipe('c', { sugarPer100ml: 20 }),
    ];

    expect(getRecommendations(entries, preferences(), available(entries)).map(({ drink }) => drink.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps no-coffee requirements when they conflict with a coffee goal', () => {
    const choices = preferences({ goal: 'coffee', avoidCoffee: true });
    const results = getRecommendations(drinks, choices, defaultAvailability);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every(({ drink }) => drink.containsCoffee === false)).toBe(true);
    expect(results.every(({ goalMatch }) => goalMatch === false)).toBe(true);
    expect(results.every(({ reasons }) => reasons.some((reason) => reason.includes('alternative to your goal')))).toBe(true);
  });

  it('explains sourced attributes, uncertain sugar and simulated budget without a match percentage', () => {
    const drink = recipe('unknown-sugar', { sugarPer100ml: null });
    const [result] = getRecommendations(
      [drink],
      preferences({ avoidCoffee: true, sweetness: 'less', budgetCents: 700 }),
      available([drink]),
    );

    expect(result.reasons).toContain(drink.ingredientNotes);
    expect(result.reasons).toContain('Published sugar is unavailable; sweetness fit is uncertain.');
    expect(result.reasons).toContain('Within your S$7.00 demo budget.');
    expect(result.reasons.join(' ')).toContain('does not mean caffeine-free');
    expect(result.reasons.join(' ')).not.toMatch(/\d+%/);
  });
});

describe('prepared catalogue', () => {
  it('keeps price and size simulation separate from verified facts', () => {
    expect(drinks.length).toBeGreaterThanOrEqual(24);
    expect(new Set(drinks.map((drink) => drink.id)).size).toBe(drinks.length);
    expect(drinks.every((drink) => drink.verifiedPriceCents === null && drink.verifiedSize === null)).toBe(true);
    expect(drinks.every((drink) => drink.evidenceNote.includes('simulated test data'))).toBe(true);
    expect(drinks.every((drink) => Number.isInteger(drink.priceCents) && drink.priceCents > 0)).toBe(true);
    for (const drink of drinks) {
      const source = new URL(drink.sourceUrl);
      expect(source.protocol).toBe('https:');
      expect(source.hostname).toBe('www.starbucks.com.sg');
      expect(source.pathname).not.toBe('/');
      expect(drink.name.trim().length).toBeGreaterThan(0);
      expect(drink.ingredientNotes.trim().length).toBeGreaterThan(0);
      expect(drink.goals.length).toBeGreaterThan(0);
      expect(new Set(drink.goals).size).toBe(drink.goals.length);
    }
  });

  it('offers varied recipes across every goal, ingredient basis and temperature', () => {
    for (const goal of ['coffee', 'refreshing', 'comfort'] as const) {
      expect(drinks.filter(drink => drink.goals.includes(goal)).length).toBeGreaterThanOrEqual(4);
    }
    expect(new Set(drinks.map(drink => drink.category))).toEqual(new Set(['coffee', 'tea', 'refreshers', 'chocolate', 'blended']));
    expect(new Set(drinks.map(drink => drink.temperature))).toEqual(new Set(['hot', 'iced']));
    expect(new Set(drinks.map(drink => drink.milk))).toEqual(new Set(['dairy', 'oat', 'none']));
    expect(drinks.some(drink => drink.containsCoffee === false)).toBe(true);
    expect(drinks.some(drink => drink.containsCoffee === true)).toBe(true);
  });

  it('has distinct local photo assets and an observed source record for every recipe', () => {
    const manifest: { photographs: { id: string; observedUrl: string; productSource: string; note: string; outputs: { path: string }[] }[] } =
      JSON.parse(readFileSync(new URL('../../public/images/manifest.json', import.meta.url), 'utf8'));
    expect(new Set(drinks.map(drink => drink.image)).size).toBe(drinks.length);
    for (const drink of drinks) {
      expect(drink.image).toBe(`/images/${drink.id}.webp`);
      expect(existsSync(new URL(`../../public${drink.image}`, import.meta.url)), drink.image).toBe(true);
      const photograph = manifest.photographs.find(photo => photo.id === drink.id);
      expect(photograph, `Missing photo source for ${drink.id}`).toBeDefined();
      if (!photograph) throw new Error(`Missing photo source for ${drink.id}`);
      expect(new URL(photograph.observedUrl).protocol).toBe('https:');
      expect(new URL(photograph.productSource).protocol).toBe('https:');
      expect(photograph.outputs.some(output => output.path === drink.image)).toBe(true);
      expect(photograph.note.trim().length).toBeGreaterThan(0);
    }
  });

  it('leaves unpublished chamomile sugar unknown', () => {
    expect(drinks.find((drink) => drink.id === 'chamomile-tea')?.sugarPer100ml).toBeNull();
  });

  it('formats cents consistently for results and cart', () => {
    expect(formatPrice(620)).toBe('S$6.20');
    expect(formatPrice(0)).toBe('S$0.00');
  });
});
