import { useRef, useState } from 'react';
import type { CartItem, Drink, DrinkSizeId } from '../domain/model';
import { formatPrice } from '../domain/model';
import { getDrinkSize } from '../domain/drink-sizes';
import { DrinkImage } from './DrinkImage';
import { Sheet } from './Sheet';
import { SizeChoices } from './SizeChoices';

// Use the same compact product, cup choices and fixed footer as cart editing.
// The conversation stays mounted; picking a size is a local order action.
export function ChatSizePicker({ drink, cart, available, onAdd, onClose, returnFocus }: {
  drink: Drink; cart: readonly CartItem[]; available: boolean;
  onAdd: (size: DrinkSizeId) => boolean; onClose: () => void; returnFocus: () => HTMLElement | null;
}) {
  const [sizeId, setSizeId] = useState<DrinkSizeId>('tall');
  const [added, setAdded] = useState(false);
  const submitted = useRef(false);
  const size = getDrinkSize(drink, sizeId);
  const atLimit = cart.some(item => item.drinkId === drink.id && item.sizeId === sizeId && item.quantity >= 99);

  return <Sheet title="Choose size" onClose={onClose} returnFocus={returnFocus} footer={close => <button className="button" disabled={added || !available || atLimit} onClick={() => {
    if (submitted.current) return;
    submitted.current = true;
    if (onAdd(sizeId)) { setAdded(true); close(); }
    else submitted.current = false;
  }}>Add to order · {formatPrice(size.priceCents)}</button>}>
    <div className="cart-size-editor chat-size-picker">
      <div className="cart-edit-product"><span className="product-thumb"><DrinkImage drink={drink} priority /></span><h3>{drink.name}</h3></div>
      <SizeChoices drink={drink} value={sizeId} onChange={setSizeId} />
      {!added && (!available ? <p role="status">This drink is unavailable. Choose another.</p> : atLimit ? <p role="status">You have 99 of this size. Choose another size.</p> : null)}
    </div>
  </Sheet>;
}
