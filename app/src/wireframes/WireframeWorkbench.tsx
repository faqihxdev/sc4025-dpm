import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { SizeChoices } from '../components/SizeChoices';
import { defaultPreferences, drinks } from '../domain/catalogue';
import { addCartItem, changeCartQuantity, editCartItemSize, getCartTotal, getDrinkSize } from '../domain/drink-sizes';
import { isPreferenceOptionPossible, normalizeFinderPreferences } from '../domain/preference-options';
import { getRecommendations } from '../domain/recommendations';
import { formatPrice } from '../domain/model';
import type { CartItem, Drink, DrinkSizeId, Goal, Preferences } from '../domain/model';
import { flowEdges, flowNodes, readDesignLocation, screenHref, screens } from './flow';
import type { ScreenId } from './flow';
import './wireframes.css';

const sampleDrink = drinks.find(drink => drink.id === 'iced-latte')!;
const chatDrinks = ['iced-latte', 'iced-americano'].map(id => drinks.find(drink => drink.id === id)!);
const availability = Object.fromEntries(drinks.map(drink => [drink.id, true]));
const goals: { id: Goal; label: string; copy: string }[] = [
  { id: 'refreshing', label: 'Something refreshing', copy: 'Cool and bright.' },
  { id: 'coffee', label: 'A coffee boost', copy: 'Espresso and coffee favourites.' },
  { id: 'comfort', label: 'Warm and comforting', copy: 'Hot chocolate, tea and cosy sips.' },
];
const exampleCart = (): CartItem[] => [{ drinkId: sampleDrink.id, sizeId: 'tall', quantity: 1 }];
const needsCart = (id: ScreenId) => ['added', 'cart', 'cart-size'].includes(id);
const screenGroups = ['Discover', 'Choose and add', 'Recovery'] as const;

function Cup({ large = false }: { large?: boolean }) {
  return <span className={`wf-placeholder${large ? ' wf-placeholder-large' : ''}`} aria-label="Drink image placeholder" role="img"><Icon name="cup" size={large ? 84 : 32} /></span>;
}
function Pin({ number, visible }: { number: number; visible: boolean }) {
  return visible ? <span className="wf-pin" aria-hidden="true">{number}</span> : null;
}
function Action({ children, onClick, secondary = false, disabled = false }: { children: ReactNode; onClick: () => void; secondary?: boolean; disabled?: boolean }) {
  return <button className={`wf-action${secondary ? ' wf-action-secondary' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function FlowDiagram() {
  return <section className="wf-flow" aria-labelledby="flow-title">
    <div className="wf-section-heading"><div><h2 id="flow-title">From discovery to order review</h2><p>Select a screen to open its wireframe. Arrows name the customer's action.</p></div><span className="wf-legend"><i /> Screen <i className="wf-legend-state" /> State</span></div>
    <div className="wf-diagram-scroll" tabIndex={0} role="region" aria-label="User flow diagram. Scroll horizontally on small screens.">
      <svg viewBox="0 0 1160 778" className="wf-diagram" aria-labelledby="diagram-title diagram-description">
        <title id="diagram-title">Find My Drink user flow</title><desc id="diagram-description">Guided discovery and chat both lead to adding a drink. Opening the bag is a separate action. Each screen is a link to its wireframe.</desc>
        <defs><marker id="wf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke="context-stroke" strokeWidth="1.5" /></marker></defs>
        {flowEdges.map(edge => <g key={`${edge.from}-${edge.to}`} className={'secondary' in edge && edge.secondary ? 'wf-edge wf-edge-secondary' : 'wf-edge'}><path d={edge.path} markerEnd="url(#wf-arrow)" /><text x={edge.x} y={edge.y} textAnchor="middle">{edge.label}</text></g>)}
        <text className="wf-lane-label" x="180" y="266" textAnchor="middle">Guided discovery</text>
        <text className="wf-lane-label" x="980" y="266" textAnchor="middle">Conversation</text>
        {flowNodes.map(node => <a key={node.screen} href={screenHref(node.screen)} aria-label={`Open ${screens.find(screen => screen.id === node.screen)!.title} wireframe`} className={`wf-node${node.state ? ' wf-node-state' : ''}`}><g transform={`translate(${node.x} ${node.y})`}><rect width="240" height="64" rx={node.state ? 32 : 8} /><text x="120" y="26" textAnchor="middle" className="wf-node-title">{node.title}</text><text x="120" y="47" textAnchor="middle" className="wf-node-subtitle">{node.subtitle}</text></g></a>)}
      </svg>
    </div>
    <div className="wf-recovery"><h3>Recovery and editing</h3><div>{([
      ['no-match', 'No match', 'Edit preferences or browse'], ['chat-error', 'Chat error', 'Retry the request'],
      ['unavailable', 'Unavailable drink', 'Choose another drink'], ['cart-size', 'Change size', 'Edit the existing cart line'],
    ] as const).map(([id, label, action]) => <a key={id} href={screenHref(id)}><strong>{label}</strong><span>{action}<Icon name="chevron" size={16} /></span></a>)}</div></div>
  </section>;
}

function WireframePhone({ screen, go, annotations }: { screen: ScreenId; go: (id: ScreenId) => void; annotations: boolean }) {
  const [preferences, setPreferences] = useState<Preferences>(() => normalizeFinderPreferences({ ...defaultPreferences, goal: 'coffee' }));
  const [drink, setDrink] = useState(sampleDrink);
  const [size, setSize] = useState<DrinkSizeId>('tall');
  const [cart, setCart] = useState<CartItem[]>(() => needsCart(screen) ? exampleCart() : []);
  const [editingLine, setEditingLine] = useState<CartItem | null>(null);
  const [origin, setOrigin] = useState<ScreenId>(['chat-size', 'added'].includes(screen) ? 'chat' : 'picks');
  const [chatPrompt, setChatPrompt] = useState(screen === 'chat' ? '' : 'Something cold and coffee-forward');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const addTrigger = useRef<HTMLButtonElement | null>(null);
  const drawer = screen === 'chat-size' || screen === 'cart-size';
  useEffect(() => { body.current?.scrollTo(0, 0); }, [screen]);
  useEffect(() => {
    // Each outline/deep-link scene stays reviewable without persisted user data.
    if (needsCart(screen)) setCart(previous => previous.length ? previous : exampleCart());
  }, [screen]);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const chosenSize = getDrinkSize(drink, size);
  const currentGoal = goals.find(goal => goal.id === preferences.goal)!;
  const results = getRecommendations(drinks, preferences, availability);
  const update = (patch: Partial<Preferences>) => setPreferences(previous => normalizeFinderPreferences({ ...previous, ...patch }));
  const openDrink = (item: Drink, from: ScreenId) => { setDrink(item); setSize('tall'); setOrigin(from); go('details'); };
  const add = () => { setCart(previous => addCartItem(previous, drink, size)); go('added'); };
  const ask = (text: string) => { if (!text.trim()) return; setChatPrompt(text.trim()); setDraft(''); go('chat'); };
  const pin = (number: number) => <Pin number={number} visible={annotations} />;
  const group = (label: string, value: string, options: { label: string; value: string; patch: Partial<Preferences> }[]) => <fieldset className="wf-preference"><legend>{label}</legend><div className="wf-choices">{options.map(option => <button key={option.value} aria-pressed={value === option.value} disabled={!isPreferenceOptionPossible(drinks, preferences, availability, option.patch)} onClick={() => update(option.patch)}>{option.label}{value === option.value && <Icon name="check" size={14} />}</button>)}</div></fieldset>;
  const product = (item: Drink, from: ScreenId = 'menu') => <button className="wf-product" key={item.id} onClick={() => openDrink(item, from)}><Cup /><span><strong>{item.name}</strong><small>{item.temperature === 'hot' ? 'Hot' : 'Iced'}</small><b>{formatPrice(item.priceCents)}</b></span><Icon name="chevron" size={18} /></button>;
  const chatContent = <div className={`wf-chat${chatPrompt ? '' : ' wf-chat-empty'}`}>
    {!chatPrompt ? <div className="wf-chat-welcome"><Icon name="steam" size={30} /><h3>What would you like today?</h3><p>Tell me what you feel like, or start here.</p>{['Something like my usual', 'Try something different', 'Help me choose'].map(text => <button className="wf-quick" key={text} onClick={() => ask(text)}>{text}</button>)}{pin(1)}</div> : <><p className="wf-message-user">{chatPrompt}</p><p className="wf-message-reply">Try these coffee picks. A <strong>latte is creamier</strong>; an Americano keeps it simple.</p><div className="wf-chat-cards">{chatDrinks.map(item => <article className="wf-chat-card" key={item.id}><button className="wf-card-open" onClick={() => openDrink(item, 'chat')} aria-label={`View ${item.name}`}><Cup /><span className="wf-card-price">{formatPrice(item.priceCents)}</span><strong>{item.name}</strong><span className="wf-card-arrow" aria-hidden="true">↗</span></button><Action onClick={() => { addTrigger.current = document.activeElement as HTMLButtonElement; setDrink(item); setSize('tall'); setOrigin('chat'); go('chat-size'); }}>Add to order</Action></article>)}</div>{pin(2)}<div className="wf-quick-list">{['Less sweet', 'Show me something else'].map(text => <button className="wf-quick" key={text} onClick={() => ask(text)}>{text}</button>)}</div></>}
  </div>;
  const cartContent = <div className="wf-content"><h3>Your drink order.</h3><p>Review your drinks and quantities.</p>{cart.map(item => {
    const recipe = drinks.find(candidate => candidate.id === item.drinkId)!;
    const itemSize = getDrinkSize(recipe, item.sizeId);
    return <article className="wf-cart-item" key={`${item.drinkId}-${item.sizeId}`}><div>{product(recipe, 'cart')}<p>{itemSize.label} · {itemSize.ounces} oz · {formatPrice(itemSize.priceCents)}</p></div><div className="wf-cart-controls"><button aria-label="Decrease quantity" onClick={() => setCart(previous => changeCartQuantity(previous, item, -1))}><Icon name="minus" size={16} /></button><span aria-label="Quantity">{item.quantity}</span><button aria-label="Increase quantity" onClick={() => setCart(previous => changeCartQuantity(previous, item, 1))}><Icon name="plus" size={16} /></button><button className="wf-link" onClick={() => { addTrigger.current = document.activeElement as HTMLButtonElement; setEditingLine(item); setDrink(recipe); setSize(item.sizeId); go('cart-size'); }}>Edit</button></div></article>;
  })}{!cart.length && <p>Your order is empty.</p>}<div className="wf-total"><span>Total</span><strong>{formatPrice(getCartTotal(cart, drinks))}</strong>{pin(1)}</div><p className="wf-boundary">Demo cart only. No payment or real order.</p>{pin(2)}<Action secondary onClick={() => go('menu')}>Add another drink</Action></div>;
  const detailContent = <><Cup large /><div className="wf-content"><h3>{drink.name}</h3><p>{drink.description}</p><div className="wf-price">{formatPrice(chosenSize.priceCents)}{pin(1)}</div><SizeChoices drink={drink} value={size} onChange={setSize} /><dl className="wf-recipe"><div><dt>Temperature</dt><dd>{drink.temperature === 'hot' ? 'Hot' : 'Iced'}</dd></div>{drink.milk !== 'none' && <div><dt>Milk recipe</dt><dd>{drink.milk === 'oat' ? 'Oatmilk' : 'Dairy milk'}</dd></div>}</dl><details><summary>Ingredients and recipe information</summary><p>{drink.ingredientNotes}</p></details>{screen === 'unavailable' && <p className="wf-error" role="status">This drink is unavailable. Return to the menu or your picks.</p>}</div></>;
  const base = screen === 'chat-size' || screen === 'chat-error' || (screen === 'added' && origin === 'chat') ? 'chat' : screen === 'cart-size' ? 'cart' : screen === 'added' || screen === 'unavailable' ? 'details' : screen;
  const title = base === 'menu' ? 'Order' : base === 'goal' ? 'Find my drink' : base === 'preferences' ? 'Preferences' : base === 'picks' || base === 'no-match' ? 'Your drink picks' : base === 'chat' ? 'Help me choose' : base === 'cart' ? 'Your order' : 'Drink details';
  const back = base === 'goal' || base === 'cart' ? 'menu' : base === 'preferences' || base === 'chat' ? 'goal' : base === 'picks' || base === 'no-match' ? 'preferences' : origin;
  return <div className="wf-phone" aria-label={`${screens.find(item => item.id === screen)!.title} interactive wireframe`}>
    <div className="wf-phone-surface" inert={drawer}>
      <div className="wf-status" aria-hidden="true"><span>9:41</span><span>● ● ▰</span></div>
      <header className="wf-app-header">{base !== 'menu' && <button aria-label="Back" onClick={() => go(back as ScreenId)}><Icon name="back" size={21} /></button>}<strong>{title}</strong>{base === 'chat' && <button aria-label="Reset example chat" onClick={() => { setChatPrompt(''); go('chat'); }}><Icon name="reset" size={19} /></button>}</header>
      {(base === 'preferences' || base === 'picks' || base === 'no-match') && <div className="wf-goal-banner"><Icon name={preferences.goal === 'coffee' ? 'steam' : preferences.goal === 'comfort' ? 'cup' : 'sun'} size={18} /><span>{currentGoal.label}</span><button onClick={() => go('goal')}>Change</button>{base === 'preferences' && pin(1)}</div>}
      {base === 'chat' && <button className="wf-chat-back wf-link" onClick={() => go('goal')}>Quick choices <Icon name="chevron" size={15} /></button>}
      <div className="wf-phone-content" ref={body}>
        {base === 'menu' && <div className="wf-content"><section className="wf-banner"><Cup /><div><h3>Find My Drink</h3><p>We'll help you find your perfect drink</p><Action onClick={() => go('goal')}>Try it now</Action></div>{pin(1)}</section><label className="wf-search"><Icon name="search" size={18} /><input type="search" aria-label="Search drinks" placeholder="Search drinks" value={query} onChange={event => setQuery(event.target.value)} /></label><h3 className="wf-menu-heading">All drinks {pin(2)}</h3>{drinks.filter(item => item.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5).map(item => product(item))}</div>}
        {base === 'goal' && <div className="wf-content"><h3>What sounds good?</h3>{pin(1)}<div className="wf-goals">{goals.map(goal => <button key={goal.id} onClick={() => { update({ ...defaultPreferences, goal: goal.id }); go('preferences'); }}><Cup /><span><strong>{goal.label}</strong><small>{goal.copy}</small></span><Icon name="chevron" size={16} /></button>)}<button onClick={() => go('chat')}><Cup /><span><strong>Help me choose</strong><small>Chat your way to a new favourite.</small></span><Icon name="chevron" size={16} /></button></div>{pin(2)}<button className="wf-link wf-browse" onClick={() => go('menu')}>Browse the menu instead</button></div>}
        {base === 'preferences' && <div className="wf-content">{pin(2)}{preferences.goal === 'coffee' ? group('Hot or iced?', preferences.temperature || 'any', [{ label: 'Either', value: 'any', patch: { temperature: null } }, { label: 'Iced', value: 'iced', patch: { temperature: 'iced' } }, { label: 'Hot', value: 'hot', patch: { temperature: 'hot' } }]) : group('Coffee ingredients', preferences.avoidCoffee ? 'none' : 'any', [{ label: 'No preference', value: 'any', patch: { avoidCoffee: false } }, { label: 'No coffee', value: 'none', patch: { avoidCoffee: true } }])}{group('Sweetness', preferences.sweetness, [{ label: 'No preference', value: 'any', patch: { sweetness: 'any' } }, { label: 'Less sweet', value: 'less', patch: { sweetness: 'less' } }, { label: 'Sweeter', value: 'more', patch: { sweetness: 'more' } }])}{group('Milk in the recipe', preferences.milk || 'any', [{ label: 'No preference', value: 'any', patch: { milk: null } }, { label: 'Dairy milk', value: 'dairy', patch: { milk: 'dairy' } }, { label: 'Oatmilk', value: 'oat', patch: { milk: 'oat' } }, { label: 'No milk listed', value: 'none', patch: { milk: 'none' } }])}<button className="wf-link wf-browse" onClick={() => update({ ...defaultPreferences, goal: preferences.goal })}>Clear optional preferences</button></div>}
        {base === 'picks' && <div className="wf-content wf-picks">{pin(1)}{results.map(({ drink: item }) => <article key={item.id}><div className="wf-pick-heading"><Cup /><h3>{item.name}</h3></div><p>{item.description}</p><div><strong>{formatPrice(item.priceCents)}</strong><Action secondary onClick={() => openDrink(item, 'picks')}>See drink</Action></div></article>)}{pin(2)}<button className="wf-link wf-browse" onClick={() => go('preferences')}>Edit my preferences</button></div>}
        {base === 'no-match' && <div className="wf-empty"><Icon name="search" size={40} /><h3>No drink fits just yet.</h3><p>Your choices are saved.</p>{pin(1)}<Action onClick={() => go('preferences')}>Edit my preferences</Action><Action secondary onClick={() => go('menu')}>Browse the menu</Action>{pin(2)}</div>}
        {base === 'chat' && chatContent}
        {base === 'details' && detailContent}
        {base === 'cart' && cartContent}
      </div>
      {screen === 'added' && <div className="wf-confirmation" role="status"><Icon name="check" size={17} /><span>{drink.name} added to your order.</span>{pin(1)}</div>}
      {base === 'preferences' && <footer className="wf-primary-footer"><Action onClick={() => go('picks')}>Show my drink picks</Action>{pin(3)}</footer>}
      {base === 'details' && <footer className="wf-primary-footer"><Action disabled={screen === 'unavailable'} onClick={add}>Add to order · {formatPrice(chosenSize.priceCents)}</Action>{pin(2)}</footer>}
      {base === 'chat' && <div className="wf-composer-area">{screen === 'chat-error' && <div className="wf-error" role="alert"><span>Couldn't get a reply. Try again.</span><button className="wf-link" onClick={() => ask(chatPrompt)}>Retry</button>{pin(1)}</div>}<form className="wf-composer" onSubmit={event => { event.preventDefault(); ask(draft); }}><input aria-label="Describe your drink" placeholder="Describe your drink..." value={draft} onChange={event => setDraft(event.target.value)} /><button aria-label="Send message" disabled={!draft.trim()} type="submit">↑</button></form>{screen === 'chat' && pin(3)}</div>}
      <footer className="wf-pickup"><span>Pickup at<br /><strong>Demo store</strong></span><button aria-label={`View order, ${count} items`} onClick={() => go('cart')}><Icon name="bag" size={23} /><span>{count}</span></button>{screen === 'added' && pin(2)}</footer>
    </div>
    {drawer && <Sheet key={screen} title={screen === 'cart-size' ? 'Edit size' : 'Choose a size'} onClose={() => { setEditingLine(null); go(screen === 'cart-size' ? 'cart' : 'chat'); }} returnFocus={() => addTrigger.current} footer={() => <Action onClick={() => {
      if (screen === 'cart-size') { const line = editingLine ?? cart.find(item => item.drinkId === drink.id); if (line) setCart(previous => editCartItemSize(previous, line, drink, size).cart); setEditingLine(null); go('cart'); }
      else add();
    }}>{screen === 'cart-size' ? 'Save changes' : 'Add to order'} · {formatPrice(chosenSize.priceCents)}</Action>}><div className="wf-drawer-product"><Cup /><strong>{drink.name}</strong>{pin(1)}</div><SizeChoices drink={drink} value={size} onChange={setSize} /><div className="wf-drawer-total"><span>Price</span><strong>{formatPrice(chosenSize.priceCents)}</strong>{pin(2)}</div></Sheet>}
  </div>;
}

export default function WireframeWorkbench() {
  const [location, setLocation] = useState(readDesignLocation);
  const [annotations, setAnnotations] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Find My Drink | Flows and wireframes';
    document.documentElement.classList.add('wf-document');
    const update = () => setLocation(readDesignLocation());
    window.addEventListener('hashchange', update);
    update();
    return () => { document.title = previousTitle; document.documentElement.classList.remove('wf-document'); window.removeEventListener('hashchange', update); };
  }, []);
  const selected = screens.find(screen => screen.id === location.screen)!;
  const go = (id: ScreenId) => { window.location.hash = screenHref(id); };
  return <div className="wf-workbench">
    <a className="wf-skip" href="#wf-main" onClick={event => { event.preventDefault(); document.getElementById('wf-main')?.focus(); }}>Skip to design content</a>
    <header className="wf-workbench-header"><div className="wf-brand"><span aria-hidden="true"><Icon name="cup" size={25} /></span><div><h1>Find My Drink</h1><p>Flows and wireframes</p></div></div><a href="#/menu">Open prototype <Icon name="chevron" size={17} /></a></header>
    <div className="wf-toolbar"><nav aria-label="Design views"><a href="#/wireframes" aria-current={location.view === 'flow' ? 'page' : undefined}>User flow</a><a href={screenHref(location.screen)} aria-current={location.view === 'screens' ? 'page' : undefined}>Wireframes</a></nav><div className="wf-tools">{location.view === 'screens' && <><label><input type="checkbox" checked={annotations} onChange={event => setAnnotations(event.target.checked)} />Annotations</label><button onClick={() => setRevision(previous => previous + 1)}>Reset example</button></>}<button onClick={() => window.print()}>Print / save PDF</button></div></div>
    <main id="wf-main" tabIndex={-1}>
      {location.view === 'flow' ? <FlowDiagram /> : <div className={`wf-screen-layout${annotations ? '' : ' wf-without-notes'}`}>
        <nav className="wf-screen-nav" aria-label="Wireframe screens">{screenGroups.map(group => <div key={group}><h2>{group}</h2>{screens.filter(screen => screen.group === group).map(screen => <a key={screen.id} href={screenHref(screen.id)} aria-current={selected.id === screen.id ? 'page' : undefined}>{screen.title}</a>)}</div>)}</nav>
        <label className="wf-screen-select">Screen<select value={selected.id} onChange={event => go(event.target.value as ScreenId)}>{screenGroups.map(group => <optgroup key={group} label={group}>{screens.filter(screen => screen.group === group).map(screen => <option key={screen.id} value={screen.id}>{screen.title}</option>)}</optgroup>)}</select></label>
        <section className="wf-preview" aria-labelledby="wireframe-title"><div className="wf-preview-heading"><h2 id="wireframe-title">{selected.title}</h2><p>Interactive wireframe</p></div><WireframePhone key={revision} screen={selected.id} go={go} annotations={annotations} /></section>
        {annotations && <aside className="wf-annotations" aria-label="Design annotations"><h2>Design decisions</h2><ol>{selected.notes.map((note, index) => <li key={note}><span>{index + 1}</span><p>{note}</p></li>)}</ol></aside>}
      </div>}
    </main>
    <footer className="wf-workbench-footer">Sample data. Wireframe interactions stay in memory and do not call AI, send analytics or change the prototype's saved order.</footer>
  </div>;
}
