import { useState } from 'react';
import type { CartItem, Drink, DrinkSizeId } from '../domain/model';
import { formatPrice } from '../domain/model';
import { getDrinkSize } from '../domain/drink-sizes';
import { DrinkImage } from './DrinkImage';
import { Sheet } from './Sheet';
import { SizeChoices } from './SizeChoices';

export function CartSizeEditor({ item, drink, cart, available, onUpdate, onClose, returnFocus }: {
  item: CartItem; drink: Drink; cart: readonly CartItem[]; available: boolean;
  onUpdate: (size: DrinkSizeId) => boolean; onClose: () => void; returnFocus: () => HTMLElement | null;
}) {
  const [sizeId, setSizeId] = useState(item.sizeId);
  const [saved, setSaved] = useState(false);
  const size = getDrinkSize(drink, sizeId);
  const destination = sizeId !== item.sizeId && cart.find(line => line.drinkId === drink.id && line.sizeId === sizeId);
  const overflow = destination && destination.quantity + item.quantity > 99;
  return <Sheet title="Edit size" onClose={onClose} returnFocus={returnFocus} footer={close => <button className="button" disabled={saved || !available || sizeId === item.sizeId || !!overflow} onClick={() => {
    if (onUpdate(sizeId)) { setSaved(true); close(); }
  }}>Update order · {formatPrice(size.priceCents * item.quantity)}</button>}>
    <div className="cart-size-editor">
      <div className="cart-edit-product"><span className="product-thumb"><DrinkImage drink={drink} priority /></span><h3>{drink.name}</h3></div>
      <SizeChoices drink={drink} value={sizeId} onChange={setSizeId} />
      <div className="cart-edit-summary" aria-live="polite"><span>{item.quantity} {item.quantity === 1 ? 'drink' : 'drinks'}</span><span>{formatPrice(size.priceCents)} each</span></div>
      {!saved && (!available ? <p role="status">This drink is unavailable. Remove it or choose another.</p> : overflow ? <p role="status">Merging would exceed 99 drinks. Choose another size.</p> : destination ? <p role="status">Combines with your other {size.label}.</p> : null)}
    </div>
  </Sheet>;
}
