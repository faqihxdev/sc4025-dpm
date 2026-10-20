/** Explicit UI-only testing. It never enables analytics or changes saved feedback. */
export function isFeedbackPreview(search?: string): boolean {
  if (search === undefined) {
    try { search = window.location.search; }
    catch { return false; }
  }
  return new URLSearchParams(search).get('feedback') === 'preview';
}
