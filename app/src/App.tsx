import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { defaultPreferences, drinks } from './domain/catalogue';
import type { CartItem, Drink, DrinkSizeId, Goal, Milk, Preferences } from './domain/model';
import { formatPrice } from './domain/model';
import { addCartItem, cartItemKey, changeCartQuantity, editCartItemSize, getCartTotal, getDrinkSize } from './domain/drink-sizes';
import { getRecommendations } from './domain/recommendations';
import { countGoalMatches, isPreferenceOptionPossible, normalizeFinderPreferences } from './domain/preference-options';
import { freshState, readSession, saveSession } from './session';
import { Icon } from './components/Icon';
import type { IconName } from './components/Icon';
import { DrinkImage } from './components/DrinkImage';
import { Sheet } from './components/Sheet';
import { SizeChoices } from './components/SizeChoices';
import { CartSizeEditor } from './components/CartSizeEditor';
import { ChatSizePicker } from './components/ChatSizePicker';
import { assetUrl } from './assets';
import { analytics } from './analytics/client';
import type { AnalyticsSource } from './analytics/client';
import { dismissFeedbackPrompt, isFeedbackPromptEligible, markFeedbackPromptShown, readFeedbackState } from './feedback/persistence';
import type { FeedbackVote } from './feedback/persistence';
import { isFeedbackPreview } from './feedback/preview';

// Load conversational discovery only when requested, keeping menu delivery light.
const DrinkChat = lazy(() => import('./chat/DrinkChat'));
const FeedbackSheet = lazy(() => import('./feedback/FeedbackSheet'));
const FeedbackThanks = lazy(() => import('./feedback/FeedbackThanks'));

const goals: { id: Goal; title: string; copy: string; icon: IconName; photo: string }[] = [
  { id: 'refreshing', title: 'Something refreshing', copy: 'Cool and bright.', icon: 'sun', photo: 'black-tea-lemonade' },
  { id: 'coffee', title: 'A coffee boost', copy: 'Espresso and coffee favourites.', icon: 'cup', photo: 'iced-americano' },
  { id: 'comfort', title: 'Warm and comforting', copy: 'Hot chocolate, tea and cosy sips.', icon: 'steam', photo: 'hot-chocolate' },
];
const categories = [{ id: 'all', label: 'All drinks' }, { id: 'coffee', label: 'Coffee' }, { id: 'tea', label: 'Tea' }, { id: 'refreshers', label: 'Refreshers' }, { id: 'chocolate', label: 'Chocolate' }, { id: 'blended', label: 'Frappuccino' }];
const milkLabels: Record<Milk, string> = { dairy: 'Dairy milk', oat: 'Oatmilk', none: 'No milk listed' };
const routeNow = () => window.location.hash.slice(1) || '/menu';
function useRoute() {
  const [route, setRoute] = useState(routeNow);
  const [direction, setDirection] = useState('none');
  const previous = useRef(route);
  const commitRoute = (next: string) => {
    if (next === previous.current) return;
    const depth = (path: string) => path.startsWith('/drink/') ? 4 : ({ '/menu': 0, '/home': 0, '/goal': 1, '/preferences': 2, '/chat': 2, '/results': 3, '/cart': 4 }[path.split('?')[0]] ?? 0);
    setDirection(document.documentElement.dataset.goalTransition || document.documentElement.dataset.drinkTransition ? 'none' : depth(next) < depth(previous.current) ? 'back' : 'forward');
    previous.current = next;
    setRoute(next);
  };
  useEffect(() => {
    const update = () => commitRoute(routeNow());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const replaceRoute = (next: string) => { window.history.replaceState(null, '', `#${next}`); previous.current = next; setDirection('none'); setRoute(next); };
  return [route, (next: string) => { window.location.hash = next; commitRoute(next); }, direction, replaceRoute] as const;
}
function Button({ children, onClick, secondary = false, disabled = false }: { children: ReactNode; onClick: () => void; secondary?: boolean; disabled?: boolean }) {
  return <button className={`button ${secondary ? 'button-secondary' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Choice({ selected, children, onClick, disabled = false }: { selected: boolean; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className={`choice ${selected ? 'choice-selected' : ''}`} aria-pressed={selected} disabled={disabled} aria-describedby={disabled ? 'preference-availability-help' : undefined} onClick={onClick}><span>{children}</span>{selected && <span className="choice-mark"><Icon name="check" size={16} /></span>}</button>;
}
function PreferenceLegend({ icon, children }: { icon: IconName; children: ReactNode }) {
  return <legend><span><Icon name={icon} size={18} />{children}</span></legend>;
}
function Meta({ drink, sizeId }: { drink: Drink; sizeId?: DrinkSizeId }) {
  const size = sizeId && getDrinkSize(drink, sizeId);
  return <span className="product-meta">{size ? `${size.label} · ${size.ounces} oz` : drink.size}{drink.temperature && ` · ${drink.temperature === 'iced' ? 'Iced' : 'Hot'}`}{drink.milk && drink.milk !== 'none' && ` · ${milkLabels[drink.milk]}`}</span>;
}

const recipeSummaries: Record<string, string> = {
  'iced-americano': 'Espresso and water over ice.',
  americano: 'Espresso and hot water.',
  'iced-latte': 'Espresso with chilled milk.',
  latte: 'Espresso with steamed milk.',
  'oat-latte': 'Espresso with oatmilk.',
  'vanilla-oat-iced-latte': 'Vanilla, espresso and oatmilk.',
  'black-tea-lemonade': 'Black tea with bright lemonade.',
  'strawberry-acai-lemonade': 'Strawberry, açai and lemonade.',
  'iced-matcha-latte': 'Matcha blended with milk.',
  'hot-chocolate': 'Chocolate, steamed milk and cream.',
  'chamomile-tea': 'Chamomile, rose petals and herbs.',
  'pistachio-oat-matcha': 'Matcha with pistachio-flavoured oatmilk.',
};

function MatchReasons({ drink, preferences }: { drink: Drink; preferences: Preferences }) {
  const notes = [recipeSummaries[drink.id] || drink.description];
  if (preferences.avoidCoffee) notes.push('No coffee listed in the described recipe.');
  const sugar = preferences.sweetness === 'any' ? '' : drink.sugarPer100ml === null ? 'Sugar data unavailable.' : `${drink.sugarPer100ml} g sugar per 100 mL.`;
  if (sugar) notes.push(sugar);
  return <ul className="match-reasons">{notes.map(note => <li key={note}><Icon name="check" size={16} /><span>{note}</span></li>)}</ul>;
}

export default function App() {
  const [state, setState] = useState(() => { const saved = readSession(); return { ...saved, preferences: normalizeFinderPreferences(saved.preferences) }; });
  const [route, navigate, direction, replaceRoute] = useRoute();
  const [panel, setPanel] = useState<'settings' | 'store' | 'about' | null>(null);
  const [cartEdit, setCartEdit] = useState<CartItem | null>(null);
  const cartEditFocus = useRef<string | null>(null);
  const [chatAddDrink, setChatAddDrink] = useState<Drink | null>(null);
  const chatAddFocus = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [toast, setToast] = useState('');
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(analytics.isEnabled);
  const [feedbackPreview] = useState(isFeedbackPreview);
  const [feedbackOpen, setFeedbackOpen] = useState(isFeedbackPreview);
  const [feedbackNotice, setFeedbackNotice] = useState<FeedbackVote | null>(null);
  const [feedbackCommentVote, setFeedbackCommentVote] = useState<FeedbackVote | undefined>();
  const [feedbackReady, setFeedbackReady] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const feedbackAutomatic = useRef(false);
  const feedbackFocus = useRef<HTMLElement | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [movingDrink, setMovingDrink] = useState<string | null>(null);
  const main = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textTransition = useRef<ViewTransition | null>(null);
  const drinkOrigin = useRef<{ id: string; sizeId: DrinkSizeId; route: '/menu' | '/results' | '/cart' | '/chat'; scroll: number; visible: boolean } | null>(null);
  const nextScroll = useRef(0);
  const screen = route.split('?')[0];
  const selected = screen.startsWith('/drink/') ? drinks.find(d => d.id === screen.slice(7)) : undefined;
  const selectedSize = selected && getDrinkSize(selected, new URLSearchParams(route.split('?')[1] || '').get('size'));
  const editingDrink = cartEdit && drinks.find(drink => drink.id === cartEdit.drinkId);
  const origin = new URLSearchParams(route.split('?')[1] || '').get('from');
  const from = origin === 'results' ? '/results' : origin === 'cart' ? '/cart' : origin === 'chat' ? '/chat' : '/menu';
  const results = getRecommendations(drinks, state.preferences, state.availability);
  const cartCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = getCartTotal(state.cart, drinks);
  const currentGoal = goals.find(g => g.id === state.preferences.goal);
  const isMenu = screen === '/menu' || screen === '/home';
  const isGoal = screen === '/goal' || ((screen === '/preferences' || screen === '/results') && !currentGoal);
  const isPreferences = screen === '/preferences' && !isGoal;
  const isResults = screen === '/results' && !isGoal;
  const isChat = screen === '/chat' || (import.meta.env.DEV && isGoal && new URLSearchParams(window.location.search).has('variant'));
  const title = isChat ? 'Help me choose' : selected ? 'Drink details' : isGoal ? 'Find my drink' : screen === '/preferences' ? 'Preferences' : screen === '/results' ? 'Your drink picks' : screen === '/cart' ? 'Your order' : 'Order';
  const back = selected ? from : isChat || screen === '/preferences' ? '/goal' : screen === '/results' ? '/preferences' : '/menu';
  const menuDrinks = drinks.filter(d => (category === 'all' || d.category === category) && d.name.toLowerCase().includes(query.toLowerCase()));
  const possible = (patch: Partial<Preferences>) => isPreferenceOptionPossible(drinks, state.preferences, state.availability, patch);
  const strictOptions: Partial<Preferences>[] = [...(state.preferences.goal === 'coffee' ? [{ temperature: 'iced' } as const, { temperature: 'hot' } as const] : [{ avoidCoffee: true }]), { milk: 'dairy' }, { milk: 'oat' }, { milk: 'none' }];
  const hasBlockedOption = strictOptions.some(patch => !possible(patch));
  const goalMatchCount = countGoalMatches(drinks, state.preferences, state.availability);
  const isMovingDrink = (drink: Drink, sizeId?: DrinkSizeId) => movingDrink === drink.id && (!sizeId || drinkOrigin.current?.sizeId === sizeId);
  const drinkTitleProps = (drink: Drink, sizeId?: DrinkSizeId) => ({ className: 'drink-title', 'data-drink': drink.id, 'data-size': sizeId, style: { viewTransitionName: isMovingDrink(drink, sizeId) ? `drink-${drink.id}` : 'none' } });
  const drinkImageName = (drink: Drink, sizeId?: DrinkSizeId) => isMovingDrink(drink, sizeId) ? `drink-image-${drink.id}` : 'none';

  useEffect(() => analytics.start(), []);
  useEffect(() => analytics.subscribe(() => setAnalyticsEnabled(analytics.isEnabled())), []);
  useEffect(() => {
    if (isMenu) analytics.feature('menu');
    else if (isGoal || isPreferences || isResults) analytics.feature('quick_choices');
    else if (isChat) analytics.feature('chat');
    if (isResults) analytics.recommendations('quick_choices', results.length);
  }, [screen]);
  useEffect(() => {
    if (!feedbackReady) return;
    if (!analyticsEnabled || feedbackPreview || !isFeedbackPromptEligible()) { setFeedbackReady(false); return; }
    // Ask after discovery succeeds, without interrupting ordering or a reply.
    if (isPreferences || isGoal || screen === '/cart' || panel || cartEdit || chatAddDrink || feedbackOpen || feedbackNotice || (isChat && chatBusy)) return;
    const show = () => {
      if (document.visibilityState !== 'visible' || document.activeElement?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
      if (!analytics.isEnabled() || !isFeedbackPromptEligible()) { setFeedbackReady(false); return; }
      markFeedbackPromptShown();
      feedbackAutomatic.current = true;
      feedbackFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setFeedbackOpen(true);
      setFeedbackReady(false);
    };
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    // Wait for a blur's click to finish, so another drawer takes precedence.
    const check = () => { if (focusTimer) clearTimeout(focusTimer); focusTimer = setTimeout(show, 0); };
    show();
    document.addEventListener('visibilitychange', check);
    document.addEventListener('focusout', check);
    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      document.removeEventListener('visibilitychange', check);
      document.removeEventListener('focusout', check);
    };
  }, [feedbackReady, analyticsEnabled, feedbackPreview, screen, isChat, isGoal, isPreferences, chatBusy, panel, cartEdit, chatAddDrink, feedbackOpen, feedbackNotice]);
  useEffect(() => { setStorageAvailable(saveSession(state)); }, [state]);
  useEffect(() => {
    // Old preview links now open the actual conversation route.
    const url = new URL(window.location.href);
    if (import.meta.env.DEV && url.searchParams.has('variant')) {
      url.searchParams.delete('variant');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      navigate('/chat');
    }
  }, []);
  useLayoutEffect(() => { main.current?.scrollTo({ top: nextScroll.current }); nextScroll.current = 0; main.current?.focus({ preventScroll: true }); }, [screen]);
  useEffect(() => { setCartEdit(null); setChatAddDrink(null); }, [screen]);
  useEffect(() => () => { if (toastTimeout.current) clearTimeout(toastTimeout.current); if (feedbackTimer.current) clearTimeout(feedbackTimer.current); }, []);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(''), 3500);
  };
  const update = (patch: Partial<Preferences>) => setState(s => ({ ...s, preferences: normalizeFinderPreferences({ ...s.preferences, ...patch }) }));
  const choose = (patch: Partial<Preferences>) => { if (possible(patch)) update(patch); };
  const moveText = (kind: 'goal' | 'drink', key: string, change: () => void) => {
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { change(); return; }
    textTransition.current?.skipTransition();
    delete document.documentElement.dataset.goalTransition;
    delete document.documentElement.dataset.drinkTransition;
    if (kind === 'goal') document.documentElement.dataset.goalTransition = key;
    else document.documentElement.dataset.drinkTransition = key;
    // Give only the selected title a shared name before the browser's old snapshot.
    flushSync(() => setMovingDrink(kind === 'drink' ? key : null));
    const transition = document.startViewTransition(() => flushSync(change));
    textTransition.current = transition;
    void transition.ready.catch(() => { /* An interrupted transition still applies its route update. */ });
    void transition.finished.finally(() => {
      if (textTransition.current === transition) {
        textTransition.current = null;
        delete document.documentElement.dataset.goalTransition;
        delete document.documentElement.dataset.drinkTransition;
        setMovingDrink(null);
      }
    }).catch(() => {});
  };
  const moveGoal = (next: '/goal' | '/preferences', goal?: Goal) => moveText('goal', goal ?? state.preferences.goal ?? '', () => { if (goal) { analytics.beginFlow('quick_choices'); update({ goal, ...(goal === 'coffee' && state.preferences.goal !== 'coffee' ? { temperature: null } : {}) }); } navigate(next); });
  const openDrink = (drink: Drink, origin: '/menu' | '/results' | '/cart' | '/chat', sizeId: DrinkSizeId = 'tall') => {
    if (origin !== '/cart') analytics.view(origin === '/results' ? 'quick_choices' : origin === '/chat' ? 'chat' : 'menu');
    const titleBox = main.current?.querySelector(`[data-drink="${drink.id}"]${origin === '/cart' ? `[data-size="${sizeId}"]` : ''}`)?.getBoundingClientRect();
    const scrollBox = main.current?.getBoundingClientRect();
    const visible = !!titleBox && !!scrollBox && titleBox.top >= scrollBox.top && titleBox.bottom <= scrollBox.bottom;
    drinkOrigin.current = { id: drink.id, sizeId, route: origin, scroll: main.current?.scrollTop ?? 0, visible };
    const change = () => navigate(`/drink/${drink.id}?from=${origin.slice(1)}&size=${sizeId}`);
    if (visible) moveText('drink', drink.id, change); else change();
  };
  const goBack = () => {
    const source = drinkOrigin.current;
    const inSource = selected && (from === '/chat' || (from === '/menu' ? menuDrinks.some(d => d.id === selected.id) : from === '/results' ? results.some(r => r.drink.id === selected.id) : state.cart.some(i => i.drinkId === selected.id && i.sizeId === source?.sizeId)));
    const change = () => { if (source?.id === selected?.id && source?.route === from) nextScroll.current = source.scroll; navigate(back); };
    if (selected && source?.id === selected.id && source.route === from && source.visible && inSource) moveText('drink', selected.id, change);
    else change();
  };
  const chooseSize = (sizeId: DrinkSizeId) => {
    if (!selected) return;
    const params = new URLSearchParams(route.split('?')[1] || '');
    params.set('size', sizeId);
    replaceRoute(`${screen}?${params}`);
  };
  const add = (drink: Drink, sizeId: DrinkSizeId = 'tall', source: AnalyticsSource = from === '/results' ? 'quick_choices' : from === '/chat' ? 'chat' : 'menu') => {
    if (!state.availability[drink.id]) { notify('This drink is no longer available. Choose another drink.'); return false; }
    const existing = state.cart.find(i => i.drinkId === drink.id && i.sizeId === sizeId);
    if (existing && existing.quantity >= 99) { notify('This demo supports up to 99 of each drink.'); return false; }
    setState(s => ({ ...s, cart: addCartItem(s.cart, drink, sizeId) }));
    analytics.complete(source);
    if ((source === 'quick_choices' || source === 'chat') && analyticsEnabled && !feedbackPreview && isFeedbackPromptEligible() && !feedbackTimer.current && !feedbackReady) {
      feedbackTimer.current = setTimeout(() => { feedbackTimer.current = null; setFeedbackReady(true); }, 4000);
    }
    notify(`${drink.name} added to your order.`);
    return true;
  };
  const changeQuantity = (item: CartItem, delta: number) => {
    if (delta > 0 && !state.availability[item.drinkId]) { notify('This drink is unavailable. Remove it or choose another.'); return; }
    setState(s => ({ ...s, cart: changeCartQuantity(s.cart, item, delta) }));
  };
  const updateCartSize = (sizeId: DrinkSizeId) => {
    if (!cartEdit || !editingDrink || !state.availability[editingDrink.id]) return false;
    const result = editCartItemSize(state.cart, cartEdit, editingDrink, sizeId);
    if (result.status !== 'updated') { notify('This item changed. Close and edit it again.'); return false; }
    cartEditFocus.current = cartItemKey({ drinkId: editingDrink.id, sizeId });
    setState(s => ({ ...s, cart: result.cart }));
    notify('Order updated.');
    return true;
  };
  const openFeedback = () => {
    if (feedbackTimer.current) { clearTimeout(feedbackTimer.current); feedbackTimer.current = null; }
    setFeedbackReady(false);
    feedbackFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    feedbackAutomatic.current = false;
    if (!feedbackPreview) markFeedbackPromptShown();
    setPanel(null);
    setFeedbackNotice(null);
    setFeedbackCommentVote(undefined);
    setFeedbackOpen(true);
  };
  const closeFeedback = () => {
    if (!feedbackPreview && feedbackAutomatic.current && !readFeedbackState().vote) dismissFeedbackPrompt();
    feedbackAutomatic.current = false;
    setFeedbackOpen(false);
    setFeedbackCommentVote(undefined);
  };
  const feedbackSaved = (vote: FeedbackVote) => {
    feedbackAutomatic.current = false;
    setFeedbackOpen(false);
    setFeedbackCommentVote(undefined);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast('');
    setFeedbackNotice(vote);
  };
  const addFeedbackComment = () => {
    if (!feedbackNotice) return;
    feedbackAutomatic.current = false;
    setFeedbackCommentVote(feedbackNotice);
    setFeedbackNotice(null);
    setFeedbackOpen(true);
  };

  const menu = <>
    <div className="content-pad">
      <section className="finder-banner">
        <div className="finder-banner-copy"><div className="finder-banner-text"><h2>Find My Drink</h2><p>We'll help you find your perfect drink</p></div><Button onClick={() => navigate('/goal')}>Try it now <Icon name="spark" size={18} /></Button></div>
        <img className="banner-drink" src={assetUrl('/images/finder-drinks-small.webp')} srcSet={`${assetUrl('/images/finder-drinks-small.webp')} 200w, ${assetUrl('/images/finder-drinks.webp')} 400w`} sizes="(max-width: 359px) 136px, 164px" width="400" height="400" alt="Matcha, strawberry and iced coffee drinks" fetchPriority="high" decoding="async" />
      </section>
      <div className="search-field"><Icon name="search" size={20} /><input ref={search} aria-label="Search drinks" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search drinks" />{query && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setQuery(''); search.current?.focus({ preventScroll: true }); }}><Icon name="close" size={18} /></button>}</div>
    </div>
    <div className="category-tabs" aria-label="Drink categories">{categories.map(c => <button key={c.id} className={category === c.id ? 'category-active' : ''} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.label}</button>)}</div>
    <div className={`content-pad menu-products ${!menuDrinks.length ? 'menu-products-empty' : ''}`}>
      {!!menuDrinks.length && <><div className="section-title"><h2>{categories.find(c => c.id === category)?.label}</h2><span>{menuDrinks.length} drinks</span></div><p className="menu-demo-label">Demo prices and availability</p></>}
      {menuDrinks.map((drink, index) => <button className="product-row" key={drink.id} onClick={() => openDrink(drink, '/menu')}>
        <span className="product-thumb"><DrinkImage drink={drink} priority={index < 2} transitionName={drinkImageName(drink)} /></span>
        <span className="product-row-copy"><strong {...drinkTitleProps(drink)}>{drink.name}</strong><Meta drink={drink} /><span className="product-price">{formatPrice(drink.priceCents)}{!state.availability[drink.id] && <span className="unavailable-label">Unavailable</span>}</span></span><Icon name="chevron" size={18} />
      </button>)}
      {!menuDrinks.length && <section className="empty-state search-empty" role="status"><span className="empty-symbol"><Icon name="search" size={32} /></span><div className="empty-copy"><h2>No drinks found</h2><p>Try another name or browse all drinks.</p></div><Button secondary onClick={() => { setQuery(''); setCategory('all'); }}>Show all drinks</Button></section>}
    </div>
  </>;

  const goalScreen = <div className="content-pad finder-page">
    <h1>What sounds good?</h1>
    <div className="goal-list">{goals.map(goal => <button key={goal.id} className="goal-card" onClick={() => moveGoal('/preferences', goal.id)}>
      <span className="goal-photo" aria-hidden="true"><DrinkImage drink={drinks.find(drink => drink.id === goal.photo)!} priority /></span><span className="goal-copy"><strong className="goal-title" data-goal={goal.id} style={{ viewTransitionName: `goal-${goal.id}` }}>{goal.title}</strong><small>{goal.copy}</small></span><span className="goal-check"><Icon name="chevron" size={18} /></span>
    </button>)}<button className="goal-card" onClick={() => navigate('/chat')}><span className="goal-photo goal-chat-photo" aria-hidden="true"><img src={assetUrl('/illustrations/drink-discovery.webp')} width="192" height="192" alt="" decoding="async" /></span><span className="goal-copy"><strong>Help me choose</strong><small>Chat your way to a new favourite.</small></span><span className="goal-check"><Icon name="chevron" size={18} /></span></button></div>
    <div className="flow-actions"><button className="text-button" onClick={() => navigate('/menu')}>Browse the menu instead</button></div>
  </div>;

  const preferenceScreen = <div className="content-pad finder-page preferences-page">
    {state.preferences.goal === 'coffee' && <fieldset className="preference-group"><PreferenceLegend icon="temperature">Hot or iced?</PreferenceLegend><div className="choices"><Choice selected={!state.preferences.temperature} onClick={() => choose({ temperature: null })}>Either</Choice><Choice selected={state.preferences.temperature === 'iced'} disabled={!possible({ temperature: 'iced' })} onClick={() => choose({ temperature: 'iced' })}>Iced</Choice><Choice selected={state.preferences.temperature === 'hot'} disabled={!possible({ temperature: 'hot' })} onClick={() => choose({ temperature: 'hot' })}>Hot</Choice></div></fieldset>}
    {state.preferences.goal !== 'coffee' && <fieldset className="preference-group"><PreferenceLegend icon="coffee">Coffee ingredients</PreferenceLegend><div className="choices"><Choice selected={!state.preferences.avoidCoffee} onClick={() => choose({ avoidCoffee: false })}>No preference</Choice><Choice selected={state.preferences.avoidCoffee} disabled={!possible({ avoidCoffee: true })} onClick={() => choose({ avoidCoffee: true })}>No coffee</Choice></div></fieldset>}
    <fieldset className="preference-group"><PreferenceLegend icon="sweetness">Sweetness</PreferenceLegend><div className="choices"><Choice selected={state.preferences.sweetness === 'any'} onClick={() => choose({ sweetness: 'any' })}>No preference</Choice><Choice selected={state.preferences.sweetness === 'less'} onClick={() => choose({ sweetness: 'less' })}>Less sweet</Choice><Choice selected={state.preferences.sweetness === 'more'} onClick={() => choose({ sweetness: 'more' })}>Sweeter</Choice></div></fieldset>
    <fieldset className="preference-group"><PreferenceLegend icon="milk">Milk in the recipe</PreferenceLegend><div className="choices"><Choice selected={!state.preferences.milk} onClick={() => choose({ milk: null })}>No preference</Choice>{(['dairy', 'oat', 'none'] as const).map(milk => <Choice key={milk} selected={state.preferences.milk === milk} disabled={!possible({ milk })} onClick={() => choose({ milk })}>{milkLabels[milk]}</Choice>)}</div></fieldset>
    <div className="flow-actions"><button className="text-button" onClick={() => update({ ...defaultPreferences, goal: state.preferences.goal })}>Clear optional preferences</button></div>
    {hasBlockedOption && <p id="preference-availability-help" className="preference-availability-help">{goalMatchCount ? 'Unavailable options have no matching drinks.' : 'No match with these choices. Clear a preference to try again.'}</p>}
  </div>;

  const resultScreen = <div className="content-pad results-page">
    {!results.length && <div className="no-match-copy"><h2>No drink fits just yet.</h2><p className="intro-copy">No available drink fits. Your choices are saved.</p></div>}
    {!!results.length && !results.some(r => r.goalMatch) && <p className="notice"><Icon name="info" size={18} />None fits your goal with these requirements. These alternatives still meet your filters.</p>}
    {!results.length && <div className="no-match-art" aria-hidden="true"><Icon name="cup" size={78} /><Icon name="search" size={36} /></div>}
    <div className="result-list">{results.map(({ drink, goalMatch }, index) => <article className="result-card" key={drink.id}>
      <div className="result-head"><span className="result-thumb"><DrinkImage drink={drink} priority={index === 0} transitionName={drinkImageName(drink)} /></span><div className="result-summary"><span className="result-label">{goalMatch ? index === 0 ? 'Your top pick' : 'Fits your goal' : 'An alternative'}</span><h2 {...drinkTitleProps(drink)}>{drink.name}</h2><Meta drink={drink} /></div></div>
      <MatchReasons drink={drink} preferences={state.preferences} /><div className="result-actions"><strong>{formatPrice(drink.priceCents)}</strong><button className="button button-secondary" onClick={() => openDrink(drink, '/results')}>See drink <Icon name="chevron" size={16} /></button></div>
    </article>)}</div>
    <div className="flow-actions">{!results.length ? <Button onClick={() => navigate('/preferences')}>Edit my preferences</Button> : <button className="text-button" onClick={() => navigate('/preferences')}>Edit my preferences</button>}<Button secondary onClick={() => navigate('/menu')}>Browse the menu</Button></div>
  </div>;

  const details = selected && <>
    <div className="detail-hero"><DrinkImage drink={selected} large priority transitionName={drinkImageName(selected)} /></div>
    <div className="content-pad detail-copy"><h1 {...drinkTitleProps(selected)}>{selected.name}</h1><p className="intro-copy">{selected.description}</p><div className="detail-price" aria-live="polite"><strong>{formatPrice(selectedSize!.priceCents)}</strong><span>Demo price</span></div>
      <section className="recipe-section"><SizeChoices drink={selected} value={selectedSize!.id} onChange={chooseSize} />
        <div className="recipe-line"><span>Temperature</span><strong>{selected.temperature === 'hot' ? 'Hot' : selected.temperature === 'iced' ? 'Iced' : 'Not confirmed'}</strong></div>{selected.milk !== 'none' && <div className="recipe-line"><span>Milk recipe</span><strong>{selected.milk ? milkLabels[selected.milk] : 'Not confirmed'}</strong></div>}<div className="recipe-line"><span>Coffee ingredients</span><strong>{selected.containsCoffee === true ? 'Contains coffee' : selected.containsCoffee === false ? 'None listed' : 'Not confirmed'}</strong></div>
      </section>
      {from === '/results' && <section className="why-section"><h2>Why this drink?</h2>{results.some(r => r.drink.id === selected.id) ? <MatchReasons drink={selected} preferences={state.preferences} /> : <p className="helper-copy">Your choices or stock changed. Return to your picks.</p>}</section>}
      <details className="ingredient-details"><summary>Ingredients and recipe information <Icon name="down" size={18} /></summary><p>{selected.ingredientNotes}</p>{selected.sugarPer100ml !== null && <p>Published total sugar: {selected.sugarPer100ml} g per 100 mL of the default recipe before ice. This is not serving-total or added sugar.</p>}<p>Shared equipment means Starbucks cannot guarantee products are free of allergens. Reference-photo labels may differ from published recipe information.</p><p>{selected.evidenceNote}</p><a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">View Starbucks Singapore recipe</a></details>
      {!state.availability[selected.id] && <p className="notice" role="status"><Icon name="info" size={18} />This recipe is unavailable in the current demo stock. Return to the menu or your picks.</p>}
    </div>
  </>;

  const cart = <div className="content-pad cart-page">
    {cartCount ? <><h1>Your drink order.</h1><p className="intro-copy">Review your drinks and quantities.</p></> : <section className="empty-state cart-empty"><span className="empty-symbol"><Icon name="bag" size={40} /></span><div className="empty-copy"><h1>Your order is empty.</h1><p>Choose a drink from the menu or find one that suits you.</p></div><div className="empty-actions"><Button onClick={() => navigate('/menu')}>Browse the menu</Button><button className="text-button" onClick={() => navigate('/goal')}>Find my drink</button></div></section>}
    {state.cart.map(item => { const drink = drinks.find(d => d.id === item.drinkId); if (!drink) return null; const size = getDrinkSize(drink, item.sizeId); return <article className="cart-item" key={cartItemKey(item)} data-cart-line={cartItemKey(item)}><button className="cart-product" onClick={() => openDrink(drink, '/cart', size.id)}><span className="product-thumb"><DrinkImage drink={drink} transitionName={drinkImageName(drink, size.id)} /></span><span><strong {...drinkTitleProps(drink, size.id)}>{drink.name}</strong><Meta drink={drink} sizeId={size.id} /><span className="product-price">{formatPrice(size.priceCents)}</span></span></button><div className="cart-item-bottom"><div className="cart-item-controls"><div className="quantity-control"><button aria-label={`Remove one ${drink.name}, ${size.label}`} onClick={() => changeQuantity(item, -1)}><Icon name="minus" size={18} /></button><span aria-label={`${item.quantity} drinks`}>{item.quantity}</span><button disabled={!state.availability[drink.id] || item.quantity >= 99} aria-label={`Add one ${drink.name}, ${size.label}`} onClick={() => changeQuantity(item, 1)}><Icon name="plus" size={18} /></button></div><button className="text-button cart-edit-button" aria-label={`Edit ${drink.name}, ${size.label}`} onClick={() => { cartEditFocus.current = cartItemKey(item); setCartEdit(item); }}>Edit</button></div><strong>{formatPrice(size.priceCents * item.quantity)}</strong></div>{!state.availability[drink.id] && <p className="cart-warning">No longer available. Remove this drink or choose another.</p>}</article>; })}
    {!!cartCount && <><div className="cart-total"><span>Demo total</span><strong>{formatPrice(total)}</strong></div><div className="order-boundary"><Icon name="check" size={22} /><div><h2>Demo cart only</h2><p>No payment or real order is placed.</p></div></div><Button secondary onClick={() => navigate('/menu')}>Add another drink</Button></>}
  </div>;

  return <div className="desktop-shell"><div className="device">
    <div className="device-buttons" aria-hidden="true"><i /><i /><i /><i /></div>
    <div className="device-screen">
    <div className="sim-status" aria-hidden="true"><span>9:41</span><div className="camera-island" /><span className="status-icons">
      <svg viewBox="0 0 18 14" width="18" height="14" fill="currentColor"><rect x="1" y="9" width="3" height="4" rx=".8" /><rect x="5.3" y="6.5" width="3" height="6.5" rx=".8" /><rect x="9.6" y="4" width="3" height="9" rx=".8" /><rect x="13.9" y="1.5" width="3" height="11.5" rx=".8" /></svg>
      <svg viewBox="0 0 18 14" width="18" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M2 4c4-3.3 10-3.3 14 0M4.5 7c2.6-2.1 6.4-2.1 9 0M7 10c1.2-.8 2.8-.8 4 0" /><circle cx="9" cy="12.5" r="1" fill="currentColor" stroke="none" /></svg>
      <svg viewBox="0 0 28 14" width="28" height="14"><rect x=".8" y="1" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" strokeOpacity=".4" strokeWidth="1.2" /><rect x="2.8" y="3" width="19" height="8" rx="1.8" fill="currentColor" /><path d="M26 5v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45" /></svg>
    </span></div>
    <div className="app-body" inert={panel !== null || cartEdit !== null || chatAddDrink !== null || feedbackOpen}>
      <header className={`app-header ${selected ? 'app-header-detail' : ''}`}>
        {!isMenu ? <button className="icon-button" onClick={goBack} aria-label="Go back"><Icon name="back" /></button> : <img className="brand-mark" src={assetUrl('/images/starbucks-logo.svg')} width="32" height="32" alt="Starbucks" />}
        {isMenu || isResults || isPreferences ? <h1 className="app-header-title">{title}</h1> : <span className="app-header-title">{title}</span>}<button className="icon-button about-button" aria-label="About this concept" onClick={() => setPanel('about')}><Icon name="info" size={22} /></button><button className="icon-button" aria-label="Demo settings" onClick={() => setPanel('settings')}><Icon name="settings" size={22} /></button>
      </header>
      {(isPreferences || isResults) && <div className="goal-banner"><span><Icon name={currentGoal?.icon ?? 'spark'} size={18} /><span className="goal-banner-label" style={{ viewTransitionName: `goal-${currentGoal?.id}` }}>{currentGoal?.title}</span></span><button aria-label="Change goal" onClick={() => moveGoal('/goal')}>Change <Icon name="chevron" size={16} /></button></div>}
      <main ref={main} id="app-content" className={`app-scroll${isChat ? ' drink-chat-scroll' : ''}`} tabIndex={-1}><div className="route-content" data-motion={direction} key={screen}>{isChat ? <Suspense fallback={<div className="content-pad"><p>Opening chat...</p></div>}><DrinkChat availability={state.availability} onView={drink => openDrink(drink, '/chat')} onAdd={(drink, trigger) => { chatAddFocus.current = trigger; setChatAddDrink(drink); }} onQuickChoices={() => navigate('/goal')} onBusyChange={setChatBusy} /></Suspense> : isMenu ? menu : isGoal ? goalScreen : screen === '/preferences' ? preferenceScreen : screen === '/results' ? resultScreen : selected ? details : screen === '/cart' ? cart : <div className="content-pad empty-state"><h1>Drink not found</h1><p>This recipe is not in the demo catalogue.</p><Button onClick={() => navigate('/menu')}>Return to menu</Button></div>}</div></main>
      {selected && <div className="detail-cta"><Button disabled={!state.availability[selected.id]} onClick={() => add(selected, selectedSize!.id)}>{state.availability[selected.id] ? `Add to order · ${formatPrice(selectedSize!.priceCents)}` : 'Currently unavailable'}</Button></div>}
      {isPreferences && <div className="finder-cta"><Button onClick={() => navigate('/results')}>Show my drink picks <Icon name="spark" size={18} /></Button></div>}
      <div className="pickup-strip"><button className="pickup-copy" onClick={() => setPanel('store')}><span>Pickup at</span><strong>Demo store <Icon name="down" size={18} /></strong></button><button className="cart-button" aria-label={`View order, ${cartCount} items`} onClick={() => navigate('/cart')}><Icon name="bag" size={26} />{cartCount > 0 && <span className="cart-count" key={cartCount}>{cartCount > 99 ? '99+' : cartCount}</span>}</button></div>
      <nav className="bottom-nav" aria-label="Main navigation"><button onClick={() => navigate('/home')} className={screen === '/home' ? 'nav-active' : ''} aria-current={screen === '/home' ? 'page' : undefined}><Icon name="home" /><span>Home</span></button><button disabled title="Payments are outside this student prototype"><Icon name="qr" /><span>Pay</span></button><button onClick={() => navigate('/menu')} className={screen !== '/home' ? 'nav-active' : ''} aria-current={screen !== '/home' ? 'page' : undefined}><Icon name="cup" /><span>Order</span></button><button disabled title="Merchandise is outside this student prototype"><Icon name="gift" /><span>Shop</span></button><button onClick={() => setPanel('store')}><Icon name="pin" /><span>Stores</span></button></nav>
      <div className="home-indicator" aria-hidden="true"><span /></div>
    </div>
    <div className="toast" role="status" aria-live="polite">{toast && !feedbackNotice && <span><Icon name="check" size={18} />{toast}</span>}</div>
    {feedbackNotice && <Suspense fallback={null}><FeedbackThanks onAddComment={addFeedbackComment} onDismiss={() => setFeedbackNotice(null)} paused={panel !== null || cartEdit !== null || chatAddDrink !== null || feedbackOpen} /></Suspense>}
    {cartEdit && editingDrink && <CartSizeEditor item={cartEdit} drink={editingDrink} cart={state.cart} available={state.availability[editingDrink.id] ?? false} onUpdate={updateCartSize} onClose={() => setCartEdit(null)} returnFocus={() => main.current?.querySelector<HTMLButtonElement>(`[data-cart-line="${cartEditFocus.current}"] .cart-edit-button`) ?? main.current} />}
    {chatAddDrink && <ChatSizePicker drink={chatAddDrink} cart={state.cart} available={state.availability[chatAddDrink.id] ?? false} onAdd={sizeId => add(chatAddDrink, sizeId, 'chat')} onClose={() => setChatAddDrink(null)} returnFocus={() => chatAddFocus.current?.isConnected ? chatAddFocus.current : main.current} />}
    {feedbackOpen && <Suspense fallback={<div className="toast" role="status">Opening feedback...</div>}><FeedbackSheet preview={feedbackPreview} commentVote={feedbackCommentVote} onVoteSaved={feedbackSaved} onClose={closeFeedback} returnFocus={() => feedbackFocus.current?.isConnected ? feedbackFocus.current : document.querySelector<HTMLButtonElement>('.about-button')} /></Suspense>}
    {panel && <Sheet title={panel === 'settings' ? 'Demo settings' : panel === 'store' ? 'Pickup store' : 'About this concept'} onClose={() => setPanel(null)}>
      {panel === 'about' && <>
        <div className="about-brand"><img src={assetUrl('/images/starbucks-logo.svg')} width="48" height="48" alt="" /><h3>Find my drink</h3></div>
        <p>Independent SC4025 student concept. Not the official Starbucks app.</p>
        <p>Prices, serving sizes and stock are simulated. Recipe data is from Starbucks Singapore; reference photos include other markets and label-only edits. Goal tags are our classifications.</p>
        <p>No accounts, payments or real orders. Choices and chat history are saved in this tab.</p>
        <p>Drink chat sends your messages and preferences to OpenAI. It can look up fictional demo orders when useful. Please do not share sensitive information.</p>
        <h3>Feedback and privacy</h3>
        <p>PostHog records visits, approximate country, feature use and optional feedback. No recordings or ordinary chat transcripts. Chats closed for misuse may save the last three user messages for review, with obvious contact details and keys redacted.</p>
        <label className="stock-row"><span>Usage analytics</span><input type="checkbox" checked={analyticsEnabled} disabled={feedbackPreview} onChange={event => analytics.setEnabled(event.target.checked)} /></label>
        <p className="helper-copy">Browser privacy settings are respected. Your feedback choice is remembered on this device.</p>
        <Button secondary onClick={openFeedback}>Give feedback</Button>
        <p className="about-credit">Starbucks owns its photos and logo. Manrope is an open-licensed substitute for the brand font.</p>
      </>}
      {panel === 'store' && <><div className="store-symbol"><Icon name="pin" size={32} /></div><h3>Demo store</h3><div className="store-info"><Icon name="clock" size={20} /><span>Simulated availability, not live stock.</span></div><p>No pickup or real order is placed.</p><Button onClick={() => { setPanel(null); navigate('/menu'); }}>View the menu</Button></>}
      {panel === 'settings' && <><p>Change simulated stock to test the finder.</p><h3 className="settings-subtitle">Available recipes</h3><div className="stock-controls">{drinks.map(drink => <label className="stock-row" key={drink.id}><span>{drink.name}</span><input type="checkbox" checked={state.availability[drink.id] ?? false} onChange={e => setState(s => ({ ...s, availability: { ...s.availability, [drink.id]: e.target.checked } }))} /></label>)}</div><p className="helper-copy">{storageAvailable ? 'Changes are saved in this tab.' : 'Browser storage is blocked. Refreshing resets the demo.'}</p><button className="button button-secondary reset-button" onClick={() => { setState(freshState()); setQuery(''); setCategory('all'); setPanel(null); navigate('/menu'); notify('Demo reset.'); }}><Icon name="reset" size={18} />Reset demo</button></>}
    </Sheet>}
  </div></div><p className="desktop-caption">SC4025 student concept</p></div>;
}
