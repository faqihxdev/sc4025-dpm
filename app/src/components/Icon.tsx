import type { CSSProperties } from 'react';
import {
  ArrowLeft, Bean, Candy, Check, ChevronDown, ChevronRight, Clock3, Coffee, CupSoda,
  Gift, House, Info, Leaf, MapPin, Milk, Minus, Plus, QrCode, RotateCcw,
  Search, Settings, ShoppingBag, Sparkles, Sun, Thermometer, X,
} from 'lucide-react';

const icons = {
  back: ArrowLeft, chevron: ChevronRight, down: ChevronDown, close: X,
  search: Search, bag: ShoppingBag, cup: CupSoda, home: House,
  pin: MapPin, gift: Gift, qr: QrCode, settings: Settings,
  spark: Sparkles, sun: Sun, leaf: Leaf, steam: Coffee,
  check: Check, plus: Plus, minus: Minus, info: Info,
  reset: RotateCcw, clock: Clock3,
  temperature: Thermometer, coffee: Bean, sweetness: Candy,
  milk: Milk,
};

export type IconName = keyof typeof icons;
export function Icon({ name, size = 24, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  const Glyph = icons[name];
  return <Glyph className="ui-icon" data-icon={name} size={size} strokeWidth={1.8} aria-hidden="true" style={style} />;
}
