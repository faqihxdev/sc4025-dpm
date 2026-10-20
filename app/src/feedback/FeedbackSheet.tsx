import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';
import { analytics } from '../analytics/client';
import { Sheet } from '../components/Sheet';
import { getFeedbackResponseId, noteFeedbackVote, readFeedbackState } from './persistence';
import type { FeedbackVote } from './persistence';
import './FeedbackSheet.css';

type SendState = 'idle' | 'sending' | 'saved' | 'error';

export default function FeedbackSheet({ onClose, returnFocus, preview = false, onVoteSaved, commentVote }: { onClose: () => void; returnFocus?: () => HTMLElement | null; preview?: boolean; onVoteSaved?: (vote: FeedbackVote) => void; commentVote?: FeedbackVote }) {
  const [enabled, setEnabled] = useState(() => preview || analytics.isEnabled());
  const [savedVote, setSavedVote] = useState<FeedbackVote | null>(() => commentVote ?? (preview ? null : readFeedbackState().vote));
  const [vote, setVote] = useState(savedVote);
  const [voteState, setVoteState] = useState<SendState>('idle');
  const [comment, setComment] = useState('');
  const [commentOpen, setCommentOpen] = useState(Boolean(commentVote));
  const [commentState, setCommentState] = useState<SendState>('idle');
  const [closeRequested, setCloseRequested] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const manuallyDismissed = useRef(false);
  const acknowledgedVote = useRef<FeedbackVote | null>(null);
  const focusBeforeSend = useRef<HTMLElement | null>(null);
  const commentField = useRef<HTMLTextAreaElement>(null);
  const commentButton = useRef<HTMLButtonElement>(null);
  const busy = voteState === 'sending' || commentState === 'sending';
  const canSend = preview || enabled;
  const commentOnly = commentVote !== undefined;

  useEffect(() => {
    mounted.current = true;
    if (preview) return () => { mounted.current = false; };
    const unsubscribe = analytics.subscribe(() => setEnabled(analytics.isEnabled()));
    return () => { mounted.current = false; unsubscribe(); };
  }, [preview]);

  useEffect(() => {
    // Sheet sets its initial focus in a child effect. Run afterward for a
    // comment-only drawer so the visitor can start typing immediately.
    if (commentOnly) commentField.current?.focus({ preventScroll: true });
  }, [commentOnly]);

  useLayoutEffect(() => {
    if (commentOpen) commentField.current?.focus({ preventScroll: true });
  }, [commentOpen]);

  useLayoutEffect(() => {
    if (busy || closeRequested || manuallyDismissed.current) return;
    const previous = focusBeforeSend.current;
    focusBeforeSend.current = null;
    // Native blur can happen after this layout effect. Restore a now-disabled
    // focused control too, unless the visitor already moved focus elsewhere.
    if (!previous) return;
    const active = document.activeElement;
    const disabledPreviousStillFocused = active === previous && previous.matches(':disabled');
    if (active !== document.body && !disabledPreviousStillFocused) return;
    const target = previous.isConnected && !previous.matches(':disabled') ? previous : commentField.current ?? commentButton.current;
    if (target?.isConnected && !target.matches(':disabled') && !target.closest('[inert]')) target.focus({ preventScroll: true });
  }, [busy, voteState, commentState, closeRequested]);

  async function sendVote(value: FeedbackVote) {
    if ((!preview && !analytics.isEnabled()) || pending.current) return;
    pending.current = true;
    focusBeforeSend.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setVote(value);
    setVoteState('sending');
    let saved = preview;
    if (!preview) try {
      const responseId = getFeedbackResponseId();
      saved = await analytics.submitVote(value, responseId);
      // Keep an acknowledged vote even if the visitor closed the drawer.
      if (saved) noteFeedbackVote(value, responseId);
    }
    catch { saved = false; }
    if (mounted.current) {
      if (saved) setSavedVote(value);
      setVoteState(saved ? 'saved' : 'error');
      if (saved && !manuallyDismissed.current && onVoteSaved) {
        acknowledgedVote.current = value;
        setCloseRequested(true);
      }
    }
    pending.current = false;
  }

  async function sendComment() {
    const text = comment.trim();
    if ((!preview && !analytics.isEnabled()) || pending.current || !savedVote || savedVote !== vote || !text) return;
    pending.current = true;
    focusBeforeSend.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCommentState('sending');
    let saved = preview;
    if (!preview) try { saved = await analytics.submitComment(savedVote, getFeedbackResponseId(), text); }
    catch { saved = false; }
    if (mounted.current) {
      setCommentState(saved ? 'saved' : 'error');
      if (saved) setComment('');
    }
    pending.current = false;
  }

  const finishClose = () => {
    const saved = acknowledgedVote.current;
    if (saved && !manuallyDismissed.current && onVoteSaved) onVoteSaved(saved);
    else onClose();
  };

  return <Sheet title="Your feedback" onClose={finishClose} returnFocus={returnFocus} closeRequested={closeRequested} onDismissStart={() => { manuallyDismissed.current = true; }}>
    <div className={`feedback-sheet${commentOnly ? ' feedback-comment-only' : ''}`}>
      {!commentOnly && <h3 id="feedback-question">Would you use Find My Drink?</h3>}
      {preview && <p className="feedback-preview">Preview only. Nothing is sent.</p>}
      {!canSend && <p className="feedback-disabled" role="status">Usage analytics is off. Enable it in About to send feedback.</p>}
      {!commentOnly && <><div className="feedback-votes" role="group" aria-labelledby="feedback-question">
        <button type="button" className="feedback-vote" aria-pressed={vote === 'no'} disabled={!canSend || busy} onClick={() => void sendVote('no')}><ThumbsDown size={22} strokeWidth={1.8} aria-hidden="true" />No</button>
        <button type="button" className="feedback-vote" aria-pressed={vote === 'yes'} disabled={!canSend || busy} onClick={() => void sendVote('yes')}><ThumbsUp size={22} strokeWidth={1.8} aria-hidden="true" />Yes</button>
      </div>
      <div className={`feedback-status${voteState === 'error' ? ' feedback-error' : ''}`} role="status" aria-live="polite">
        {voteState === 'sending' ? 'Sending...' : voteState === 'saved' ? <><Check size={16} strokeWidth={1.8} aria-hidden="true" />Saved. Thank you!</> : voteState === 'error' ? <>Not saved. <button type="button" disabled={!canSend || busy} onClick={() => { if (vote) void sendVote(vote); }}>Try again</button></> : savedVote ? 'Your previous answer is selected. You can change it.' : null}
      </div></>}
      {!commentOnly && savedVote && !commentOpen && <button ref={commentButton} type="button" className="feedback-add-comment" disabled={!canSend || busy || savedVote !== vote} aria-expanded={false} aria-controls="feedback-comment-form" onClick={() => setCommentOpen(true)}>Add a comment</button>}
      {savedVote && commentOpen && <form id="feedback-comment-form" className="feedback-note" onSubmit={event => { event.preventDefault(); void sendComment(); }}>
        <label htmlFor="feedback-comment">Comment <span>Optional</span></label>
        <textarea ref={commentField} id="feedback-comment" value={comment} rows={3} maxLength={500} disabled={!canSend || busy} aria-describedby="feedback-comment-hint feedback-comment-status" onChange={event => { setComment(event.target.value); setCommentState('idle'); }} />
        <p id="feedback-comment-hint" className="feedback-hint">Please leave out personal information.</p>
        <button type="submit" className="button feedback-send" disabled={!canSend || busy || !comment.trim() || savedVote !== vote}>{commentState === 'sending' ? 'Sending...' : 'Send feedback'}</button>
        <div id="feedback-comment-status" className={`feedback-status${commentState === 'error' ? ' feedback-error' : ''}`} role="status" aria-live="polite">
          {commentState === 'saved' ? <><Check size={16} strokeWidth={1.8} aria-hidden="true" />Feedback sent. Thank you!</> : commentState === 'error' ? 'Not sent. Try Send feedback again.' : null}
        </div>
      </form>}
    </div>
  </Sheet>;
}
