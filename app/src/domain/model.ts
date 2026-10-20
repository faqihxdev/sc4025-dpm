export type Goal = 'refreshing' | 'coffee' | 'comfort';

export type Temperature = 'hot' | 'iced';
export type DrinkSizeId = 'short' | 'tall' | 'grande' | 'venti';

export type Milk = 'dairy' | 'oat' | 'none';

export interface Preferences {
  goal: Goal | null;
  temperature: Temperature | null;
  avoidCoffee: boolean;
  sweetness: 'any' | 'less' | 'more';
  milk: Milk | null;
  budgetCents: number | null;
}

export interface Drink {
  id: string;
  name: string;
  description: string;
  category: 'coffee' | 'tea' | 'refreshers' | 'chocolate' | 'blended';
  image: string;
  imageFraming?: { scale: number; centerY: number };
  temperature: Temperature | null;
  containsCoffee: boolean | null;
  milk: Milk | null;
  sugarPer100ml: number | null;
  goals: Goal[];
  priceCents: number;
  size: string;
  sourceUrl: string;
  ingredientNotes: string;
  verifiedPriceCents: number | null;
  verifiedSize: string | null;
  evidenceNote: string;
}

export interface CartItem {
  drinkId: string;
  sizeId: DrinkSizeId;
  quantity: number;
}

export function formatPrice(cents: number): string {
  return `S$${(cents / 100).toFixed(2)}`;
}
