import type { Drink, Preferences } from './model';
import { isEligible } from './recommendations';

type PreferencePatch = Readonly<Partial<Preferences>>;

function withPatch(preferences: Preferences, patch: PreferencePatch): Preferences {
  const definedChanges = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  return { ...preferences, ...definedChanges };
}

export function normalizeGoalPreferences(preferences: Preferences): Preferences {
  return preferences.goal === 'coffee' && preferences.avoidCoffee
    ? { ...preferences, avoidCoffee: false }
    : preferences;
}

export function normalizeFinderPreferences(preferences: Preferences): Preferences {
  const normalized = normalizeGoalPreferences(preferences);
  const temperature = normalized.goal === 'refreshing'
    ? 'iced'
    : normalized.goal === 'comfort'
      ? 'hot'
      : normalized.temperature;

  return normalized.budgetCents === null && normalized.temperature === temperature
    ? normalized
    : { ...normalized, temperature, budgetCents: null };
}

export function countGoalMatches(
  drinks: readonly Drink[],
  preferences: Preferences,
  availability: Readonly<Record<string, boolean>>,
  patch: PreferencePatch = {},
): number {
  const next = withPatch(preferences, patch);
  return drinks.filter(drink =>
    (next.goal === null || drink.goals.includes(next.goal)) &&
    isEligible(drink, next, availability),
  ).length;
}

export function isPreferenceOptionPossible(
  drinks: readonly Drink[],
  preferences: Preferences,
  availability: Readonly<Record<string, boolean>>,
  patch: PreferencePatch,
): boolean {
  const hasStrictChoice = Object.entries(patch).some(([key, value]) =>
    value !== undefined && value !== null && key !== 'sweetness' &&
    !(key === 'avoidCoffee' && value === false),
  );
  return !hasStrictChoice || countGoalMatches(drinks, preferences, availability, patch) > 0;
}
