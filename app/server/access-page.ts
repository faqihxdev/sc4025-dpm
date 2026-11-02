export function accessPage(nonce: string, error = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="same-origin"><title>Access</title>
<style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;min-height:100svh;background:#f5f5f4;color:#292929;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;padding:24px}main{width:min(100%,352px)}form{margin:0}.entry{display:flex;align-items:center;gap:8px;padding:6px;background:#fff;border:1px solid #d6d6d3;border-radius:18px;box-shadow:0 4px 16px #00000004;transition:border-color .15s,box-shadow .15s}.entry:focus-within{border-color:#737370;box-shadow:0 0 0 3px #2929290d}input[type=password]{min-width:0;width:100%;height:48px;padding:0 12px;border:0;outline:0;background:transparent;color:inherit;font:inherit;letter-spacing:.06em}input::placeholder{letter-spacing:0;color:#92928d}button{font:inherit;cursor:pointer;border:0}button:focus-visible,input[type=checkbox]:focus-visible{outline:2px solid #575753;outline-offset:4px}.continue{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:12px;color:#fff;background:#30302e}.continue:hover,.enter:hover{background:#494946}svg{width:20px;height:20px}.notice{margin-top:24px}.notice p{margin:0 0 18px;color:#62625d;font-size:14px;line-height:1.65}.agree{display:flex;align-items:center;gap:10px;font-size:14px;cursor:pointer}.agree input{width:18px;height:18px;margin:0;accent-color:#30302e;flex:none}.enter{width:100%;min-height:48px;margin-top:22px;border-radius:14px;background:#30302e;color:#fff;font-weight:550}.enter:disabled{background:#deded9;color:#8a8a84;cursor:default}.error{font-size:13px;margin:12px 12px 0;color:#565650}[hidden]{display:none!important}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body><main>
<form method="post" action="/_access" id="access">
<div class="entry"><input type="password" id="code" name="code" aria-label="Access code" placeholder="Access code" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required><button class="continue" id="continue" type="submit" aria-label="Continue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></div>
${error ? `<p class="error" role="alert">${error}</p>` : ''}
<input type="hidden" name="returnTo" id="returnTo" value="/">
<section class="notice" id="notice" hidden><p>This is an independent student concept, unaffiliated with Starbucks. Starbucks owns its trademarks, logo and product photos. Orders and payments are simulated.</p><label class="agree"><input type="checkbox" name="acknowledged" value="yes" id="acknowledged">I understand this is a concept.</label><button class="enter" id="enter" type="submit" disabled>Enter prototype</button></section>
</form></main>
<script nonce="${nonce}">
const form=document.getElementById('access'),code=document.getElementById('code'),notice=document.getElementById('notice'),ack=document.getElementById('acknowledged'),enter=document.getElementById('enter'),next=document.getElementById('continue');
const url=new URL(location.href),prefill=url.searchParams.get('c');
if(prefill&&/^[0-9]{6}$/.test(prefill))code.value=prefill;
if(url.searchParams.has('c')){url.searchParams.delete('c');history.replaceState(null,'',url.pathname+url.search+url.hash)}
document.getElementById('returnTo').value=url.pathname+url.search+url.hash;
// Strict cookies are omitted on the first navigation from another site.
// This same-origin check recovers an existing session without accepting the code.
fetch('/_access/session',{credentials:'same-origin',cache:'no-store'}).then(response=>{if(response.status===204)location.replace(url.pathname+url.search+url.hash)}).catch(()=>{});
form.addEventListener('submit',event=>{if(notice.hidden){event.preventDefault();notice.hidden=false;ack.required=true;next.hidden=true;ack.focus()}else if(!ack.checked){event.preventDefault();ack.focus()}else{enter.disabled=true}});
code.addEventListener('input',()=>{notice.hidden=true;ack.checked=false;ack.required=false;enter.disabled=true;next.hidden=false});
ack.addEventListener('change',()=>{enter.disabled=!ack.checked});
</script></body></html>`;
}
