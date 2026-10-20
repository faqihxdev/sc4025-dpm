import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFeedbackPreview } from './preview';

afterEach(() => vi.unstubAllGlobals());

describe('feedback preview', () => {
  it.each(['?feedback=preview', '?other=1&feedback=preview'])('allows the explicit preview query %s', search => {
    expect(isFeedbackPreview(search)).toBe(true);
  });
  it.each(['', '?feedback=1', '?feedback=true', '?feedback=Preview', '?other=preview'])('does not treat %s as preview', search => {
    expect(isFeedbackPreview(search)).toBe(false);
  });
  it('reads the current browser query', () => {
    vi.stubGlobal('window', { location: { search: '?feedback=preview' } });
    expect(isFeedbackPreview()).toBe(true);
  });
  it('stays off outside the browser', () => {
    vi.stubGlobal('window', undefined);
    expect(isFeedbackPreview()).toBe(false);
  });
});
