import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackSheet from './FeedbackSheet';

const fixture = vi.hoisted(() => ({
  enabled: true,
  vote: null as 'yes' | 'no' | null,
  submitVote: vi.fn(),
  submitComment: vi.fn(),
  responseId: vi.fn(),
  enabledCheck: vi.fn(),
  readState: vi.fn(),
  persistVote: vi.fn(),
}));
vi.mock('../analytics/client', () => ({ analytics: {
  isEnabled: fixture.enabledCheck,
  subscribe: () => () => {},
  submitVote: fixture.submitVote,
  submitComment: fixture.submitComment,
} }));
vi.mock('./persistence', () => ({
  readFeedbackState: fixture.readState,
  getFeedbackResponseId: fixture.responseId,
  noteFeedbackVote: fixture.persistVote,
}));
beforeEach(() => {
  fixture.enabled = true;
  fixture.vote = null;
  vi.clearAllMocks();
  fixture.enabledCheck.mockImplementation(() => fixture.enabled);
  fixture.readState.mockImplementation(() => ({ questionVersion: 1, responseId: null, vote: fixture.vote, dismissedUntil: 0 }));
});

describe('feedback UI semantics', () => {
  it('asks one clear question with No before Yes in the DOM', () => {
    const html = renderToStaticMarkup(createElement(FeedbackSheet, { onClose: () => {} }));
    expect(html).toContain('Would you use Find My Drink?');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('role="group" aria-labelledby="feedback-question"');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html.indexOf('>No</button>')).toBeLessThan(html.indexOf('>Yes</button>'));
    expect(html).not.toContain('textarea');
    expect(fixture.submitVote).not.toHaveBeenCalled();
    expect(fixture.responseId).not.toHaveBeenCalled();
  });

  it.each(['yes', 'no'] as const)('restores a %s answer but keeps the optional note collapsed', vote => {
    fixture.vote = vote;
    const html = renderToStaticMarkup(createElement(FeedbackSheet, { onClose: () => {} }));
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('Your previous answer is selected. You can change it.');
    expect(html).toContain('Add a comment');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="feedback-comment-form"');
    expect(html).not.toContain('textarea');
    expect(html).not.toContain('Send feedback');
    expect(fixture.submitComment).not.toHaveBeenCalled();
  });

  it('keeps manual feedback visible but disabled when usage analytics is off', () => {
    fixture.enabled = false;
    fixture.vote = 'yes';
    const html = renderToStaticMarkup(createElement(FeedbackSheet, { onClose: () => {} }));
    expect(html).toContain('Usage analytics is off. Enable it in About to send feedback.');
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(fixture.submitVote).not.toHaveBeenCalled();
    expect(fixture.submitComment).not.toHaveBeenCalled();
  });

  it('starts preview neutral and enabled without reading analytics, a saved vote or UUID', () => {
    fixture.enabled = false;
    fixture.vote = 'yes';
    const html = renderToStaticMarkup(createElement(FeedbackSheet, { onClose: () => {}, preview: true }));
    expect(html).toContain('Preview only. Nothing is sent.');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('Your previous answer');
    expect(html).not.toContain('Add a comment');
    expect(html).not.toContain('textarea');
    expect(fixture.enabledCheck).not.toHaveBeenCalled();
    expect(fixture.readState).not.toHaveBeenCalled();
    expect(fixture.responseId).not.toHaveBeenCalled();
    expect(fixture.persistVote).not.toHaveBeenCalled();
    expect(fixture.submitVote).not.toHaveBeenCalled();
    expect(fixture.submitComment).not.toHaveBeenCalled();
  });

  it.each(['yes', 'no'] as const)('opens a comment-only drawer for a %s vote without reading saved feedback', commentVote => {
    fixture.vote = commentVote === 'yes' ? 'no' : 'yes';
    const html = renderToStaticMarkup(createElement(FeedbackSheet, { onClose: () => {}, commentVote }));
    expect(html).toContain('Your feedback');
    expect(html).toContain('feedback-comment-only');
    expect(html).toContain('<textarea');
    expect(html).toContain('Comment <span>Optional</span>');
    expect(html).toContain('maxLength="500"');
    expect(html).toContain('Send feedback');
    expect(html).not.toContain('feedback-votes');
    expect(html).not.toContain('Would you use Find My Drink?');
    expect(html).not.toContain('Add a comment');
    expect(fixture.readState).not.toHaveBeenCalled();
    expect(fixture.submitVote).not.toHaveBeenCalled();
  });

  it('uses the passed vote transiently for a preview comment drawer', () => {
    fixture.enabled = false;
    fixture.vote = 'no';
    const html = renderToStaticMarkup(createElement(FeedbackSheet, { onClose: () => {}, preview: true, commentVote: 'yes' }));
    expect(html).toContain('Preview only. Nothing is sent.');
    expect(html).toContain('<textarea');
    expect(html).not.toMatch(/<textarea[^>]*disabled/);
    expect(html).not.toContain('Usage analytics is off');
    expect(fixture.enabledCheck).not.toHaveBeenCalled();
    expect(fixture.readState).not.toHaveBeenCalled();
    expect(fixture.responseId).not.toHaveBeenCalled();
    expect(fixture.persistVote).not.toHaveBeenCalled();
    expect(fixture.submitVote).not.toHaveBeenCalled();
    expect(fixture.submitComment).not.toHaveBeenCalled();
  });
});
