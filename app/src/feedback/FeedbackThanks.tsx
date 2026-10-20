import { useEffect, useRef, useState } from 'react';
import './FeedbackThanks.css';

const INVITATION_DURATION_MS = 6_000;
const PROGRESS_INTERVAL_MS = 100;

/** A pausable elapsed-time countdown. Callback changes do not restart it. */
export function createFeedbackCountdown(onProgress: (fraction: number) => void, onExpire: () => void) {
  let remaining = INVITATION_DURATION_MS;
  let startedAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let paused = true;
  let disposed = false;
  let expired = false;

  const clear = () => { clearTimeout(timer); timer = undefined; };
  const updateRemaining = () => {
    if (startedAt === null) return;
    const now = Date.now();
    remaining = Math.max(0, remaining - Math.max(0, now - startedAt));
    startedAt = now;
  };
  const tick = () => {
    timer = undefined;
    if (disposed || paused || expired) return;
    updateRemaining();
    onProgress(remaining / INVITATION_DURATION_MS);
    if (remaining === 0) {
      expired = true;
      startedAt = null;
      onExpire();
      return;
    }
    timer = setTimeout(tick, Math.min(PROGRESS_INTERVAL_MS, remaining));
  };

  return {
    setPaused(value: boolean) {
      if (disposed || expired || paused === value) return;
      updateRemaining();
      paused = value;
      clear();
      if (paused) {
        startedAt = null;
        onProgress(remaining / INVITATION_DURATION_MS);
      } else {
        startedAt = Date.now();
        tick();
      }
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}

export default function FeedbackThanks({ onAddComment, onDismiss, paused = false }: { onAddComment: () => void; onDismiss: () => void; paused?: boolean }) {
  const [progress, setProgress] = useState(1);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const dismiss = useRef(onDismiss);
  const countdown = useRef<ReturnType<typeof createFeedbackCountdown> | null>(null);
  dismiss.current = onDismiss;
  const timerPaused = paused || hovered || focused || hidden;

  useEffect(() => {
    const timer = createFeedbackCountdown(setProgress, () => dismiss.current());
    countdown.current = timer;
    return () => { timer.dispose(); countdown.current = null; };
  }, []);

  useEffect(() => {
    countdown.current?.setPaused(timerPaused);
  }, [timerPaused]);

  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', changed);
    changed();
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);

  return <div className="feedback-thanks" inert={paused} aria-hidden={paused || undefined}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    }}>
    <p role="status" aria-live="polite">Thank you for your feedback</p>
    <button type="button" onClick={onAddComment}>Add a comment</button>
    <div className="feedback-thanks-time" role="progressbar" aria-label="Comment invitation time remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
      <span style={{ transform: `scaleX(${progress})` }} />
    </div>
  </div>;
}
