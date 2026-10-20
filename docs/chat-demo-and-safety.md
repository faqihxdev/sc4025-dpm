# Conversational drink discovery: demo and safety

Updated 3 October 2026. Chat is implemented and connected locally. Real calls
verified discovery, iced/no-coffee refinement, drink comparison and the automatic
fictional order-history lookup. The latest lookup returned the correct recipe
counts with selective bold emphasis. History uses a model-selected server tool
instead of a client toggle. Live evaluation also verified two close recommendations,
the single-choice and single-stock exceptions, three-turn off-topic closure, and
a relevant drink request interrupting the off-topic sequence. These are sampled
model checks, not a guarantee for every possible phrasing.
The dedicated OpenAI project has a $5 monthly hard limit. Chat was deployed on
3 October 2026, and one production request returned two valid catalogue picks.
The broader sampled model evaluations above were local checks, not a full
production re-evaluation.
Deployment `a4f1d870` later that day published the chat size picker, bottom-right
opening, reply motion and revised request allowance. Its production smoke request
returned two valid iced-coffee picks. It did not repeat the broader model evaluation.

## Product scope

Keep the three quick goals. Add a fourth card, styled like the other goals, that opens **Help me choose**. Chat is an optional route for comparisons, uncertainty and requests that do not fit a single goal. It is not a general-purpose assistant, account integration or live Starbucks ordering service.

The assistant freely writes contextual quick replies after any active reply, including recommendations. They are optional next customer messages, not a fixed menu or automatic UI actions. Aim for two to six words and no more than 40 characters; validation still accepts up to three plain-text labels of at most 80 characters. Tapping a label sends its text as the next message. Closed chats have no reply chips.

The fourth goal card uses a generated four-drink collage over a light pastel backdrop. It keeps the existing circular frame and card layout. The illustration is decorative, not recipe evidence. Its source and generation prompt are recorded in `app/assets/generated/drink-discovery.md`; the 128px WebP is about 6.8 KB.

Use a concise reply and up to three useful reply chips. Discovery normally offers two distinct close matches, best first. Return one if requested or if only one genuine fit exists; do not force cards into factual answers. Rectangular photos fill image-first cards, with a corner arrow and name below. Tapping the image or name opens the recipe. Add to order below the name opens a size drawer; confirming adds the chosen size without leaving chat, using the existing availability check, cart badge and confirmation toast. Closing the drawer adds nothing. Opening examples are vertical and bottom-right, while follow-up chips wrap inline. Replies support selective **bold phrases** through an escaped text renderer, not HTML or full Markdown. Pending replies show animated dots and neutral cycling phrases without invented progress; reduced motion keeps them still.

Cards show the Tall base price. The chat size drawer starts with Tall selected and previews the chosen price before confirmation. The drink page and cart Edit drawer also allow size selection. The server supplies the same simulated options as the UI, including Short for hot drinks, Tall, Grande and Venti, with each option's demo price. The assistant can explain those options but cannot select a size, alter the cart or claim an order was added. Sizes and price increments are prototype fixtures, not verified outlet availability or quotes. Chat budget matching still checks the Tall base price, so a larger size must not be described as meeting the same budget unless its own supplied price does. Published sugar remains per 100 mL of the default recipe before ice. Do not multiply it by cup capacity to invent serving-total nutrition, caffeine or physiological effects.

Keep a bounded transcript and the latest preferences across turns. A current request takes precedence over past orders. History can suggest a starting point, but does not establish allergies, dietary restrictions or an unchanging taste.

The UI limits each conversation to 20 user submissions. It sends the latest 12 messages as model context. Retries reuse a submission rather than increasing the count. The final reply remains visible, then Reset chat replaces the composer. Closure and count survive reload in the current browser tab; Reset clears them. This browser-controlled limit is a demo UX rule, not durable abuse protection or a spend cap.

The assistant can call `end_conversation` with an allowlisted reason. Three consecutive clearly off-topic requests can close a chat; dangerous instructions, targeted repeated abuse or clear security misuse can also trigger closure. Greetings, thanks, drink feedback, ingredient questions and safety definitions are not off-topic or dangerous by themselves. A relevant conversational turn interrupts the off-topic sequence. Terminal replies are calm, server-written text with no new reply chips. The model's classification remains best-effort.

## Demo story

The server's `get_order_history()` tool returns a fictional demo profile: Iced Caffè Latte ×3 and Iced Americano ×1. It has no customer selector, account access or write action. The assistant decides when history is useful; generic drink questions do not require a lookup. The tool result identifies its fictional origin, and the assistant must not pretend these are the user's real purchases.

This recipe-level history records no sizes. Do not infer the customer's usual cup size from it. The chat request, preferences and recommendation-card contract remain size-free; size options are server catalogue context, not a new tool or customer field.

1. A demo customer wants something different from their usual iced coffee. Open **Help me choose**.
2. Tap **Something like my usual**. The assistant can retrieve the demo profile and suggest a direction without a manual history switch.
3. Choose **Try something different**. The assistant can connect new catalogue choices to the familiar recipe, or answer a comparison question directly.
4. Refine with **No dairy** or a typed request, such as "Something iced with oatmilk. How is it different from my latte?" The assistant remembers the conversation and explains the change.
5. Tap **Add to order**, pick a size and confirm without leaving chat. Alternatively, open a card to review the recipe first.

The exact cards depend on the catalogue and stock. Do not script a claim that an unavailable combination has a match. A short clarification or honest alternative is a valid result. The demo should demonstrate preference carry-over, comparison and refinement, not only a sequence of filters.

## OpenAI request

Use the exact requested model `gpt-6-luna` through `POST /v1/responses`, with `reasoning: { effort: "medium" }`. The model supports this effort and Structured Outputs. Current standard short-context prices are USD0.10 per million input tokens and USD0.50 per million output tokens. [Model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna).

The server controls the model, prompt, token limit and schema. It does not accept those settings or order-history data from the browser. Strict functions `get_order_history` and `end_conversation` use automatic tool choice. The first reads a fictional fixture; the second returns a terminal app response. There is no external browsing, code execution or account action. After a history lookup, only the ending tool remains available. The request loop preserves provider output items and matching history results for reasoning continuity, allows at most two provider calls, and keeps the key outside tool data. [Function calling](https://developers.openai.com/api/docs/guides/function-calling), [reasoning continuity](https://developers.openai.com/api/docs/guides/reasoning).

`max_output_tokens` includes reasoning and visible output. A response may become `incomplete` before returning any usable text, while still consuming billable tokens. Start with a bounded allowance such as 1,600 for this small task, measure it, and handle incomplete responses without inventing an answer. This allowance is our starting configuration, not an OpenAI guarantee. [Reasoning token limits](https://developers.openai.com/api/docs/guides/reasoning#controlling-costs).

## USD5 spend control

Current OpenAI documentation distinguishes spend alerts from hard limits. In the new project's settings, select **Limits → Spend → Edit spend limit**, set a **USD5 monthly limit**, enable **Enforce a hard limit**, and save. Confirm the saved hard-limit state before using the key. A threshold email alone does not cap spending.

At a reached project hard limit, affected requests return HTTP429 with `project_spend_limit_exceeded`. Enforcement can lag briefly, so tracked spend may slightly exceed USD5. Do not claim an exact, instantaneous cap. [OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits).

The key stays in a server-only local secret for testing and an encrypted
production Pages secret. Never put it in React, a `VITE_*` value, chat transcript,
screenshot, repository or build asset. See [the Cloudflare architecture note](chat-cloudflare-architecture.md).

## Small, practical safeguards

- Validate body size, roles, message length and conversation length. Treat browser stock and preferences as untrusted demo input. Orders come only from the server fixture, not a client-supplied account or history list.
- Keep user text and history out of privileged instructions. A short rule-pattern check can reject obvious attempts to override instructions or request secrets. It is only a first pass, not a prompt-injection solution.
- Use a strict output schema. Independently validate preferences and catalogue IDs, remove duplicate or unavailable cards, and render escaped text with optional bold phrases. The model cannot create prices, drinks, discounts or cart actions.
- Allow only declared tools. History takes empty arguments; closure takes one allowlisted reason. Reject unknown tools, malformed arguments and repeated history calls. Bound the total time and reserve usage for both provider requests.
- Do not relax explicit constraints silently. If no catalogue drink fits, explain the conflict and ask permission to change a preference.
- Keep claims tied to catalogue fields. **No coffee** does not mean **caffeine-free**. A recipe milk field is not an allergen guarantee. Do not promise allergy safety or medical suitability.
- Keep a short, helpful drink-only redirect for unrelated requests. Profanity detection should not erase an otherwise understandable drink request or be presented as comprehensive safety.
- Add timeout, a bounded transcript and per-caller request limits. An in-memory limiter is per running isolate and resets, so it is not a global spend cap or reliable public abuse control.
- The public demo currently has no durable limiter, authentication or anti-bot check. Stronger abuse protection would need to cover the custom domain, `pages.dev` and preview paths, using a durable or edge-enforced limiter and server-validated anti-bot checks. Same-origin checks alone do not authenticate callers.

OpenAI recommends separating untrusted input from developer instructions, constraining outputs and combining safeguards. These reduce risks but do not make model behaviour infallible. [Safety guidance](https://developers.openai.com/api/docs/guides/agent-builder-safety).

For harmful-content screening beyond a small local rule list, the separate `omni-moderation-latest` endpoint is free. It classifies harm categories, not prompt-injection resistance or every rude word. Adding it requires a clear input/output policy and error handling, not merely forwarding every flagged result. [Moderation documentation](https://developers.openai.com/api/docs/guides/moderation).

Use `store: false` and keep app history in the current browser session for this version. This is not Zero Data Retention: default API abuse-monitoring logs can still retain customer content for up to 30 days. Avoid collecting sensitive personal information, and do not call the chat private or permanently unrecorded. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

## Check before handoff

Try a familiar drink, a new direction, multi-turn refinement, no-match constraints, unavailable stock, an unknown drink name, an instruction-override request, a long message, a timeout and a reached spend limit. Check three off-topic turns, a drink request that interrupts that streak, closure after reload, and failed final-turn retries. Verify that neither the browser nor logs expose the key. Check image/name navigation, size-drawer confirmation and cancellation without navigation or another API request, repeated-add quantities, cart persistence and unavailable stock. Check composer, keyboard, scroll, reply chips and reduced-motion loading at a narrow mobile width.
