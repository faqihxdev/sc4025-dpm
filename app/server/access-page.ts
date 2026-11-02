const lockIcon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#30302e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>')}`;

export function accessPage(nonce: string, error = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="same-origin"><title>Access</title>
<link rel="icon" type="image/svg+xml" href="${lockIcon}">
<style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#f5f5f4;color:#30302e;font:16px/1.5 system-ui,sans-serif}.access-screen{min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}main{width:min(100%,352px)}form{margin:0}.entry{display:flex;align-items:center;gap:8px;padding:6px;background:#fff;border:1px solid #d6d6d3;border-radius:18px;box-shadow:0 4px 16px #00000004;transition:border-color .15s,box-shadow .15s}.entry:focus-within{border-color:#737370;box-shadow:0 0 0 3px #2929290d}input#code{min-width:0;width:100%;height:48px;padding:0 12px;border:0;outline:0;background:transparent;color:inherit;font:inherit;letter-spacing:.06em}input::placeholder{letter-spacing:0;color:#92928d}button{font:inherit;cursor:pointer;border:0}button:focus-visible,input[type=checkbox]:focus-visible{outline:2px solid #575753;outline-offset:4px}.continue{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:12px;color:#fff;background:#30302e}.continue:hover,.enter:hover{background:#494946}svg{width:20px;height:20px}.notice{margin-top:24px}.notice p{margin:0 0 18px;color:inherit;font-size:14px;line-height:1.65}.agree{display:flex;align-items:flex-start;gap:10px;font-size:14px;cursor:pointer}.agree input{width:18px;height:18px;margin:2px 0 0;accent-color:#30302e;flex:none}.enter{width:100%;min-height:48px;margin-top:22px;border-radius:14px;background:#30302e;color:#fff;font-weight:550}.enter:disabled{background:#deded9;color:#8a8a84;cursor:default}.error{font-size:13px;margin:12px 12px 0;color:inherit}[hidden]{display:none!important}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
.code-label{display:block;margin:0 0 8px;font-size:14px;font-weight:550;color:inherit}
.code-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px}.code-summary strong{font-weight:550;letter-spacing:.06em}.code-status{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;background:#e8e8e4;font-size:12px;font-weight:550;white-space:nowrap}.code-status svg{width:14px;height:14px}.continue:disabled{opacity:.5;cursor:wait}
</style></head><body><div class="access-screen"><main>
<form method="post" action="/_access" id="access">
<div id="code-entry"><label class="code-label" for="code">Access code</label>
<div class="entry"><input type="text" id="code" name="code" placeholder="Enter code" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required><button class="continue" id="continue" type="submit" aria-label="Continue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></div>
</div><div class="code-summary" id="code-summary" role="status" aria-live="polite" hidden><span>Access code: <strong id="verified-code"></strong></span><span class="code-status"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>Correct</span></div>
<p class="error" id="code-error" role="alert"${error ? '' : ' hidden'}>${error}</p>
<input type="hidden" name="returnTo" id="returnTo" value="/">
<section class="notice" id="notice" hidden><p><strong>This is a student prototype, not an official Starbucks app.</strong> It is not affiliated with or endorsed by Starbucks. Starbucks owns its trademarks, logo and product photos. Orders and payments are simulated.</p><label class="agree"><input type="checkbox" name="acknowledged" value="yes" id="acknowledged">I understand this is an unofficial student prototype.</label><button class="enter" id="enter" type="submit" disabled>Enter prototype</button></section>
</form></main></div>
<script nonce="${nonce}">
const form=document.getElementById('access'),code=document.getElementById('code'),notice=document.getElementById('notice'),ack=document.getElementById('acknowledged'),enter=document.getElementById('enter'),next=document.getElementById('continue');
const entry=document.getElementById('code-entry'),summary=document.getElementById('code-summary'),error=document.getElementById('code-error');
const url=new URL(location.href),prefill=url.searchParams.get('c');
let checking=false;
async function checkCode(focus=false){
  if(checking||!code.reportValidity())return;
  const candidate=code.value.trim();checking=true;code.readOnly=true;next.disabled=true;error.hidden=true;form.setAttribute('aria-busy','true');
  try{
    const response=await fetch('/_access/check',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:candidate})});
    if(response.status!==204){let message='Could not check the code. Try again.';try{message=(await response.json()).error||message}catch{}throw new Error(message)}
    if(code.value.trim()!==candidate)return;
    document.getElementById('verified-code').textContent=candidate;entry.hidden=true;summary.hidden=false;notice.hidden=false;ack.required=true;if(focus)ack.focus();
  }catch(failure){error.textContent=failure.message||'Could not check the code. Try again.';error.hidden=false;if(focus)code.focus()}
  finally{checking=false;code.readOnly=false;next.disabled=false;form.removeAttribute('aria-busy')}
}
const prefilled=prefill&&/^[0-9]{6}$/.test(prefill);if(prefilled)code.value=prefill;
if(url.searchParams.has('c')){url.searchParams.delete('c');history.replaceState(null,'',url.pathname+url.search+url.hash)}
document.getElementById('returnTo').value=url.pathname+url.search+url.hash;
// Strict cookies are omitted on the first navigation from another site.
// This same-origin check recovers an existing session without accepting the code.
fetch('/_access/session',{credentials:'same-origin',cache:'no-store'}).then(response=>{if(response.status===204)location.replace(url.pathname+url.search+url.hash);else if(prefilled)checkCode()}).catch(()=>{if(prefilled)checkCode()});
form.addEventListener('submit',event=>{if(notice.hidden){event.preventDefault();checkCode(true)}else if(!ack.checked){event.preventDefault();ack.focus()}else{enter.disabled=true}});
code.addEventListener('input',()=>{notice.hidden=true;summary.hidden=true;entry.hidden=false;ack.checked=false;ack.required=false;enter.disabled=true;error.hidden=true});
ack.addEventListener('change',()=>{enter.disabled=!ack.checked});
</script></body></html>`;
}
