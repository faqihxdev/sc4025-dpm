import { describe, expect, it } from 'vitest';
import { drinks } from './catalogue';
import type { CartItem } from './model';
import { addCartItem, changeCartQuantity, editCartItemSize, getCartTotal, getDrinkSize, getDrinkSizes } from './drink-sizes';

const iced = drinks[0];
const hot = drinks[1];
const tall: CartItem = { drinkId: hot.id, sizeId: 'tall', quantity: 2 };
const grande: CartItem = { drinkId: hot.id, sizeId: 'grande', quantity: 3 };

describe('simulated drink sizes', () => {
  it('offers all four sizes for hot recipes at the specified SGD price offsets', () => {
    expect(getDrinkSizes(hot)).toEqual([
      { id: 'short', label: 'Short', ounces: 8, priceCents: hot.priceCents - 75 },
      { id: 'tall', label: 'Tall', ounces: 12, priceCents: hot.priceCents },
      { id: 'grande', label: 'Grande', ounces: 16, priceCents: hot.priceCents + 75 },
      { id: 'venti', label: 'Venti', ounces: 20, priceCents: hot.priceCents + 150 },
    ]);
  });

  it('accepts a supported ID and defaults unavailable Short to Tall', () => {
    expect(getDrinkSize(hot, 'short').id).toBe('short');
    expect(getDrinkSize(iced, 'grande').id).toBe('grande');
    expect(getDrinkSize(iced, 'short').id).toBe('tall');
  });
});

describe('cart size edits', () => {
  const other: CartItem = { drinkId: iced.id, sizeId: 'venti', quantity: 4 };

  it.each([false, true])('merges at the destination position when it precedes the source: %s', (destinationFirst) => {
    const cart = destinationFirst ? [grande, other, tall] : [tall, other, grande];
    const result = editCartItemSize(cart, tall, hot, 'grande');
    const merged = { ...grande, quantity: tall.quantity + grande.quantity };
    expect(result).toEqual({
      cart: destinationFirst ? [merged, other] : [other, merged], status: 'updated',
    });
    expect(result.cart.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(
      cart.reduce((sum, entry) => sum + entry.quantity, 0),
    );
    expect(cart).toEqual(destinationFirst ? [grande, other, tall] : [tall, other, grande]);
  });

  it('rejects a merge over 99 and preserves every line and quantity', () => {
    const source = { ...tall, quantity: 50 };
    const destination = { ...grande, quantity: 50 };
    const cart = [source, other, destination];
    const result = editCartItemSize(cart, source, hot, 'grande');
    expect(result).toEqual({ cart, status: 'quantity-limit' });
    expect(result.cart.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(104);
    expect(cart).toEqual([source, other, destination]);
  });
});

describe('size-aware cart', () => {

  it('keeps separate sizes and recipes as separate lines in first-seen order', () => {
    const cart = addCartItem(addCartItem(addCartItem([], hot), hot, 'grande'), iced);
    expect(addCartItem(cart, hot, 'grande')).toEqual([
      { drinkId: hot.id, sizeId: 'tall', quantity: 1 },
      { drinkId: hot.id, sizeId: 'grande', quantity: 2 },
      { drinkId: iced.id, sizeId: 'tall', quantity: 1 },
    ]);
  });

  it('removes a line at zero and caps an increase at 99', () => {
    expect(changeCartQuantity([tall, grande], tall, -2)).toEqual([grande]);
    expect(changeCartQuantity([tall, grande], tall, -3)).toEqual([grande]);
    expect(changeCartQuantity([tall, grande], tall, 100)).toEqual([{ ...tall, quantity: 99 }, grande]);
  });

  it('totals each selected size and quantity from current catalogue prices', () => {
    const cart: CartItem[] = [
      { drinkId: hot.id, sizeId: 'short', quantity: 1 }, tall, grande,
      { drinkId: iced.id, sizeId: 'venti', quantity: 2 },
    ];
    expect(getCartTotal(cart, drinks)).toBe(
      hot.priceCents - 75 + hot.priceCents * 2 + (hot.priceCents + 75) * 3
      + (iced.priceCents + 150) * 2,
    );
    expect(getCartTotal([], drinks)).toBe(0);
  });
});
