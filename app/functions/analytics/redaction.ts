// Best-effort redaction for the limited closed-chat review. It cannot detect
// every piece of personal information, so these excerpts remain private data.
export function redactReviewMessage(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\b(?:[a-z][a-z0-9_]*_(?:key|token|password|secret)|password|passwd|pwd|secret|(?:api|access|auth|secret)[_ -]*(?:key|token))["']?\s*[:=]\s*(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[^\s,;]+)/gi, '[secret removed]')
    .replace(/\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>]+/gi, '[link removed]')
    .replace(/\b[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|phx_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g, '[token removed]')
    .replace(/\b(?:authorization\s*:\s*)?bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, '[token removed]')
    .replace(/(?:\+?\d[\d ().-]{6,}\d)/g, (possiblePhone) =>
      possiblePhone.replace(/\D/g, '').length >= 8 ? '[phone removed]' : possiblePhone)
    .trim();
}
