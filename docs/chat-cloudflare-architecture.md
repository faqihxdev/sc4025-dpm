# Conversational discovery on Cloudflare

Updated on 2 November 2026. Chat is served at `sbx.utf.sh/api/chat`.
The selected provider is OpenAI, using `gpt-6-luna` with medium reasoning.

## Current app

The React/Vite app keeps catalogue, stock and cart state locally. Its optional chat now has a Pages Function backend, with no database or Starbucks account integration.
The existing Pages Direct Upload project is `fmd`, with production branch `main` and custom domain `sbx.utf.sh`.

## Request path

```text
Chat UI on sbx.utf.sh
  -> POST /api/chat
  -> Pages Function running on Cloudflare Workers
  -> OpenAI Responses API, gpt-6-luna with medium reasoning
  -> optional get_order_history() from a fictional server fixture
  -> final model response or allowlisted end_conversation(reason)
  -> at most two provider requests per turn
  -> validated preferences / catalogue drink IDs
  -> image-first drink cards and optional bold reply phrases
```

`app/functions/api/chat.ts` sits beside `app/dist`, with an `onRequestPost` handler.
Pages maps the file to `/api/chat`, so the browser can call its own origin.
This is a small serverless backend for the current Pages project.
[Function setup](https://developers.cloudflare.com/pages/functions/get-started/), [routing](https://developers.cloudflare.com/pages/functions/routing/) and [HTTP handlers](https://developers.cloudflare.com/pages/functions/api-reference/).

The endpoint interprets the request into typed preferences, validates them, then reuses the existing catalogue and hard filters.
Keep price, availability and recipe claims in catalogue data. Return a follow-up when unclear.
Keep conversation state in the current session for the first version, with no persistent chat database.

The browser sends messages, preferences and simulated stock, not order history.
The assistant can call the read-only `get_order_history()` tool when helpful.
Its result is explicitly fictional, with no account lookup or customer selector.
The server forwards the matching tool result with all response output items, then
requests a final answer. Tool choice is automatic, not a scripted question tree.
The other allowed tool, `end_conversation`, returns a server-written closing reply
and reason. It can also run after a history lookup without a third provider call.
The UI persists closure and a 20-submission counter in the browser session,
separate from the rolling 12-message context. Reset starts a fresh conversation.
The UI cap is not server-side authentication or a global spending control.
[Function calling](https://developers.openai.com/api/docs/guides/function-calling).

## Where the key lives

`OPENAI_API_KEY` is an encrypted production Pages secret on project `fmd`.
Function code reads `context.env.OPENAI_API_KEY`.
The local installer `app/scripts/deploy-chat-secret.mjs` reads only this key from
the ignored parent `.env` and sends it through Wrangler's stdin, never a command
argument or temporary file. No preview-environment secret was configured.
For manual rotation, use Workers & Pages > this project > Settings > Variables
and Secrets, select production, encrypt the value and redeploy.
[Pages secrets](https://developers.cloudflare.com/pages/functions/bindings/#secrets).

Do not use `VITE_OPENAI_API_KEY`. Vite embeds `VITE_*` values in browser code. [Vite environment variables](https://vite.dev/guide/env-and-mode#env-variables).
For local development, the user keeps `OPENAI_API_KEY` in `codebase/.env`.
From `app/`, `npm run dev:api` copies only this key into ignored `app/.dev.vars`
before starting Wrangler. The helper does not print the value. Wrangler's parent
`--env-file` option did not expose the key as a Pages Function secret in local tests.
Both `.env*` and `.dev.vars*` are ignored by Git. Vite does not read this parent file.
[Local secrets](https://developers.cloudflare.com/pages/functions/bindings/#local-development-with-secrets).

## Fit with the current deployment

Wrangler compiles `functions/` in the deployment directory. The current `app/` command can publish assets and Functions.
Dashboard folder/ZIP upload does not compile `functions/`; continue using Wrangler after adding the endpoint.
[Direct Upload Functions](https://developers.cloudflare.com/pages/get-started/direct-upload/#functions).

Repeat deployment commands from `app/`:

```powershell
npm run build
npm run check:size
# Only for initial secret setup or rotation
node scripts/deploy-chat-secret.mjs
npx --yes wrangler@4.146.0 pages deploy dist --project-name fmd --branch main --commit-dirty=true
```

`app/wrangler.jsonc` pins the existing Pages project, `./dist` and the
`2026-10-03` compatibility date. The 3 October deployment passed a real chat
request, returning two valid catalogue IDs. GET, malformed POST and foreign-origin
POST checks returned 405, 400 and 403 respectively. The client build scan found
no secret files or key value. See [deployment checks](../tests/README.md).

[Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/).
Limit invocation to `/api/chat` with build-output `_routes.json`, `{"version":1,"include":["/api/chat"],"exclude":[]}`.
In Vite it can originate in `app/public/`. Static pages and assets can then keep their free delivery.
[Invocation routing](https://developers.cloudflare.com/pages/functions/routing/#functions-invocation-routes).

## Cost

Static requests remain free and unlimited when they do not invoke Functions. Function requests share the Workers quota, currently 100,000 daily on Free.
AI inference has a separate cost or allowance; this quota is not free AI.
[Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/).

OpenAI inference uses the user's credits separately from Cloudflare hosting.
The dedicated `Starbucks - SC4025` OpenAI project has a $5 monthly hard limit
and allows only `gpt-6-luna`. Slight enforcement overshoot is possible.
[Project spending limits](https://developers.openai.com/api/docs/guides/spend-limits).

## Production controls and remaining risks

Implemented controls validate request shape, cap message/history size and output tokens,
set timeouts, check known drink IDs and stock, and reject unsafe recipe claims.
Basic profanity/injection checks redirect obvious misuse. They are not a complete
firewall. The request limiter uses per-process memory, not a globally enforced quota.
Keep secrets and message bodies out of routine logs. Same-origin requests and Origin checks do not authenticate a caller.

The earlier deployment counted provider calls: 12 per IP per minute, plus a shared
60,000 estimated-token allowance per running isolate. Its compact mocked fixture
hit the token cap after six ordinary replies or two history-based replies.

Deployment `a4f1d870` raises this to 30 customer inference requests
per IP per minute and 1,000,000 estimated tokens per running isolate per minute.
Only the first provider round counts toward the customer-request limit. Both
rounds reserve estimated input and output tokens before dispatch. Denied attempts
do not reserve additional usage. HTTP 429 returns the actual remaining window;
if several guards deny, it uses the longest remaining wait. A full 20-submission
demo fits the mocked allowance checks, including history-based replies. Shared
network IPs share the request limit, and different IPs can share the token bucket.
A provider-side error, including OpenAI 429, still maps to HTTP 503.

The deployed client respects `Retry-After` with a visible countdown and disabled
retry/send actions. It never automatically retries. Provider project spending
settings and the 20-submission conversation cap are unchanged. These checks use
mocked provider responses; they require no paid API calls or secret access.

The current deployment retains these demo-level controls. It has no durable
limiter, authentication or Turnstile check. Non-browser callers can spoof Origin;
the in-memory quota is not a global spend cap. This was disclosed before publishing.

For stronger public abuse protection, add Turnstile with server-side Siteverify
validation before inference, checking the expected hostname and action.
[Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
An edge rate-limit rule can protect the custom domain, subject to plan limits. Also protect the Function itself and check `pages.dev`/preview paths.
They must not bypass the controls or share an unrestricted production key.
[Rate limiting availability](https://developers.cloudflare.com/waf/rate-limiting-rules/#availability).
