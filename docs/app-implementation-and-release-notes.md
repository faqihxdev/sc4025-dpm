# App implementation and release notes

Implementation details and historical release checks, recorded through 4 October
2026. For current installation and development commands, use the
[app setup guide](../app/README.md). Code paths below are relative to `app/`
unless stated otherwise. Historical build sizes and deployment IDs describe
their named releases, not a fresh verification of the current site.

Mobile-only web prototype for the Starbucks Singapore goal-based drink finder.
React, TypeScript, Vite and Tailwind CSS. Matching, prepared stock and the cart
run locally. Optional conversational discovery uses a Cloudflare Pages Function
and OpenAI. There is no Starbucks account connection or full-transcript database.
Misuse-closed chat excerpts can be logged privately in PostHog as described below.

## Run locally

Use Node.js 24 LTS and npm. From this directory:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:4177/. No credentials or environment variables are needed.

```powershell
npm test             # Catalogue, ranking and session tests
npm run typecheck
npm run build        # Production files in dist/
npm run check:size   # Compressed code and photo budgets
npm run preview     # Inspect the production build on port 4177
npm run test:e2e     # Isolated Chromium browser tests
```

Install the test browser once with `npx playwright install chromium`. Browser
test artefacts are ignored by Git.

## Drink chat

The fourth goal card opens **Help me choose**, a continuous conversation with
short replies, suggested answers and up to two catalogue drink cards. Discovery
normally offers two close matches, best first, unless one is requested or only
one fits. The image and name open the recipe; Add to order below the name opens
a size drawer. Tall starts selected; the customer confirms a size and price
before anything enters the cart, without leaving chat. Closing discards the draft.
The assistant freely writes contextual quick replies
after recommendations or other active replies, keeping labels short. Conversation
and preferences stay in the same browser tab. The assistant can look up a fictional
demo profile through a server-side tool when useful. There is no history toggle
or connected customer account. Reset clears conversation, preferences and the
turn counter. The UI allows 20 user submissions, independently of the rolling
12-message context. Failed submissions count once; retries do not add a turn.
After a terminal reply or the limit, the composer becomes a Reset chat action.

Save `OPENAI_API_KEY=your-project-key` in `codebase/.env`, one directory above
`app/`. Git ignores this file. Never prefix the key with `VITE_` or put it in
frontend code. From `app/`, build once and start the local Function:

```powershell
npm run build
npm run dev:api
```

In a second terminal, run `npm run dev -- --port 4178 --strictPort`, then open
[drink chat](http://127.0.0.1:4178/#/chat). Vite proxies `/api/chat` to the Function
on port 8788. The startup helper copies only this key into ignored `app/.dev.vars`
for Wrangler's server binding. It never prints the key. Restart the Function
after changing the key. Missing credentials
produce an unavailable message, never a simulated AI answer.

The endpoint uses `gpt-6-luna` with medium reasoning, strict structured output,
bounded conversation history and two allowlisted tools: read-only order history
and conversation closure. The model chooses when to use them; a turn allows at
most two provider requests. Closure follows three consecutive off-topic requests
or clear unsafe, abusive or security misuse. Ordinary drink questions, greetings
and feedback stay relevant. It validates drink IDs, prepared stock and hard
preferences. Basic misuse checks and per-process limits are best-effort, not a
complete injection firewall or public abuse defence. The dedicated OpenAI project
has a $5 monthly hard limit. Slight enforcement overshoot is possible.

Chat and analytics invoke their respective Functions. Menu rendering remains
client-side, and chat code loads on demand. Chat is deployed to production as of 3 October 2026. See
[architecture and setup](chat-cloudflare-architecture.md) and
[demo story and safety](chat-demo-and-safety.md).

### Chat motion, allowance and size update

Deployment `a4f1d870` gives incoming turns a short reveal
and smooth readable scrolling. Scrolling up while a reply is pending stops
automatic following. Suggested replies share their clicked button with the sent
bubble through native View Transitions. Reduced motion and unsupported browsers
send directly; restored history does not replay entrance animations. Double taps
and resets during a pending snapshot cannot create duplicate or stale turns.

HTTP 429 shows a `Retry-After` countdown and disables sending/retrying until
it expires. Expiry never sends automatically. The deployed Function permits
30 customer inference requests per IP per minute and reserves up to 1,000,000
estimated tokens per running isolate per minute. History counts as one customer
request; both provider rounds reserve input and output tokens. Denied calls get
the actual remaining cooldown. Shared network IPs share the request allowance,
and visitors in the same isolate share the token bucket. This is separate from
the unchanged 20-submission conversation limit and is not a global spend cap.
Provider project spending settings are unchanged. This replaces the earlier
12-provider-call / 60,000-token guards.

Chat's Add to order opens the compact size drawer before adding. Cards still
show the Tall base price. Selecting a size previews its price; confirming uses
the same stock, quantity and drink-size merging rules as the existing cart.

The empty chat's greeting and vertical sample replies sit bottom-right above
the composer for thumb reach. Long or enlarged opening content stays scrollable.
Once a message is sent, the transcript keeps its normal top-aligned layout.

## Deployment

Live at [starbucks.utf.sh](https://starbucks.utf.sh/). The latest production update
was published on 4 October 2026 through Wrangler to the existing Direct Upload
project `starbucks-drink-finder`, production branch `main`.
The fallback hostname is [starbucks-drink-finder.pages.dev](https://starbucks-drink-finder.pages.dev/).
Cloudflare serves the static client over HTTPS and `/api/chat` and `/api/events`
through Pages Functions. Provider keys are encrypted production secrets, not browser assets.
No paid Cloudflare upgrade or DNS changes were made for this update.

The dedicated proxied CNAME `starbucks.utf.sh` points to
`starbucks-drink-finder.pages.dev`. The existing wildcard and other subdomain
records stay unchanged, so those sites remain on their current servers.

To publish an update from `app/`:

```powershell
npm run build
npm run check:size
npx --yes wrangler@4.146.0 pages deploy dist --project-name starbucks-drink-finder --branch main --commit-dirty=true
```

`wrangler.jsonc` pins the project, output directory and compatibility date.
For initial production-key setup or rotation, run
`node scripts/deploy-chat-secret.mjs` before deploying. It reads only
`OPENAI_API_KEY` from the ignored parent `.env`, sends it to Wrangler through
stdin and never prints its value. Existing production secrets survive deployments.

If CLI authentication expires, run `npx wrangler login` and approve access in
your browser. Do not put OAuth tokens in the app or repository. Deploy from
`app/` with Wrangler so it compiles the sibling `functions/` directory; dashboard
folder/ZIP upload does not compile that backend. Upload only `dist/` as static
assets, not source files, dependencies or test results. Local edits do not update
the live site automatically.

The earlier deployment `a4f1d870` published the bottom-right chat opening, shared reply
motion, countdown handling, more generous chat allowance and chat size picker.
It retains cup sizes, cart editing, banner and image-loading improvements.
That release served the verified build `index-BEo6714I.js` and
`index-BlFyzFaZ.css`. Live response headers give code, media and fonts one year
of immutable browser caching; HTML remains revalidated. No DNS records changed
for this update.

Both hostnames passed HTTPS checks. Mobile and desktop smoke tests verified size
selection, cart editing, merging, focus and refresh persistence. One real chat
request returned two valid catalogue picks; malformed input and foreign-origin
requests were rejected. Demo-level in-memory limits were raised as requested; no durable
anti-bot or authentication layer was added. See `../tests/README.md`.

That build passed, but its size check flagged JavaScript at about
92.7 KB gzip and CSS at 10.3 KB, above the unchanged 90/10 KB project targets.
Media and font budgets pass. These targets are not Cloudflare deployment limits.

## Implemented flow

Browse/search the menu, or tap a goal to go straight to coffee, sweetness and milk
preferences. Coffee boost also offers an optional temperature choice.
Refreshing uses iced recipes; Warm and comforting uses hot recipes.
Review up to three explained picks,
open a recipe, choose a size, then add it to the demo cart. Edit answers, change cart
quantities or return to normal browsing at any point.

Menu, picks and cart summaries show milk only when dairy or oatmilk is listed.
Drink details omit the milk row for recipes with no milk listed. The explicit
milk preference, ingredient evidence and AI ingredient answers remain unchanged.

Selected temperature, coffee exclusion and milk are hard requirements.
Strict options with no available goal-matching recipe are disabled, with an
explanation. Neutral choices remain usable, and sweetness only ranks recipes.
Coffee boost omits No coffee and clears that contradiction in saved answers.
The finder clears retired budget values and corrects hidden temperature values
on load and update. Changing from a temperature-led goal to Coffee boost starts
with Either; reselecting Coffee boost retains an explicit temperature choice.
Other saved choices and later stock changes retain explicit alternatives or
no-match recovery, never silently relaxed filters.

Goal cards stay neutral whenever the chooser opens. Tapping one selects the goal
and advances immediately; returning does not discard optional preferences.
Answers, cart and simulated stock survive refreshes in the same tab. Demo
settings changes prepared availability and resets the demo. Blocked storage
falls back to the current in-memory session.

## Design and data boundaries

- Phone-width screens are edge-to-edge. Wider screens show an iPhone 15 Pro-inspired
  frame with a 393 × 852 screen. The shell and Dynamic Island are visual approximations.
  The complete frame scales down to fit the window without outer scrolling.
- Singapore app screenshots informed the green/white ordering layout, pickup
  strip and navigation. The self-hosted Manrope variable font is a readable substitute,
  not Starbucks' proprietary font. Its SIL Open Font License is in `public/fonts/OFL.txt`.
- Lucide outline icons use consistent sizes and strokes. Buttons, choices, route
  transitions, sheets and cart feedback have short animations, disabled for reduced motion.
  Native View Transitions move the selected goal label into its banner and back,
  and a drink's name and photo from menu, picks or cart into its details.
  Photos retain their circular crop through the motion and on the detail page.
  A named circular frame contains a separately scaled/centred source image, so
  excess background is hidden without altering the original product photo.
  Returning restores the originating list position. Unsupported browsers and
  reduced-motion users get direct navigation.
- The finder shares its goal banner across preferences and results, with no progress
  chrome or repeated price notices. Short content centres vertically; longer content
  starts at the top and scrolls. Only selected preference choices show a tick. The preferences
  action stays above navigation, and compact result cards keep explanations, prices
  and actions together. Scrollbars are hidden; scrolling is retained.
- Preferences omit explanatory subtext and budget controls. When a choice is
  unavailable, its notice appears below the options and clear action. Ingredient,
  nutrition and allergy caveats remain in the drink details.
- Preference headings have outline icons. Search uses a matching clear control,
  while empty cart and search states group the message with a clear recovery action.
- The menu banner uses a cream surface and transparent botanical three-drink
  composition, adapted from the supplied visual reference, on the left,
  with the heading, supporting lines and Try it now action sharing one center
  in the right-hand column, shifted 8 px left for optical edge clearance.
  Find My Drink introduces
  the feature, with We'll help you find your perfect drink as supporting copy.
  The grouped copy is vertically centered, and a 4 px artwork inset keeps the
  leaves inside the rounded banner. A reserved text column prevents artwork
  overlap at 320 and 375 px while
  retaining the standard 188 px banner height and a 44 px touch target.
  Optimized 200/400 px artwork retains its organic silhouette instead of a
  circular crop. Copy and controls remain HTML. The built-in image edit prompt,
  source hash and compression settings are recorded in the image manifest.
  Regenerate only the banner with `npm run images:prepare -- --banner-only`;
  the original source PNG and other product photos remain unchanged.
- Twenty-four named Singapore recipes span coffee, tea, Refreshers, chocolate
  and Frappuccinos. Local 240/560-pixel WebPs use official regional photos and
  five illustrative Singapore-photo edits with nutrition badges removed.
  Source mappings and edit prompts are in `public/images/manifest.json`;
  edited source PNGs are in `assets/image-edits/`.
  Regional photos do not establish an identical Singapore recipe.
  Responsive selection and deferred offscreen loading keep initial requests small.
- Menu entry preloads only the responsive banner in HTML, before React starts.
  Direct finder, cart and drink links do not request that unused image.
  An already loaded thumbnail stays visible while its detail photo downloads,
  with the same circular crop and shared-element motion. No other full-size
  photos are prefetched. Thumbnail loads do not cause component rerenders.
- Production media URLs include a content digest. Identical bytes reuse the
  same URL; changed bytes get a new URL. The build emits one copy of each media
  file, and the font preload and stylesheet use the same fingerprinted font.
  Development keeps canonical public paths. Source provenance records retain
  those canonical paths, rather than deployment-specific filenames.
- Prices, per-recipe size options, goal tags and outlet stock are demo fixtures.
  Discovery and chat cards show Tall prices. Chat Add to order opens a size
  drawer with Tall initially selected. Details offer Tall, Grande and Venti,
  plus Short for hot recipes. Size selection updates the displayed price and
  cart; different sizes of the same drink stay separate. Existing saved carts
  migrate to Tall. Each cart line has an Edit action for size changes in a bottom
  drawer. Saving retains quantity and merges matching drink-size pairs; closing
  discards the draft. Merges above 99 and unavailable recipes cannot be saved.
  The [size policy](drink-sizes.md) records the price
  adjustments and source-backed general cup capacities.
  Public recipe descriptions and nutrition retain source URLs and evidence notes.
  Nutrition is sourced from product-page tables, never from photos.
- Sugar per 100 mL is a rough ranking guide, not a taste guarantee. No coffee
  does not mean caffeine-free. Milk labels do not certify allergen safety.
- This is an independent student concept. No payment, live order, real store
  integration, accounts or general recipe customisation. Optional chat sends
  messages, preferences and, when requested by the assistant, fictional demo
  orders to OpenAI. Do not enter
  sensitive information. `store:false` is not a Zero Data Retention guarantee.
- Photos and logo belong to Starbucks. Public availability is not permission to
  redistribute them commercially; reuse permissions remain unverified.

## Feedback and analytics

### Feedback trigger revision, 4 October 2026

Automatic feedback is scheduled four seconds after a confirmed add from Find My
Drink quick choices or chat. It can open on drink details or chat without a cart
visit. Ordinary menu adds, cart visits, quantity changes and size edits do not
schedule it. Later adds do not restart the first qualifying add's timer.

The invitation waits while the cart, goal chooser, preferences or another drawer
is open, the tab is hidden, a text field has focus, or chat is preparing a reply.
Manual feedback cancels a pending invitation. Saved-vote, session, seven-day
dismissal cooldown, privacy opt-out and preview rules are unchanged. Deployment
`8007ad18` published this trigger revision on 4 October 2026.

Verification passed build/typecheck, 538 unit tests, the 37-case focused
feedback suite and the full 185-case browser suite. Automatic detail/chat
drawers were visually reviewed at 375px. All telemetry/model APIs were mocked
or blocked during browser tests.

### Feedback UI revision

Deployment `fbd79a7d`, published on 3 October 2026, replaces the small banner with a direct voting drawer after
the existing four-second confirmed-add trigger, once the visitor reaches a safe
screen. The question is "Would you use Find My Drink?", with No on the left and
Yes on the right. An acknowledged vote closes the drawer, then shows a six-second
thank-you notification with Add a comment and a shrinking time bar. The countdown
pauses on hover, keyboard focus, hidden tabs or another open drawer. Add a comment
opens only the comment form. Manual feedback still allows changing a saved vote
or adding a comment. Closing an unanswered automatic drawer applies the existing
seven-day cooldown. Manually opening feedback also prevents another prompt in
the same tab. Voting still saves only after acknowledgement.

To inspect it again without clearing a vote, cart or chat, open
[the local feedback preview](http://127.0.0.1:4178/?feedback=preview#/menu).
The explicit `?feedback=preview` query opens a neutral drawer on load. Votes and
comments are simulated in memory; it sends no analytics and changes no feedback
storage or opt-out preference. Refresh to start neutral again. Remove the query
to return to normal behavior. The same safe preview is available on the
[live app](https://starbucks.utf.sh/?feedback=preview#/menu).

Browser requests use the app's own `/api/events` endpoint; Cloudflare forwards
validated events to PostHog. There is no vendor browser SDK or direct request to
a PostHog domain. This reduces common domain-based blocking, but custom rules can
still block the endpoint. Preview success does not verify analytics delivery.
Usage opt-out, DNT and GPC remain respected; there is no alternate tracking route.

The published build is 100.9 KB gzipped JavaScript and 11.9 KB CSS, above the unchanged
90/10 KB targets. Feedback drawers and the notification load on demand. Photos,
illustration and font remain within their budgets.

### Current production release

Deployment `8007ad18`, published on 4 October 2026, publishes the Find My Drink
feedback trigger described above. Wrangler compiled the Functions and uploaded
four changed static assets, reusing 61. The custom, canonical Pages and immutable
release hostnames returned HTTPS 200; HTML and all nine JS/CSS files matched the
tested local build by SHA-256. Entry code is `index-B1jLOE-0.js`, chat code is
`DrinkChat-wXbTvXv4.js`, and the main stylesheet is unchanged `index-CqMLolU3.css`.
HTML remains revalidated; versioned assets retain one-year immutable caching.

Mobile 375px and desktop 1440px live checks confirmed feedback at four seconds
after quick-choice and chat size-confirmed adds, while still on details or chat.
No cart visit was needed. Frame positions remained stable with no overflow or
runtime errors. Browser telemetry was intercepted and no model request ran.
Build/typecheck, 538 unit tests and all 185 browser cases passed before
publication. DNS, secrets, PostHog data/configuration, billing and Git history
were unchanged.

The previous deployment `04488876`, published on 4 October 2026, removes the no-milk phrase
from menu, picks and cart summaries and omits that recipe's Milk detail row.
Dairy, oatmilk and unknown-recipe labels remain, as do filters, catalogue facts,
AI answers, sizes and prices. The custom, canonical Pages and immutable release
hostnames returned HTTPS 200; HTML and its referenced `index-6Nf8uDfR.js`,
`jsx-runtime-DLNB9Qsn.js` and unchanged `index-CqMLolU3.css` matched the final
local files by SHA-256. Build/typecheck, all 538 unit tests and six focused
browser checks passed before publication. The 375px menu, drink details and
cart were also visually checked. No inference or analytics probe was sent,
and DNS, secrets, PostHog data/configuration and billing were unchanged.

The previous feedback deployment `fbd79a7d`, published on 3 October 2026, added
the direct feedback drawer and timed comment invitation described above.
Both public hostnames and its immutable preview served `index-4F48HacY.js` and
`index-CqMLolU3.css` at that release.
HTTPS checks matched the HTML, main JS/CSS and `FeedbackThanks-IZe5o9lt.css`
byte-for-byte with that release's local build. No inference or telemetry probe was
sent for this deployment, and no DNS, secrets, billing or PostHog configuration
was changed by the deployment. Local verification passed 538 unit tests and all
169 browser cases before the final notification-only CSS refinement; the final
build then passed all 27 focused feedback/browser cases and five visual cases.

The earlier deployment `b4963c84` introduced feedback and analytics. The private
[Starbucks dashboard](https://us.posthog.com/project/167986/dashboard/2166239)
contains feedback, usage, country/referral and closed-chat review tables.

The deployed app uses explicit PostHog events through `/api/events`, not a browser
SDK or recording script. Optional Yes/No feedback and notes are available in About.
The voting drawer may open four seconds after a confirmed Find My Drink add,
on drink details or chat. It waits during cart review and other active tasks.
Votes prevent repeat prompts; dismissal gives a seven-day cooldown that survives
refresh, new tabs and demo resets. Usage opt-out, DNT and GPC stop collection.

Misuse-closed chats can send the last three user messages for private review,
with obvious contacts, links and secrets redacted. Ordinary chats and message-limit
excerpts are not collected. Redaction is best effort. See the
[implementation and dashboard record](analytics-options.md).

Production needs the encrypted Pages secret `POSTHOG_PROJECT_KEY`. Local and
preview hosts never collect. `ANALYTICS_TEST_MODE=1` validates local endpoint
requests without forwarding, even if a key is present. Do not enable it in production.

Published release size warnings are 100.9 KB gzipped JavaScript and 11.9 KB CSS against
the unchanged 90/10 KB targets. Photos, illustration and font budgets pass.
Feedback UI and its CSS load on demand. These targets are not hosting limits.

## Code map

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Menu, finder, recipe, cart and hash navigation |
| `src/domain/` | Shared typed catalogue, filters, ranking and rule tests |
| `src/session.ts` | Validated same-tab state and storage fallback |
| `src/chat/` | Conversation UI, validated history and API contract |
| `src/analytics/` | Bounded explicit events, privacy controls and flow tracking |
| `src/feedback/` | Optional voting, notes and persistent prompt cooldown |
| `functions/api/chat.ts` | Server-only OpenAI request and catalogue checks |
| `functions/api/events.ts` | Same-origin PostHog forwarding and country-only attribution |
| `functions/analytics/` | Event allowlist, excerpt redaction and endpoint tests |
| `src/components/` | SVG icons, image recovery and accessible sheets |
| `src/styles.css` | Ordering UI, mobile viewport and desktop phone frame |
| `src/assets.ts` | Canonical source paths to versioned production media URLs |
| `public/images/manifest.json` | Photo sources, hashes and QA notes |
| `scripts/prepare-images.mjs` | Optimize photos and verify source hashes |
| `scripts/check-size.mjs` | Build-size regression check |
| `scripts/static-assets.ts` | Content-versioned media, font and HTML build references |
| `public/_headers` | Deployed Cloudflare caching policy |
| `e2e/` | Critical browser-flow and layout tests |

Local budgets: 90 KB gzipped JavaScript, 10 KB gzipped CSS, 250 KB for all
drink WebPs combined and 35 KB for WOFF2 fonts. These are project targets,
not field-performance scores. Images and the font are bundled locally, without
third-party runtime requests. User testing and problem validation remain separate
from software checks.
