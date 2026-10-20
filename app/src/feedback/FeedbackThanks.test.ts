import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackThanks, { createFeedbackCountdown } from './FeedbackThanks';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

describe('feedback invitation countdown', () => {
  it('counts down for six active seconds and expires only once', () => {
    const progress = vi.fn(), expire = vi.fn();
    const timer = createFeedbackCountdown(progress, expire);
    timer.setPaused(false);
    expect(progress).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(3_000);
    expect(progress).toHaveBeenLastCalledWith(0.5);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_000);
    expect(progress).toHaveBeenLastCalledWith(0);
    expect(expire).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10_000);
    timer.setPaused(true);
    timer.setPaused(false);
    expect(expire).toHaveBeenCalledOnce();
    timer.dispose();
  });

  it('preserves elapsed time through repeated pauses without restarting', () => {
    const progress = vi.fn(), expire = vi.fn();
    const timer = createFeedbackCountdown(progress, expire);
    timer.setPaused(false);
    vi.advanceTimersByTime(1_550);
    timer.setPaused(true);
    expect(progress).toHaveBeenLastCalledWith(4_450 / 6_000);
    vi.advanceTimersByTime(20_000);
    timer.setPaused(true);
    expect(expire).not.toHaveBeenCalled();
    timer.setPaused(false);
    vi.advanceTimersByTime(1_000);
    timer.setPaused(false);
    timer.setPaused(true);
    vi.advanceTimersByTime(20_000);
    timer.setPaused(false);
    vi.advanceTimersByTime(3_449);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledOnce();
    timer.dispose();
  });

  it('cleans up timers and never expires after disposal', () => {
    const expire = vi.fn();
    const timer = createFeedbackCountdown(() => {}, expire);
    timer.setPaused(false);
    vi.advanceTimersByTime(1_000);
    timer.dispose();
    timer.setPaused(false);
    vi.advanceTimersByTime(10_000);
    expect(expire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('feedback invitation semantics', () => {
  it('announces thanks without stealing focus and provides a comment action', () => {
    const html = renderToStaticMarkup(createElement(FeedbackThanks, { onAddComment: () => {}, onDismiss: () => {} }));
    expect(html).toContain('class="feedback-thanks"');
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain('Thank you for your feedback');
    expect(html).toContain('>Add a comment</button>');
    expect(html).toContain('aria-label="Comment invitation time remaining"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('transform:scaleX(1)');
    expect(html).not.toContain('autofocus');
  });

  it('keeps a notice mounted but unavailable behind another drawer', () => {
    const html = renderToStaticMarkup(createElement(FeedbackThanks, { onAddComment: () => {}, onDismiss: () => {}, paused: true }));
    expect(html).toContain('class="feedback-thanks" inert="" aria-hidden="true"');
    expect(html).toContain('aria-valuenow="100"');
  });
});
