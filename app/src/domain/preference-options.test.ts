import { describe, expect, it } from 'vitest';
import { defaultAvailability, defaultPreferences, drinks } from './catalogue';
import type { Drink, Preferences } from './model';
import {
  countGoalMatches,
  isPreferenceOptionPossible,
  normalizeFinderPreferences,
  normalizeGoalPreferences,
} from './preference-options';
import { getRecommendations } from './recommendations';

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

function drink(id: string): Drink {
  const found = fixtureDrinks.find(recipe => recipe.id === id);
  if (!found) throw new Error(`Missing catalogue recipe: ${id}`);
  return found;
}

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

  it.each(['refreshing', 'comfort', null] as const)(
    'preserves no-coffee requirements for the %s goal',
    goal => {
      const current = preferences({ goal, avoidCoffee: true });
      expect(normalizeGoalPreferences(current)).toBe(current);
    },
  );

  it('does not clear other impossible filters or replace the selected goal', () => {
    const current = preferences({ goal: 'refreshing', temperature: 'hot', milk: 'oat', budgetCents: 100 });
    expect(normalizeGoalPreferences(current)).toBe(current);
  });

  it('is idempotent after normalizing a coffee contradiction', () => {
    const normalized = normalizeGoalPreferences(preferences({ goal: 'coffee', avoidCoffee: true }));
    expect(normalizeGoalPreferences(normalized)).toBe(normalized);
  });
});

describe('simplified finder normalization', () => {
  it.each(['refreshing', 'comfort', 'coffee', null] as const)(
    'clears a saved hidden budget for the %s goal',
    goal => {
      const current = preferences({ goal, budgetCents: 650 });
      expect(normalizeFinderPreferences(current).budgetCents).toBeNull();
      expect(current.budgetCents).toBe(650);
    },
  );

  it.each([
    ['refreshing', 'hot', 'iced'],
    ['refreshing', null, 'iced'],
    ['refreshing', 'iced', 'iced'],
    ['comfort', 'iced', 'hot'],
    ['comfort', null, 'hot'],
    ['comfort', 'hot', 'hot'],
  ] as const)('derives %s temperature from %s to %s', (goal, temperature, expected) => {
    const current = preferences({ goal, temperature });
    expect(normalizeFinderPreferences(current).temperature).toBe(expected);
    expect(current.temperature).toBe(temperature);
  });

  it.each(['hot', 'iced', null] as const)(
    'retains the visible coffee temperature %s while clearing no-coffee',
    temperature => {
      const current = preferences({ goal: 'coffee', temperature, avoidCoffee: true });
      expect(normalizeFinderPreferences(current)).toEqual({ ...current, avoidCoffee: false });
      expect(current.avoidCoffee).toBe(true);
    },
  );

  it.each(['hot', 'iced', null] as const)(
    'retains temperature %s with no goal and no-coffee selected',
    temperature => {
      const current = preferences({ goal: null, temperature, avoidCoffee: true, budgetCents: 100 });
      expect(normalizeFinderPreferences(current)).toEqual({ ...current, budgetCents: null });
    },
  );

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

  it.each([
    ['refreshing', 'iced'],
    ['comfort', 'hot'],
    ['coffee', 'hot'],
    [null, 'iced'],
  ] as const)('returns the same object for an unchanged %s finder state', (goal, temperature) => {
    const current = preferences({ goal, temperature, milk: 'dairy', sweetness: 'less' });
    expect(normalizeFinderPreferences(current)).toBe(current);
  });

  it.each(['refreshing', 'comfort', 'coffee', null] as const)(
    'is idempotent for the %s goal',
    goal => {
      const normalized = normalizeFinderPreferences(preferences({
        goal,
        temperature: 'hot',
        avoidCoffee: true,
        budgetCents: 650,
      }));
      expect(normalizeFinderPreferences(normalized)).toBe(normalized);
    },
  );
});

describe('goal-fitting candidate counts', () => {
  it.each(['coffee', 'refreshing', 'comfort', null] as const)(
    'counts the expanded catalogue for %s without capping the option count at three',
    goal => {
      const expected = drinks.filter(recipe => goal === null || recipe.goals.includes(goal)).length;
      expect(countGoalMatches(drinks, preferences({ goal }), defaultAvailability)).toBe(expected);
      expect(expected).toBeGreaterThan(3);
    },
  );
  it.each([
    ['coffee', 6],
    ['refreshing', 4],
    ['comfort', 4],
    [null, 12],
  ] as const)('counts all candidates for %s, not only the three recommendation cards', (goal, expected) => {
    expect(countGoalMatches(fixtureDrinks, preferences({ goal }), fixtureAvailability)).toBe(expected);
  });

  it('applies a hypothetical patch without changing any existing answers', () => {
    const current = Object.freeze(preferences({ goal: 'coffee', milk: 'dairy', budgetCents: 750 }));
    expect(countGoalMatches(fixtureDrinks, current, fixtureAvailability, { temperature: 'iced' })).toBe(1);
    expect(current.temperature).toBeNull();
    expect(current.milk).toBe('dairy');
    expect(current.budgetCents).toBe(750);
  });

  it('uses the hypothetical goal when supplied', () => {
    expect(countGoalMatches(fixtureDrinks, preferences({ goal: 'coffee' }), fixtureAvailability, { goal: 'comfort' })).toBe(4);
  });

  it('never counts soft-goal alternatives as fitting options', () => {
    const current = preferences({ goal: 'coffee', avoidCoffee: true });
    expect(countGoalMatches(fixtureDrinks, current, fixtureAvailability)).toBe(0);
    expect(getRecommendations(fixtureDrinks, current, fixtureAvailability)).toHaveLength(3);
    expect(getRecommendations(fixtureDrinks, current, fixtureAvailability).every(result => !result.goalMatch)).toBe(true);
    expect(current.avoidCoffee).toBe(true);
  });

  it('requires known stock and responds to stock changes', () => {
    const current = preferences({ goal: 'coffee' });
    expect(countGoalMatches(fixtureDrinks, current, {})).toBe(0);
    expect(countGoalMatches(fixtureDrinks, current, { 'iced-americano': true })).toBe(1);
    expect(countGoalMatches(fixtureDrinks, current, { 'iced-americano': false })).toBe(0);
  });

  it('uses an inclusive budget with all the other hard requirements', () => {
    const current = preferences({ goal: 'coffee', temperature: 'iced', milk: 'none' });
    expect(countGoalMatches(fixtureDrinks, current, fixtureAvailability, { budgetCents: 620 })).toBe(1);
    expect(countGoalMatches(fixtureDrinks, current, fixtureAvailability, { budgetCents: 619 })).toBe(0);
    expect(countGoalMatches(fixtureDrinks, current, fixtureAvailability, { budgetCents: 0 })).toBe(0);
  });

  it('excludes unknown recipe attributes for selected hard requirements', () => {
    const uncertain = { ...drink('iced-matcha-latte'), temperature: null, milk: null, containsCoffee: null };
    const current = preferences({ goal: 'refreshing' });
    expect(countGoalMatches([uncertain], current, fixtureAvailability)).toBe(1);
    expect(countGoalMatches([uncertain], current, fixtureAvailability, { temperature: 'iced' })).toBe(0);
    expect(countGoalMatches([uncertain], current, fixtureAvailability, { milk: 'dairy' })).toBe(0);
    expect(countGoalMatches([uncertain], current, fixtureAvailability, { avoidCoffee: true })).toBe(0);
  });

  it('does not mistake the green-coffee refresher for a no-coffee choice', () => {
    const refresher = drink('strawberry-acai-lemonade');
    expect(countGoalMatches([refresher], preferences({ goal: 'refreshing' }), fixtureAvailability, { avoidCoffee: true })).toBe(0);
  });

  it.each(['any', 'less', 'more'] as const)('sweetness %s does not change the candidate count', sweetness => {
    expect(countGoalMatches(fixtureDrinks, preferences({ goal: 'comfort' }), fixtureAvailability, { sweetness })).toBe(4);
  });

  it('ignores undefined patch fields rather than erasing an answer', () => {
    const current = preferences({ goal: 'coffee', temperature: 'iced' });
    expect(countGoalMatches(fixtureDrinks, current, fixtureAvailability, { temperature: undefined })).toBe(3);
  });
});

describe('preference option feasibility', () => {
  it('blocks the inherent coffee-goal/no-coffee conflict without normalizing the hypothetical patch', () => {
    expect(isPreferenceOptionPossible(fixtureDrinks, preferences({ goal: 'coffee' }), fixtureAvailability, { avoidCoffee: true })).toBe(false);
  });

  it.each([
    ['refreshing', 'hot'],
    ['comfort', 'iced'],
  ] as const)('blocks %s + %s because this catalogue has no fitting recipe', (goal, temperature) => {
    expect(isPreferenceOptionPossible(fixtureDrinks, preferences({ goal }), fixtureAvailability, { temperature })).toBe(false);
  });

  it('enables one available match instead of requiring three', () => {
    const current = preferences({ goal: 'refreshing', avoidCoffee: true });
    expect(isPreferenceOptionPossible(fixtureDrinks, current, fixtureAvailability, { milk: 'oat' })).toBe(true);
    expect(countGoalMatches(fixtureDrinks, current, fixtureAvailability, { milk: 'oat' })).toBe(1);
  });

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

  it.each(['any', 'less', 'more'] as const)('keeps ranking-only sweetness %s enabled even in an impossible state', sweetness => {
    const current = preferences({ goal: 'comfort', temperature: 'iced' });
    expect(isPreferenceOptionPossible(fixtureDrinks, current, {}, { sweetness })).toBe(true);
  });

  it('does not let a ranking or reset field bypass another strict choice in the same patch', () => {
    const current = preferences({ goal: 'refreshing' });
    expect(isPreferenceOptionPossible(fixtureDrinks, current, fixtureAvailability, { temperature: 'hot', sweetness: 'less' })).toBe(false);
    expect(isPreferenceOptionPossible(fixtureDrinks, current, fixtureAvailability, { temperature: 'hot', milk: null })).toBe(false);
  });

  it('keeps a full reset patch enabled even with no recipes', () => {
    expect(isPreferenceOptionPossible([], preferences(), {}, { temperature: null, milk: null, budgetCents: null, avoidCoffee: false, sweetness: 'any' })).toBe(true);
  });
});
