/* Design plan: retain Manrope and the existing green #00754a, house #1e3932,
 * mint #d4e9e2, line #dce1de and white palette. Two image-first cards use the
 * photo and name as one view target, with a small bottom-left image price,
 * a quiet corner arrow and a compact
 * Add to order button below. The two actions are sibling controls, not nested.
 * Loading uses a single compact line, without invented progress or tool claims.
 * Motion follows the conversation: a tapped reply becomes its sent bubble,
 * and only the incoming turn reveals. Keep the green/mint palette and Manrope;
 * do not move the phone shell or pull readers away from earlier messages.
 * Brief review: keep app framing and the composer; quick add stays in the chat.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { flushSync } from 'react-dom';
import { ArrowUp, ArrowUpRight } from 'lucide-react';
import { DrinkImage } from '../components/DrinkImage';
import { Icon } from '../components/Icon';
import { drinks } from '../domain/catalogue';
import { formatPrice } from '../domain/model';
import type { Drink } from '../domain/model';
import { isEligible } from '../domain/recommendations';
import { CHAT_MESSAGE_LIMIT, CHAT_TURN_LIMIT } from './contracts';
import type { ChatRequest } from './contracts';
import { boundChatMessages, clearChatSession, parseChatResponse, readChatSession, saveChatSession } from './chat-session';
import type { ChatSession, StoredChatMessage } from './chat-session';
import { parseChatReply } from './chat-format';
import './DrinkChat.css';
import { analytics } from '../analytics/client';

const openingPrompts = ['Something like my usual', 'Try something different', 'Help me choose'];
const pendingPhrases = ['Thinking it over', 'Putting a reply together', 'Just a moment'];
const CONVERSATION_KEY = 'sc4025-chat-review-conversation:v1';
function reviewConversationId(fresh = false): string {
  try {
    const previous = !fresh && sessionStorage.getItem(CONVERSATION_KEY);
    if (previous && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(previous)) return previous;
    const id = crypto.randomUUID();
    sessionStorage.setItem(CONVERSATION_KEY, id);
    return id;
  } catch {
    // Telemetry must never prevent the chat from opening.
    try { return crypto.randomUUID(); } catch { return ''; }
  }
}

function ChatPendingReply() {
  const [phrase, setPhrase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => setPhrase(previous => (previous + 1) % pendingPhrases.length), 3_200);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  return <div className="drink-chat-loading" role="status">
    <span className="drink-chat-sr-only">Preparing a reply</span>
    <span className="drink-chat-loading-dots" aria-hidden="true"><span /><span /><span /></span>
    <span className="drink-chat-loading-phrase" key={reducedMotion ? 'still' : phrase} aria-hidden="true">{pendingPhrases[reducedMotion ? 0 : phrase]}</span>
  </div>;
}

function revealChoice(event: FocusEvent<HTMLDivElement>) {
  if (!(event.target instanceof HTMLElement) || event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
  event.target.closest<HTMLElement>('.drink-chat-pick')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
}

export default function DrinkChat({ availability, onView, onAdd, onQuickChoices, onBusyChange }: {
  availability: Readonly<Record<string, boolean>>;
  onView: (drink: Drink) => void;
  onAdd: (drink: Drink, trigger: HTMLButtonElement) => void;
  onQuickChoices: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [session, setSession] = useState<ChatSession>(readChatSession);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => !session.endedReason && session.messages.at(-1)?.role === 'user' ? 'Your last request did not finish. Try again.' : '');
  const [retryUntil, setRetryUntil] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const [freshMessage, setFreshMessage] = useState<StoredChatMessage | null>(null);
  const [movingMessage, setMovingMessage] = useState<StoredChatMessage | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const latestTurn = useRef<HTMLLIElement>(null);
  const latestReply = useRef<HTMLLIElement>(null);
  const mounted = useRef(false);
  const previousLast = useRef<StoredChatMessage | undefined>(undefined);
  const followLatest = useRef(true);
  const sendTransition = useRef<ViewTransition | null>(null);
  const sendVersion = useRef(0);
  const pendingSend = useRef(false);
  const messageKeys = useRef(new WeakMap<StoredChatMessage, number>());
  const nextMessageKey = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const conversationId = useRef<string | null>(null);
  if (!conversationId.current) conversationId.current = reviewConversationId(session.turnCount === 0);
  const latestUserIndex = session.messages.map(message => message.role).lastIndexOf('user');
  const retrySeconds = Math.max(0, Math.ceil((retryUntil - clock) / 1_000));
  const cannotSend = loading || retrySeconds > 0 || !!session.endedReason || session.turnCount >= CHAT_TURN_LIMIT;

  function messageKey(message: StoredChatMessage) {
    let key = messageKeys.current.get(message);
    if (key === undefined) { key = ++nextMessageKey.current; messageKeys.current.set(message, key); }
    return key;
  }

  useEffect(() => { saveChatSession(session); }, [session]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  useEffect(() => {
    if (!retryUntil) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= retryUntil) setRetryUntil(0);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);
  useLayoutEffect(() => {
    const restoring = !mounted.current;
    mounted.current = true;
    const last = session.messages.at(-1);
    if (last === previousLast.current) return;
    previousLast.current = last;
    const flow = scroll.current;
    const user = latestTurn.current;
    if (!last || !flow || !user || !restoring && !followLatest.current) return;
    // Show the start of a tall answer, not its bottom. Short turns retain the
    // customer's question above the reply. Restore saved chats without motion.
    const reply = last.role === 'assistant' ? latestReply.current : null;
    const anchor = reply && reply.offsetTop + reply.offsetHeight - user.offsetTop > flow.clientHeight - 32 ? reply : user;
    const instant = restoring || !!document.documentElement.dataset.chatTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    flow.scrollTo({ top: Math.max(0, anchor.offsetTop - 16), behavior: instant ? 'instant' : 'smooth' });
  }, [session.messages]);
  useEffect(() => () => {
    requestVersion.current += 1;
    sendVersion.current += 1;
    controller.current?.abort();
    sendTransition.current?.skipTransition();
    delete document.documentElement.dataset.chatTransition;
  }, []);

  function stopFollowing() {
    followLatest.current = false;
    // Native smooth scrolling is interruptible when someone starts reading up.
    scroll.current?.scrollTo({ top: scroll.current.scrollTop, behavior: 'instant' });
  }

  async function requestReply(messages: StoredChatMessage[], current: ChatSession) {
    if (controller.current || current.endedReason || messages.at(-1)?.role !== 'user' || retryUntil > Date.now()) return;
    const version = ++requestVersion.current;
    const abort = new AbortController();
    controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 30_000);
    onBusyChange?.(true);
    setLoading(true);
    setError('');
    const request: ChatRequest = {
      messages: messages.map(({ role, content }) => ({ role, content })),
      availability: Object.fromEntries(drinks.map(drink => [drink.id, availability[drink.id] === true])),
      preferences: current.preferences,
    };
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: abort.signal });
      if (version !== requestVersion.current) return;
      if (!response.ok) {
        if (response.status === 429) {
          const header = response.headers.get('retry-after');
          const now = Date.now();
          const seconds = header && /^\d+$/.test(header) ? Number(header) : header ? Math.ceil((Date.parse(header) - now) / 1_000) : 60;
          setClock(now);
          setRetryUntil(now + Math.min(300, Math.max(1, Number.isFinite(seconds) ? seconds : 60)) * 1_000);
          setError('Too many requests.');
        } else setError(response.status === 404 || response.status === 503 ? 'Drink chat is unavailable right now. Try again, or use quick choices.'
            : 'Could not send your message. Try again, or use quick choices.');
        return;
      }
      const result = parseChatResponse(await response.json());
      // A very fast reply should not interrupt the tapped chip's short journey.
      await sendTransition.current?.finished.catch(() => {});
      if (version !== requestVersion.current) return;
      if (!result) { setError('Could not read the reply. Try again, or use quick choices.'); return; }
      const assistant: StoredChatMessage = { role: 'assistant', content: result.reply, picks: result.picks, suggestions: result.suggestions };
      const pickCount = result.picks.filter(pick => {
        const drink = drinks.find(item => item.id === pick.drinkId);
        return drink && availability[drink.id] && isEligible(drink, result.preferences, availability);
      }).length;
      if (pickCount) analytics.recommendations('chat', pickCount);
      const endedReason = result.endedReason ?? (current.turnCount >= CHAT_TURN_LIMIT ? 'turn_limit' : null);
      if (endedReason) analytics.chatEnded(endedReason, current.turnCount, conversationId.current!, messages.filter(message => message.role === 'user').slice(-3).map(message => message.content));
      setFreshMessage(assistant);
      setSession(previous => ({ ...previous, preferences: result.preferences, messages: boundChatMessages([...messages, assistant]), endedReason: result.endedReason ?? (current.turnCount >= CHAT_TURN_LIMIT ? 'turn_limit' : null) }));
    } catch {
      if (version === requestVersion.current) setError(abort.signal.aborted ? 'The reply took too long. Try again, or use quick choices.' : 'Could not connect. Try again, or use quick choices.');
    } finally {
      window.clearTimeout(timeout);
      if (version === requestVersion.current) { controller.current = null; setLoading(false); onBusyChange?.(false); }
    }
  }

  function send(content: string, choice?: HTMLButtonElement) {
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > CHAT_MESSAGE_LIMIT || cannotSend || controller.current || pendingSend.current) return;
    const version = ++sendVersion.current;
    pendingSend.current = true;
    onBusyChange?.(true);
    sendTransition.current?.skipTransition();
    sendTransition.current = null;
    delete document.documentElement.dataset.chatTransition;
    const user: StoredChatMessage = { role: 'user', content: trimmed };
    const messages = boundChatMessages([...session.messages, user]);
    const next = { ...session, messages, turnCount: session.turnCount + 1 };
    const animateChoice = typeof document.startViewTransition === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const keyboardChoice = choice?.matches(':focus-visible');
    followLatest.current = true;
    const commit = () => {
      if (version !== sendVersion.current) return;
      pendingSend.current = false;
      if (session.turnCount === 0) analytics.beginFlow('chat');
      setSession(next);
      setInput('');
      setFreshMessage(user);
      setMovingMessage(choice && animateChoice ? user : null);
      void requestReply(messages, next);
    };
    if (!choice || !animateChoice) { commit(); return; }
    choice.style.viewTransitionName = 'chat-send';
    document.documentElement.dataset.chatTransition = 'send';
    const transition = document.startViewTransition(() => {
      flushSync(commit);
      if (keyboardChoice) latestTurn.current?.querySelector<HTMLElement>('.drink-chat-user')?.focus({ preventScroll: true });
    });
    sendTransition.current = transition;
    const cleanup = () => {
      choice.style.removeProperty('view-transition-name');
      if (sendTransition.current !== transition) return;
      sendTransition.current = null;
      delete document.documentElement.dataset.chatTransition;
      setMovingMessage(null);
      // Ending the shared transition must not replay the bubble's entrance.
      setFreshMessage(previous => previous === user ? null : previous);
    };
    void transition.ready.catch(() => {});
    void transition.finished.then(cleanup, cleanup);
  }

  function reset() {
    conversationId.current = reviewConversationId(true);
    requestVersion.current += 1;
    sendVersion.current += 1;
    pendingSend.current = false;
    controller.current?.abort();
    controller.current = null;
    sendTransition.current?.skipTransition();
    sendTransition.current = null;
    delete document.documentElement.dataset.chatTransition;
    setMovingMessage(null);
    setFreshMessage(null);
    followLatest.current = true;
    setLoading(false);
    onBusyChange?.(false);
    setError('');
    setInput('');
    setSession(clearChatSession());
    scroll.current?.scrollTo({ top: 0, behavior: 'instant' });
  }

  return <section className="drink-chat" aria-label="Drink conversation">
    <div className="drink-chat-tools">
      <button className="drink-chat-quick" onClick={onQuickChoices}>Quick choices<Icon name="chevron" size={15} /></button>
      <button className="drink-chat-reset" aria-label="Reset conversation" onClick={reset}><Icon name="reset" size={19} /></button>
    </div>
    <div className={`drink-chat-flow${!session.messages.length ? ' drink-chat-flow-opening' : ''}`} ref={scroll} onWheel={event => { if (event.deltaY < 0) stopFollowing(); }} onTouchMove={stopFollowing} onKeyDown={event => { if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) stopFollowing(); }}>
      {!session.messages.length ? <div className="drink-chat-opening"><span className="drink-chat-cup"><Icon name="steam" size={28} /></span><h2>What would you like today?</h2><p>Tell me what you feel like, or start here.</p><div className="drink-chat-suggestions" role="group" aria-label="Suggested replies">{openingPrompts.map(prompt => <button key={prompt} onClick={event => send(prompt, event.currentTarget)} disabled={cannotSend}>{prompt}</button>)}</div></div>
        : <ol className="drink-chat-messages" aria-label="Conversation" aria-live="polite" aria-relevant="additions">{session.messages.map((message, index) => <li key={messageKey(message)} ref={index === latestUserIndex ? latestTurn : index === session.messages.length - 1 && message.role === 'assistant' ? latestReply : undefined} className={`drink-chat-turn drink-chat-turn-${message.role}${message === freshMessage && message !== movingMessage ? ' drink-chat-turn-new' : ''}`}>
          {message.role === 'user' ? <p className="drink-chat-user" tabIndex={-1} style={{ viewTransitionName: message === movingMessage ? 'chat-send' : undefined }}>{message.content}</p> : <><p className="drink-chat-answer">{parseChatReply(message.content).map((part, partIndex) => part.bold ? <strong key={partIndex}>{part.text}</strong> : part.text)}</p>
            {!!message.picks?.length && <div className="drink-chat-picks" aria-label="Suggested drinks" onFocusCapture={revealChoice}>{message.picks.map(pick => {
              const drink = drinks.find(item => item.id === pick.drinkId);
              if (!drink || !availability[drink.id] || index === session.messages.length - 1 && !isEligible(drink, session.preferences, availability)) return null;
              return <article className="drink-chat-pick" key={drink.id}>
                <button type="button" className="drink-chat-pick-view" aria-label={`View ${drink.name}`} aria-description={formatPrice(drink.priceCents)} onClick={() => onView(drink)}><span className="drink-chat-photo" aria-hidden="true"><DrinkImage drink={drink} priority={index === session.messages.length - 1} /><ArrowUpRight className="drink-chat-pick-arrow" size={28} strokeWidth={1.8} /><span className="drink-chat-pick-price">{formatPrice(drink.priceCents)}</span></span><span className="drink-chat-pick-name">{drink.name}</span></button>
                <button type="button" className="drink-chat-pick-add" aria-label={`Add ${drink.name} to order`} onClick={event => onAdd(drink, event.currentTarget)}>Add to order</button>
              </article>;
            })}</div>}
            {!session.endedReason && index === session.messages.length - 1 && !!message.suggestions?.length && <div className="drink-chat-suggestions" role="group" aria-label="Suggested replies">{message.suggestions.map(suggestion => <button key={suggestion} onClick={event => send(suggestion, event.currentTarget)} disabled={cannotSend}>{suggestion}</button>)}</div>}
          </>}
        </li>)}</ol>}
      {loading && <ChatPendingReply />}
    </div>
    {session.endedReason ? <div className="drink-chat-ended" role="status"><p>{session.endedReason === 'turn_limit' ? '20-message limit reached' : 'Conversation ended'}</p><button type="button" onClick={reset}>Reset chat<Icon name="reset" size={16} /></button></div> : <form className="drink-chat-composer" onSubmit={event => { event.preventDefault(); send(input); }}>
      {(error || retrySeconds > 0) && <div className="drink-chat-error" role="alert"><p>{error || 'Too many requests.'} {retrySeconds > 0 && <span role="timer" aria-live="off">Wait {retrySeconds}s.</span>}</p>{session.messages.at(-1)?.role === 'user' && <button type="button" disabled={loading || retrySeconds > 0} onClick={() => { followLatest.current = true; void requestReply(session.messages, session); }}>Try again</button>}</div>}
      <label className="drink-chat-sr-only" htmlFor="drink-chat-input">Describe your drink</label>
      <div className="drink-chat-composer-field"><input id="drink-chat-input" value={input} onChange={event => setInput(event.target.value)} placeholder="Describe your drink…" autoComplete="off" maxLength={CHAT_MESSAGE_LIMIT} disabled={cannotSend} /><button type="submit" disabled={cannotSend || !input.trim()} aria-label="Send message"><ArrowUp size={20} strokeWidth={1.8} aria-hidden="true" /></button></div>
    </form>}
  </section>;
}
