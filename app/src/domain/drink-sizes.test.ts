import { describe, expect, it } from 'vitest';
import { drinks } from './catalogue';
import type { CartItem } from './model';
import {
  addCartItem, cartItemKey, changeCartQuantity, editCartItemSize, getCartTotal, getDrinkSize, getDrinkSizes,
} from './drink-sizes';

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

  it.each(['iced', null] as const)('omits Short for temperature %s', (temperature) => {
    expect(getDrinkSizes({ ...iced, temperature })).toEqual([
      { id: 'tall', label: 'Tall', ounces: 12, priceCents: iced.priceCents },
      { id: 'grande', label: 'Grande', ounces: 16, priceCents: iced.priceCents + 75 },
      { id: 'venti', label: 'Venti', ounces: 20, priceCents: iced.priceCents + 150 },
    ]);
  });

  it.each([undefined, null, '', 'Grande', 'unknown', 12, {}, []])(
    'defaults an unknown candidate %j to Tall', (candidate) => {
      expect(getDrinkSize(hot, candidate)).toEqual({
        id: 'tall', label: 'Tall', ounces: 12, priceCents: hot.priceCents,
      });
    },
  );

  it('accepts a supported ID and defaults unavailable Short to Tall', () => {
    expect(getDrinkSize(hot, 'short').id).toBe('short');
    expect(getDrinkSize(iced, 'grande').id).toBe('grande');
    expect(getDrinkSize(iced, 'short').id).toBe('tall');
  });

  it('does not change Tall catalogue facts or scale recipe nutrition', () => {
    const before = { ...hot };
    getDrinkSizes(hot);
    getDrinkSize(hot, 'venti');
    expect(hot).toEqual(before);
    expect(getDrinkSize(hot, 'tall').priceCents).toBe(hot.priceCents);
  });
});

describe('cart size edits', () => {
  const other: CartItem = { drinkId: iced.id, sizeId: 'venti', quantity: 4 };

  it('changes a unique source at its existing position and preserves its entire quantity', () => {
    const cart = [other, tall, grande];
    expect(editCartItemSize(cart, tall, hot, 'short')).toEqual({
      cart: [other, { ...tall, sizeId: 'short' }, grande], status: 'updated',
    });
    expect(cart).toEqual([other, tall, grande]);
  });

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

  it('does not merge a different recipe with the selected size', () => {
    const cart = [tall, other];
    expect(editCartItemSize(cart, tall, hot, 'venti')).toEqual({
      cart: [{ ...tall, sizeId: 'venti' }, other], status: 'updated',
    });
  });

  it('returns unchanged for the same supported size', () => {
    const cart = [tall, grande];
    expect(editCartItemSize(cart, tall, hot, 'tall')).toEqual({ cart, status: 'unchanged' });
  });

  it('returns missing without inserting a nonexistent source', () => {
    const cart = [tall];
    expect(editCartItemSize(cart, grande, hot, 'venti')).toEqual({ cart, status: 'missing' });
    expect(editCartItemSize([], tall, hot, 'venti')).toEqual({ cart: [], status: 'missing' });
  });

  it('rejects a source and drink mismatch even when the source exists', () => {
    const cart = [tall, other];
    expect(editCartItemSize(cart, tall, iced, 'grande')).toEqual({ cart, status: 'missing' });
  });

  it.each(['iced', null] as const)('rejects unsupported Short for temperature %s without a Tall fallback', (temperature) => {
    const cart = [other, tall];
    expect(editCartItemSize(cart, other, { ...iced, temperature }, 'short')).toEqual({
      cart, status: 'invalid-size',
    });
  });

  it('rejects a previously invalid same-size selection rather than reporting success', () => {
    const unsupported: CartItem = { drinkId: iced.id, sizeId: 'short', quantity: 5 };
    const cart = [unsupported];
    expect(editCartItemSize(cart, unsupported, iced, 'short')).toEqual({ cart, status: 'invalid-size' });
  });

  it('allows a merge to exactly 99 without truncating quantity', () => {
    const source = { ...tall, quantity: 49 };
    const destination = { ...grande, quantity: 50 };
    expect(editCartItemSize([source, other, destination], source, hot, 'grande')).toEqual({
      cart: [other, { ...destination, quantity: 99 }], status: 'updated',
    });
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

  it('works with frozen input objects without mutating source, destination or unrelated lines', () => {
    const source = Object.freeze({ ...tall });
    const destination = Object.freeze({ ...grande });
    const unrelated = Object.freeze({ ...other });
    const cart = Object.freeze([source, unrelated, destination]);
    const result = editCartItemSize(cart, source, hot, 'grande');
    expect(result).toEqual({
      cart: [unrelated, { ...destination, quantity: 5 }], status: 'updated',
    });
    expect(source.quantity).toBe(2);
    expect(destination.quantity).toBe(3);
    expect(result.cart[0]).toBe(unrelated);
  });
});

describe('size-aware cart', () => {
  it('identifies the recipe and size pair, independently of quantity', () => {
    expect(cartItemKey(tall)).toBe(`${hot.id}:tall`);
    expect(cartItemKey(grande)).toBe(`${hot.id}:grande`);
    const largerQuantity: CartItem = { ...tall, quantity: 99 };
    expect(cartItemKey(largerQuantity)).toBe(cartItemKey(tall));
  });

  it('defaults quick-add to Tall and merges repeated additions', () => {
    const once = addCartItem([], iced);
    expect(once).toEqual([{ drinkId: iced.id, sizeId: 'tall', quantity: 1 }]);
    expect(addCartItem(once, iced)).toEqual([{ drinkId: iced.id, sizeId: 'tall', quantity: 2 }]);
    expect(once[0].quantity).toBe(1);
  });

  it('keeps separate sizes and recipes as separate lines in first-seen order', () => {
    const cart = addCartItem(addCartItem(addCartItem([], hot), hot, 'grande'), iced);
    expect(addCartItem(cart, hot, 'grande')).toEqual([
      { drinkId: hot.id, sizeId: 'tall', quantity: 1 },
      { drinkId: hot.id, sizeId: 'grande', quantity: 2 },
      { drinkId: iced.id, sizeId: 'tall', quantity: 1 },
    ]);
  });

  it('normalises unavailable Short when adding an iced recipe', () => {
    expect(addCartItem([], iced, 'short')).toEqual([
      { drinkId: iced.id, sizeId: 'tall', quantity: 1 },
    ]);
  });

  it('caps additions at 99 without modifying another size', () => {
    expect(addCartItem([{ ...tall, quantity: 99 }, grande], hot)).toEqual([
      { ...tall, quantity: 99 }, grande,
    ]);
  });

  it('changes only the requested recipe and size pair', () => {
    const other: CartItem = { drinkId: iced.id, sizeId: 'tall', quantity: 4 };
    const cart = [tall, grande, other];
    expect(changeCartQuantity(cart, tall, 1)).toEqual([{ ...tall, quantity: 3 }, grande, other]);
    expect(changeCartQuantity(cart, grande, -1)).toEqual([tall, { ...grande, quantity: 2 }, other]);
    expect(cart).toEqual([tall, grande, other]);
  });

  it('removes a line at zero and caps an increase at 99', () => {
    expect(changeCartQuantity([tall, grande], tall, -2)).toEqual([grande]);
    expect(changeCartQuantity([tall, grande], tall, -3)).toEqual([grande]);
    expect(changeCartQuantity([tall, grande], tall, 100)).toEqual([{ ...tall, quantity: 99 }, grande]);
  });

  it('does not create a missing pair', () => {
    expect(changeCartQuantity([tall], grande, 1)).toEqual([tall]);
  });

  it.each([NaN, Infinity, -Infinity, 0.5])('ignores an invalid quantity change %s', (delta) => {
    expect(changeCartQuantity([tall], tall, delta)).toEqual([tall]);
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

  it('ignores unknown recipes and any forged line-item quote', () => {
    const cart = [
      { ...grande, priceCents: 1 },
      { drinkId: 'missing', sizeId: 'tall' as const, quantity: 99, priceCents: 1 },
    ];
    expect(getCartTotal(cart, drinks)).toBe((hot.priceCents + 75) * grande.quantity);
  });
});
