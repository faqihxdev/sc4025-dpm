/*
 * Throwaway question: how should conversational drink discovery fit into the
 * existing /goal screen? Three layouts, selected by ?variant=conversation|prompt|guided.
 * Plan: keep Manrope and the existing green palette. Conversation pins a small
 * composer; prompt-first puts the request above editable preferences; guided
 * asks one question at a time. Each uses real catalogue photos and recipe facts.
 * Brief review: these differ in interaction and hierarchy, not decoration.
 * Replies are local examples, all state is in memory, and no cart writes occur.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Check, X } from 'lucide-react';
import { DrinkImage } from '../components/DrinkImage';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { defaultPreferences, drinks } from '../domain/catalogue';
import type { Drink, Preferences } from '../domain/model';
import { getRecommendations } from '../domain/recommendations';
import type { Recommendation } from '../domain/recommendations';
import './ChatPrototype.css';

type Variant = 'conversation' | 'prompt' | 'guided';
type Availability = Readonly<Record<string, boolean>>;
type FinderStatus = 'idle' | 'matches' | 'clarify';
const variants: { key: Variant; name: string; letter: string }[] = [
  { key: 'conversation', name: 'Conversation', letter: 'A' },
  { key: 'prompt', name: 'Prompt first', letter: 'B' },
  { key: 'guided', name: 'Guided choices', letter: 'C' },
];
const examples = ['Cold, not too sweet', 'Warm, with no coffee', 'Help me try something different'];
const refinements = ['No coffee', 'With oatmilk', 'Less sweet'];

function readVariant(): Variant {
  const key = new URLSearchParams(window.location.search).get('variant');
  return variants.find(variant => variant.key === key)?.key ?? 'conversation';
}

// Deliberately bounded examples. Unknown requests ask for clarification.
function interpret(text: string, current: Preferences): Preferences | null {
  const normalized = text.trim().toLowerCase().replace(/[,.!?]/g, '');
  const choices: Record<string, Partial<Preferences>> = {
    'cold not too sweet': { temperature: 'iced', sweetness: 'less', goal: null },
    'warm with no coffee': { temperature: 'hot', avoidCoffee: true, goal: 'comfort' },
    'no coffee': { avoidCoffee: true },
    'with oatmilk': { milk: 'oat' },
    'oatmilk': { milk: 'oat' },
    'less sweet': { sweetness: 'less' },
    'iced': { temperature: 'iced', goal: null },
    'cold': { temperature: 'iced', goal: null },
    'hot': { temperature: 'hot', goal: null },
    'warm': { temperature: 'hot', goal: null },
  };
  return choices[normalized] ? { ...current, ...choices[normalized] } : null;
}

function preferenceChips(preferences: Preferences): { label: string; reset: Partial<Preferences> }[] {
  const chips: { label: string; reset: Partial<Preferences> }[] = [];
  if (preferences.temperature) chips.push({ label: preferences.temperature === 'iced' ? 'Iced' : 'Hot', reset: { temperature: null, goal: null } });
  if (preferences.avoidCoffee) chips.push({ label: 'No coffee', reset: { avoidCoffee: false } });
  if (preferences.milk === 'oat') chips.push({ label: 'Oatmilk recipe', reset: { milk: null } });
  if (preferences.milk === 'none') chips.push({ label: 'No milk listed', reset: { milk: null } });
  if (preferences.sweetness === 'less') chips.push({ label: 'Lower published sugar', reset: { sweetness: 'any' } });
  return chips;
}

function useMockFinder(availability: Availability) {
  const [preferences, setPreferences] = useState<Preferences>({ ...defaultPreferences });
  const [status, setStatus] = useState<FinderStatus>('idle');
  const [request, setRequest] = useState('');
  const [clarification, setClarification] = useState('');
  const [revision, setRevision] = useState(0);
  const recommendations = useMemo(() => status === 'matches'
    ? getRecommendations(drinks, preferences, availability).slice(0, 2) : [], [availability, preferences, status]);
  const reply = status !== 'matches' ? clarification : !recommendations.length
    ? 'These choices leave no matching available recipe. Remove a choice below to broaden the search.'
    : preferences.sweetness === 'less'
      ? 'Here are some options, ordered by published sugar. Which one sounds good?'
      : 'These recipes fit the choices below. See what sounds good to you.';
  function submit(text: string) {
    if (!text.trim()) return;
    setRevision(current => current + 1);
    setRequest(text.trim());
    const next = interpret(text, preferences);
    if (next) {
      setPreferences(next);
      setStatus('matches');
    } else {
      setStatus('clarify');
      setClarification(text.trim().toLowerCase() === examples[2].toLowerCase()
        ? 'Let’s narrow it down. Would you like it hot or iced?'
        : 'That request is not included in this preview. Would you like to start with hot or iced?');
    }
  }
  function refine(update: Partial<Preferences>) {
    setRevision(current => current + 1);
    setPreferences(current => ({ ...current, ...('temperature' in update ? { goal: null } : {}), ...update }));
    setStatus('matches');
  }
  return { preferences, status, request, reply, recommendations, revision, submit, refine };
}

type Finder = ReturnType<typeof useMockFinder>;

function RequestChips({ choices, onChoose }: { choices: readonly string[]; onChoose: (text: string) => void }) {
  return <div className="chat-proto-chips">{choices.map(text => <button className="chat-proto-chip" key={text} onClick={() => onChoose(text)}>{text}</button>)}</div>;
}

function PreferenceSummary({ finder, editable = false }: { finder: Finder; editable?: boolean }) {
  const chips = preferenceChips(finder.preferences);
  if (!chips.length) return null;
  return <div className="chat-proto-summary" aria-label="Current choices">{chips.map(chip => editable
    ? <button key={chip.label} className="chat-proto-filter" onClick={() => finder.refine(chip.reset)} aria-label={`Remove ${chip.label}`}><span>{chip.label}</span><X size={14} strokeWidth={1.8} aria-hidden="true" /></button>
    : <span className="chat-proto-filter" key={chip.label}><Check size={14} strokeWidth={1.8} aria-hidden="true" />{chip.label}</span>)}</div>;
}

function DrinkPicks({ recommendations, preferences, onView }: { recommendations: Recommendation[]; preferences: Preferences; onView: (drink: Drink) => void }) {
  if (!recommendations.length) return <div className="chat-proto-empty"><p>No available recipe fits all these choices.</p><p>Try removing a preference to see more drinks.</p></div>;
  return <div className="chat-proto-picks" aria-label="Suggested drinks">{recommendations.map(({ drink }, index) => <article className="chat-proto-pick" key={drink.id}>
    <span className="chat-proto-photo"><DrinkImage drink={drink} priority={index === 0} /></span>
    <div className="chat-proto-pick-copy"><h3>{drink.name}</h3><p>{preferences.sweetness === 'less' && drink.sugarPer100ml !== null
      ? `${drink.sugarPer100ml} g sugar per 100 mL, default recipe.` : drink.ingredientNotes}</p>
      <button onClick={() => onView(drink)}>View drink<Icon name="chevron" size={16} /></button>
    </div>
  </article>)}</div>;
}

function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  return <form className="chat-proto-composer" onSubmit={event => { event.preventDefault(); if (text.trim()) { onSend(text); setText(''); } }}>
    <label htmlFor="chat-proto-message">Tell us what you’re looking for</label>
    <div className="chat-proto-composer-field"><input id="chat-proto-message" value={text} onChange={event => setText(event.target.value)} placeholder="e.g. Cold, not too sweet" autoComplete="off" maxLength={180} /><button type="submit" disabled={!text.trim()} aria-label="Send request"><ArrowUp size={20} strokeWidth={1.8} aria-hidden="true" /></button></div>
  </form>;
}

export function ConversationVariant({ availability, onView }: { availability: Availability; onView: (drink: Drink) => void }) {
  const finder = useMockFinder(availability);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (finder.status !== 'idle') scroll.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [finder.revision]);
  return <div className="chat-proto-conversation">
    <div className="chat-proto-flow" ref={scroll}>
      {finder.status === 'idle' ? <div className="chat-proto-opening"><span className="chat-proto-cup"><Icon name="steam" size={28} /></span><h2>What sounds good today?</h2><p>A few words can help you find a drink.<br />Start with one of these.</p><RequestChips choices={examples} onChoose={finder.submit} /></div>
        : <div className="chat-proto-dialogue"><p className="chat-proto-user-message">{finder.request}</p><div className="chat-proto-response" aria-live="polite"><span className="chat-proto-avatar"><Icon name="steam" size={19} /></span><p>{finder.reply}</p></div>
          {finder.status === 'matches' && <><PreferenceSummary finder={finder} editable /><DrinkPicks recommendations={finder.recommendations} preferences={finder.preferences} onView={onView} /><p className="chat-proto-refine-label">Make it more you</p></>}
          <RequestChips choices={finder.status === 'clarify' ? ['Iced', 'Hot'] : refinements} onChoose={finder.submit} />
        </div>}
    </div><Composer onSend={finder.submit} />
  </div>;
}

export function PromptVariant({ availability, onView }: { availability: Availability; onView: (drink: Drink) => void }) {
  const finder = useMockFinder(availability);
  const [text, setText] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const response = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (finder.status !== 'idle' && response.current) scroll.current?.scrollTo({ top: response.current.offsetTop - 20, behavior: 'instant' });
  }, [finder.revision]);
  return <div className="chat-proto-flow chat-proto-prompt" ref={scroll}>
    <h2>Your drink, in your words</h2><p className="chat-proto-intro">Tell us what you feel like. You can adjust the choices before you pick.</p>
    <form onSubmit={event => { event.preventDefault(); finder.submit(text); }}><label htmlFor="chat-proto-intent">What are you looking for?</label><textarea id="chat-proto-intent" value={text} onChange={event => setText(event.target.value)} placeholder="Cold, not too sweet" rows={3} maxLength={180} />
      <button className="chat-proto-primary" type="submit" disabled={!text.trim()}>Find my drink<ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" /></button></form>
    {finder.status === 'idle' ? <div className="chat-proto-prompt-examples"><p>Try a request</p><RequestChips choices={examples} onChoose={value => { setText(value); finder.submit(value); }} /></div>
      : <div ref={response}>{finder.status === 'clarify' ? <div className="chat-proto-clarify" aria-live="polite"><p>{finder.reply}</p><RequestChips choices={['Iced', 'Hot']} onChoose={finder.submit} /></div>
        : <section className="chat-proto-interpreted" aria-live="polite"><h3>Here’s what we’ll look for</h3><PreferenceSummary finder={finder} editable /><RequestChips choices={refinements} onChoose={finder.submit} /><h3 className="chat-proto-pick-heading">Drinks to consider</h3><DrinkPicks recommendations={finder.recommendations} preferences={finder.preferences} onView={onView} /></section>}</div>}
  </div>;
}

export function GuidedVariant({ availability, onView }: { availability: Availability; onView: (drink: Drink) => void }) {
  const finder = useMockFinder(availability);
  const [step, setStep] = useState(0);
  const questions = [
    { title: 'Hot or iced?', copy: 'Let’s start with how you want to sip it.', choices: [{ text: 'Iced', icon: 'sun' as const, update: { temperature: 'iced' as const } }, { text: 'Hot', icon: 'steam' as const, update: { temperature: 'hot' as const } }] },
    { title: 'Would you like coffee?', copy: 'We’ll use the ingredients in each recipe.', choices: [{ text: 'Coffee is fine', icon: 'coffee' as const, update: { avoidCoffee: false } }, { text: 'No coffee', icon: 'leaf' as const, update: { avoidCoffee: true } }] },
    { title: 'Any sweetness preference?', copy: 'Published sugar helps us order the choices.', choices: [{ text: 'Less sweet', icon: 'sweetness' as const, update: { sweetness: 'less' as const } }, { text: 'No preference', icon: 'cup' as const, update: { sweetness: 'any' as const } }] },
  ];
  const question = questions[Math.min(step, questions.length - 1)];
  return <div className="chat-proto-flow chat-proto-guided">
    <div className="chat-proto-guided-progress"><span>{step < 3 ? `Question ${step + 1} of 3` : 'Your choices'}</span><span className="chat-proto-dots" aria-hidden="true">{questions.map((_, index) => <i className={index <= step ? 'is-filled' : ''} key={index} />)}</span></div>
    <PreferenceSummary finder={finder} />
    {step < 3 ? <section className="chat-proto-question" key={step}><h2>{question.title}</h2><p>{question.copy}</p><div className="chat-proto-choices">{question.choices.map(choice => <button key={choice.text} onClick={() => { finder.refine(choice.update); setStep(current => current + 1); }}><Icon name={choice.icon} size={25} /><span>{choice.text}</span><Icon name="chevron" size={18} /></button>)}</div>
      {step > 0 && <button className="chat-proto-text-button" onClick={() => setStep(current => current - 1)}><ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />Previous question</button>}</section>
      : <section className="chat-proto-guided-results" aria-live="polite"><h2>{finder.recommendations.length ? 'Drinks to consider' : 'Let’s adjust your choices'}</h2><p>Based on the recipes and your choices.</p><DrinkPicks recommendations={finder.recommendations} preferences={finder.preferences} onView={onView} /><p className="chat-proto-refine-label">Want to narrow it further?</p><RequestChips choices={refinements} onChoose={finder.submit} /><button className="chat-proto-text-button" onClick={() => setStep(0)}><Icon name="reset" size={16} />Change my choices</button></section>}
  </div>;
}

export default function ChatPrototype({ availability, onExit }: { availability: Availability; onExit: () => void }) {
  const [variant, setVariant] = useState<Variant>(readVariant);
  const [selected, setSelected] = useState<Drink | null>(null);
  const current = variants.find(item => item.key === variant)!;
  function cycle(direction: number) {
    const index = variants.findIndex(item => item.key === variant);
    const next = variants[(index + direction + variants.length) % variants.length].key;
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next);
    window.history.replaceState(null, '', url);
    setSelected(null);
    setVariant(next);
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (selected || event.altKey || event.ctrlKey || event.metaKey || (target instanceof HTMLElement && (target.closest('input, textarea, [contenteditable]')))) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [variant, selected]);
  return <section className="chat-prototype" data-chat-variant={variant} aria-label={`${current.name} layout preview`}>
    <div className="chat-proto-preview"><span>Layout preview · Simulated replies</span><button onClick={onExit}>Quick choices<Icon name="chevron" size={15} /></button></div>
    <div className="chat-proto-variant" key={variant}>
      {variant === 'conversation' ? <ConversationVariant availability={availability} onView={setSelected} /> : variant === 'prompt' ? <PromptVariant availability={availability} onView={setSelected} /> : <GuidedVariant availability={availability} onView={setSelected} />}
    </div>
    {import.meta.env.DEV && <nav className="chat-proto-switcher" aria-label="Switch prototype layout"><button aria-label="Previous layout" onClick={() => cycle(-1)}><ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" /></button><span aria-live="polite">{current.letter}<span>{current.name}</span></span><button aria-label="Next layout" onClick={() => cycle(1)}><ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" /></button></nav>}
    {selected && <Sheet title="A closer look" onClose={() => setSelected(null)}><div className="chat-proto-detail"><span className="chat-proto-detail-photo"><DrinkImage drink={selected} large priority /></span><h3>{selected.name}</h3><p>{selected.description}</p><p>{selected.ingredientNotes}</p><p className="chat-proto-detail-note">Recipe details from the demo catalogue.</p><button className="chat-proto-primary" onClick={() => setSelected(null)}>Back to my choices</button></div></Sheet>}
  </section>;
}
