import type { Drink, DrinkSizeId } from '../domain/model';
import { getDrinkSizes } from '../domain/drink-sizes';
import { Icon } from './Icon';

export function SizeChoices({ drink, value, onChange }: { drink: Drink; value: DrinkSizeId; onChange: (size: DrinkSizeId) => void }) {
  return <fieldset className="size-group"><legend className="small-label">Size</legend><div className="size-options">{getDrinkSizes(drink).map(size => <button type="button" key={size.id} className="size-choice" aria-label={`${size.label} ${size.ounces} oz`} aria-pressed={value === size.id} onClick={() => onChange(size.id)}><span className="size-cup"><Icon name="cup" size={size.ounces + 10} /></span><strong>{size.label}</strong><span>{size.ounces} oz</span>{value === size.id && <span className="size-check"><Icon name="check" size={12} /></span>}</button>)}</div></fieldset>;
}
