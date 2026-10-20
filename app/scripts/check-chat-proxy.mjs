import assert from 'node:assert/strict';

const base = process.env.CHAT_PREVIEW_URL || 'http://127.0.0.1:4178';
const url = new URL(base);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Check only the local preview.');
const post = (origin, site) => fetch(`${url.origin}/api/chat`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': site }, body: '{}',
});
// Empty input reaches validation without consuming any provider credits.
assert.equal((await post(url.origin, 'same-origin')).status, 400, 'A same-origin request must reach input validation, not fail origin checks.');
assert.equal((await post('https://foreign.example', 'cross-site')).status, 403, 'Foreign origins must stay blocked.');
console.log('PASS local chat proxy: same-origin accepted, foreign origin blocked. No AI calls made.');
