# Cloudflare cost for the proposed chat endpoint

Checked on 3 October 2026 against Cloudflare's official documentation. This estimates the proposal in `chat-cloudflare-architecture.md`. It does not confirm the account's current subscriptions or invoice.

For a class demo, the static React app plus a small `/api/chat` Pages Function can fit the Workers Free plan, so the expected additional Cloudflare cost is USD 0. An external AI provider's inference charges or free allowance are separate. No provider has been selected.

## Static app and external AI proxy

- Static asset requests that do not invoke a Function are free and unlimited. Pages Function requests share the account's Workers Free allowance of 100,000 requests per day. This resets at midnight UTC, or 08:00 in Singapore. [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/).
- Limit Function invocation to `/api/chat` through `_routes.json`, as proposed in the architecture note, so ordinary page and asset requests keep free static delivery. [Invocation routes](https://developers.cloudflare.com/pages/functions/routing/#functions-invocation-routes).
- Free allows 10 ms of CPU execution per invocation. Time waiting for the external AI provider through `fetch()` does not consume CPU time. The handler still needs to stay within the execution limit. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time).
- Exhausting the Free allowance stops Function execution until the reset. Pages can continue serving static assets or return an error, depending on its fail-open/fail-closed setting. The documented response is a limit failure, rather than automatic paid overage billing. [Pages quota behavior](https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed), [Workers daily requests](https://developers.cloudflare.com/workers/platform/limits/#daily-requests).
- Workers Paid is an optional upgrade with a minimum USD 5 monthly account charge. It includes 10 million requests and 30 million CPU milliseconds per month, then charges for additional usage. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

One chat message that causes one POST uses approximately one Function request. For example, 100 testers sending 20 messages each would use 2,000 requests, assuming no retries or extra API calls. This is a workload estimate, not a Cloudflare guarantee.

## If Cloudflare runs the AI model

Workers AI has a separate standard free allowance of 10,000 Neurons per day. Neurons measure model compute, so this is not 10,000 messages. Model choice and input/output length determine usage. On Workers Free, exceeding the allowance makes further operations fail. Higher standard usage requires Workers Paid and costs USD 0.011 per 1,000 Neurons above the daily free allocation. Some models require paid billing from the start. [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

The USD 0 estimate assumes Workers Free, a lightweight handler within its limits, and no additional paid services. Adding storage or other Cloudflare products would require checking their own allowances.
