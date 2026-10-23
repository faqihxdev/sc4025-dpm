import { describe, expect, it } from 'vitest';
import { defaultPreferences, drinks } from './catalogue';
import type { Preferences } from './model';
import { isPreferenceOptionPossible, normalizeFinderPreferences, normalizeGoalPreferences } from './preference-options';

const legacyRecipeIds = [
  'iced-americano', 'americano', 'iced-latte', 'latte', 'oat-latte',
  'vanilla-oat-iced-latte', 'black-tea-lemonade', 'strawberry-acai-lemonade',
  'iced-matcha-latte', 'hot-chocolate', 'chamomile-tea', 'pistachio-oat-matcha',
];
const fixtureDrinks = legacyRecipeIds.map(id => {
  const recipe = drinks.find(candidate => candidate.id === id);
  if (!recipe) throw new Error(`Missing fixed rule-test recipe: ${id}`);
  return recipe;
});
const fixtureAvailability = Object.fromEntries(fixtureDrinks.map(recipe => [recipe.id, true]));

const preferences = (changes: Partial<Preferences> = {}): Preferences => ({
  ...defaultPreferences,
  ...changes,
});

describe('goal contradiction normalization', () => {
  it('clears only the coffee exclusion when the goal is coffee', () => {
    const current = Object.freeze(preferences({
      goal: 'coffee',
      avoidCoffee: true,
      temperature: 'iced',
      milk: 'oat',
      sweetness: 'less',
      budgetCents: 650,
    }));
    expect(normalizeGoalPreferences(current)).toEqual({ ...current, avoidCoffee: false });
    expect(current.avoidCoffee).toBe(true);
  });
});

describe('simplified finder normalization', () => {

  it('preserves milk, sweetness and no-coffee while normalizing a frozen input', () => {
    const current = Object.freeze(preferences({
      goal: 'refreshing',
      temperature: 'hot',
      avoidCoffee: true,
      milk: 'oat',
      sweetness: 'more',
      budgetCents: 750,
    }));
    expect(normalizeFinderPreferences(current)).toEqual({
      ...current,
      temperature: 'iced',
      budgetCents: null,
    });
    expect(current.temperature).toBe('hot');
    expect(current.budgetCents).toBe(750);
  });
});

describe('preference option feasibility', () => {

  it('disables a new hard choice when it conflicts with retained filters', () => {
    const current = preferences({ goal: 'coffee', milk: 'oat', budgetCents: 750 });
    expect(isPreferenceOptionPossible(fixtureDrinks, current, fixtureAvailability, { temperature: 'iced' })).toBe(false);
    expect(current.milk).toBe('oat');
    expect(current.budgetCents).toBe(750);
  });

  it('keeps every neutral recovery choice enabled with zero stock', () => {
    const current = preferences({ goal: 'coffee', temperature: 'hot', milk: 'oat', budgetCents: 100, avoidCoffee: true });
    for (const patch of [{ temperature: null }, { milk: null }, { budgetCents: null }, { avoidCoffee: false }, { goal: null }, {}]) {
      expect(isPreferenceOptionPossible(fixtureDrinks, current, {}, patch)).toBe(true);
    }
  });
});
