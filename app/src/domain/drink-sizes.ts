import type { CartItem, Drink, DrinkSizeId } from './model';

export interface DrinkSizeOption {
  id: DrinkSizeId;
  label: string;
  ounces: number;
  priceCents: number;
}

const sizes = [
  { id: 'short', label: 'Short', ounces: 8, adjustment: -75 },
  { id: 'tall', label: 'Tall', ounces: 12, adjustment: 0 },
  { id: 'grande', label: 'Grande', ounces: 16, adjustment: 75 },
  { id: 'venti', label: 'Venti', ounces: 20, adjustment: 150 },
] as const;

// Sizes and SGD prices are simulated; recipe nutrition is not scaled.
export function getDrinkSizes(drink: Drink): DrinkSizeOption[] {
  return sizes
    .filter(size => size.id !== 'short' || drink.temperature === 'hot')
    .map(size => ({
      id: size.id, label: size.label, ounces: size.ounces,
      priceCents: drink.priceCents + size.adjustment,
    }));
}

export function getDrinkSize(drink: Drink, candidate: unknown): DrinkSizeOption {
  const options = getDrinkSizes(drink);
  return options.find(size => size.id === candidate) ?? options.find(size => size.id === 'tall')!;
}

export function cartItemKey(item: Pick<CartItem, 'drinkId' | 'sizeId'>): string {
  return `${item.drinkId}:${item.sizeId}`;
}

export function addCartItem(
  cart: readonly CartItem[], drink: Drink, sizeId: DrinkSizeId = 'tall',
): CartItem[] {
  const item: CartItem = { drinkId: drink.id, sizeId: getDrinkSize(drink, sizeId).id, quantity: 1 };
  const key = cartItemKey(item);
  if (!cart.some(existing => cartItemKey(existing) === key)) return [...cart, item];
  return cart.map(existing => cartItemKey(existing) === key
    ? { ...existing, quantity: Math.min(99, existing.quantity + 1) }
    : existing);
}

export function changeCartQuantity(
  cart: readonly CartItem[], item: Pick<CartItem, 'drinkId' | 'sizeId'>, delta: number,
): CartItem[] {
  if (!Number.isInteger(delta)) return [...cart];
  const key = cartItemKey(item);
  return cart.map(existing => cartItemKey(existing) === key
    ? { ...existing, quantity: Math.min(99, existing.quantity + delta) }
    : existing).filter(existing => existing.quantity > 0);
}

export function editCartItemSize(
  cart: readonly CartItem[], item: Pick<CartItem, 'drinkId' | 'sizeId'>,
  drink: Drink, sizeId: DrinkSizeId,
): { cart: CartItem[]; status: 'updated' | 'unchanged' | 'missing' | 'invalid-size' | 'quantity-limit' } {
  const sourceIndex = cart.findIndex(existing => cartItemKey(existing) === cartItemKey(item));
  if (item.drinkId !== drink.id || sourceIndex < 0) return { cart: [...cart], status: 'missing' };
  if (!getDrinkSizes(drink).some(size => size.id === sizeId)) {
    return { cart: [...cart], status: 'invalid-size' };
  }
  if (item.sizeId === sizeId) return { cart: [...cart], status: 'unchanged' };

  const source = cart[sourceIndex];
  const destinationIndex = cart.findIndex(existing => existing.drinkId === drink.id && existing.sizeId === sizeId);
  if (destinationIndex < 0) {
    return {
      cart: cart.map((existing, index) => index === sourceIndex ? { ...existing, sizeId } : existing),
      status: 'updated',
    };
  }
  const quantity = source.quantity + cart[destinationIndex].quantity;
  if (quantity > 99) return { cart: [...cart], status: 'quantity-limit' };
  return {
    cart: cart.map((existing, index) => index === destinationIndex ? { ...existing, quantity } : existing)
      .filter((_, index) => index !== sourceIndex),
    status: 'updated',
  };
}

export function getCartTotal(cart: readonly CartItem[], catalogue: readonly Drink[]): number {
  return cart.reduce((total, item) => {
    const drink = catalogue.find(candidate => candidate.id === item.drinkId);
    return total + (drink ? getDrinkSize(drink, item.sizeId).priceCents * item.quantity : 0);
  }, 0);
}
