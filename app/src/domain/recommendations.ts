import { formatPrice } from './model';
import type { Drink, Goal, Preferences } from './model';

export interface Recommendation {
  drink: Drink;
  goalMatch: boolean;
  reasons: string[];
}

const goalReasons: Record<Goal, string> = {
  refreshing: 'Selected for a refreshing choice.',
  coffee: 'Selected for your coffee goal.',
  comfort: 'Selected for a warm, comforting choice.',
};

export function isEligible(
  drink: Drink,
  preferences: Preferences,
  availability: Readonly<Record<string, boolean>>,
): boolean {
  if (availability[drink.id] !== true) return false;
  if (preferences.temperature !== null && drink.temperature !== preferences.temperature) {
    return false;
  }
  if (preferences.avoidCoffee && drink.containsCoffee !== false) return false;
  if (preferences.milk !== null && drink.milk !== preferences.milk) return false;
  if (
    preferences.budgetCents !== null &&
    (!Number.isFinite(drink.priceCents) || drink.priceCents > preferences.budgetCents)
  ) {
    return false;
  }
  return true;
}

function goalMatches(drink: Drink, goal: Goal | null): boolean {
  return goal === null || drink.goals.includes(goal);
}

function comparableSugar(drink: Drink): number | null {
  return drink.sugarPer100ml !== null && Number.isFinite(drink.sugarPer100ml)
    ? drink.sugarPer100ml
    : null;
}

function compareDrinks(a: Drink, b: Drink, preferences: Preferences): number {
  const goalDifference =
    Number(goalMatches(b, preferences.goal)) - Number(goalMatches(a, preferences.goal));
  if (goalDifference !== 0) return goalDifference;

  if (preferences.sweetness !== 'any') {
    const aSugar = comparableSugar(a);
    const bSugar = comparableSugar(b);
    if (aSugar === null && bSugar !== null) return 1;
    if (aSugar !== null && bSugar === null) return -1;
    if (aSugar !== null && bSugar !== null && aSugar !== bSugar) {
      return preferences.sweetness === 'less' ? aSugar - bSugar : bSugar - aSugar;
    }
  }

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function explain(drink: Drink, preferences: Preferences, goalMatch: boolean): string[] {
  const reasons = [drink.ingredientNotes];

  if (preferences.goal !== null) {
    reasons.push(
      goalMatch
        ? goalReasons[preferences.goal]
        : 'Meets your requirements, but is an alternative to your goal.',
    );
  }
  if (preferences.temperature !== null) {
    reasons.push(preferences.temperature === 'iced' ? 'An iced recipe, as requested.' : 'A hot recipe, as requested.');
  }
  if (preferences.avoidCoffee) {
    reasons.push('No coffee listed in the described recipe. This does not mean caffeine-free.');
  }
  if (preferences.milk !== null) {
    const milkReasons = {
      dairy: 'Milk is part of the described recipe.',
      oat: 'Uses oatmilk in the described recipe.',
      none: 'No milk listed in the described recipe.',
    };
    reasons.push(milkReasons[preferences.milk]);
  }
  if (preferences.sweetness !== 'any') {
    const sugar = comparableSugar(drink);
    reasons.push(
      sugar === null
        ? 'Published sugar is unavailable; sweetness fit is uncertain.'
        : `${sugar} g total sugar per 100 mL of the default recipe.`,
    );
  }
  if (preferences.budgetCents !== null) {
    reasons.push(`Within your ${formatPrice(preferences.budgetCents)} demo budget.`);
  }

  return reasons;
}

export function getRecommendations(
  drinks: readonly Drink[],
  preferences: Preferences,
  availability: Readonly<Record<string, boolean>>,
): Recommendation[] {
  return drinks
    .filter((drink) => isEligible(drink, preferences, availability))
    .sort((a, b) => compareDrinks(a, b, preferences))
    .slice(0, 3)
    .map((drink) => {
      const goalMatch = goalMatches(drink, preferences.goal);
      return { drink, goalMatch, reasons: explain(drink, preferences, goalMatch) };
    });
}
