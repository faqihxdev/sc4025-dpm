import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Sheet({ title, onClose, children, footer, returnFocus, closeRequested = false, onDismissStart }: { title: string; onClose: () => void; children: ReactNode; footer?: (close: () => void) => ReactNode; returnFocus?: () => HTMLElement | null; closeRequested?: boolean; onDismissStart?: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const closeStarted = useRef(false);
  const closeCallback = useRef(onClose);
  const dismissCallback = useRef(onDismissStart);
  const [closing, setClosing] = useState(false);
  closeCallback.current = onClose;
  dismissCallback.current = onDismissStart;
  const beginClose = (dismissed: boolean) => {
    if (closeStarted.current) return;
    closeStarted.current = true;
    if (dismissed) dismissCallback.current?.();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) closeCallback.current();
    else setClosing(true);
  };
  const requestClose = () => beginClose(true);
  useEffect(() => {
    if (closeRequested) beginClose(false);
  }, [closeRequested]);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => closeCallback.current(), 160);
    return () => window.clearTimeout(timer);
  }, [closing]);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    return () => { const target = returnFocus?.() ?? previous; if (target instanceof HTMLElement) target.focus({ preventScroll: true }); };
  }, []);
  return <div className={`sheet-layer${closing ? ' sheet-closing' : ''}`}>
    <button className="sheet-scrim" onClick={requestClose} tabIndex={-1} aria-label="Close dialog" />
    <section ref={ref} className="sheet" inert={closing} role="dialog" aria-modal="true" aria-labelledby="sheet-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); requestClose(); }
      if (event.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]:not(:disabled)');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div className="sheet-heading"><h2 id="sheet-title">{title}</h2><button className="icon-button" onClick={requestClose} aria-label="Close dialog"><Icon name="close" /></button></div>
      <div className="sheet-content">{children}</div>
      {footer && <div className="sheet-footer">{footer(requestClose)}</div>}
    </section>
  </div>;
}
