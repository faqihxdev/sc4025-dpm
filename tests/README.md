# Software verification

## Run checks

From `app/`, after `npm ci`:

```sh
npm test
npm run test:env
npm run build
npm run check:size
npx playwright install chromium
npm run test:e2e
```

Stop other servers on port 4177 before browser tests. Playwright starts the
production preview, but reuses an existing server if present. Browser tests mock
or block model and telemetry requests. Size-budget failures are separate from
build failures. See the [app setup guide](../app/README.md) for local API setup.

## Setup verification, 2026-10-20

A clean temporary copy of the candidate Git files passed `npm ci` with Node.js
24.15.0 and npm 11.12.1. It contained no `.env`, `.dev.vars` or copied dependencies.

- Typecheck and production build passed.
- All 538 unit tests, two environment-helper tests and 185 browser tests passed.
- No real model or telemetry request was needed.
- Size check failed the existing code budgets: 101.1 KB JavaScript gzip versus
  90 KB, and 11.9 KB CSS gzip versus 10 KB. Photos, illustration and font passed.

## Historical verification records

The dated sections below record results for their specific builds. Test counts,
asset names and sizes are historical evidence, not a fresh test of the checkout.

### Baseline, 2 October 2026

| Check | Observed result |
| --- | --- |
| `npm test` | 140 tests passed: 19 matching/catalogue, 61 preference-option, 56 session and 4 asset-versioning cases |
| `npm run build` | TypeScript and production build passed |
| `npm run test:e2e` | 73 Playwright checks passed: 62 existing flows, 6 preload, 4 image-loading and 1 build/cache-policy case |
| `npm run check:size` | 85.0 KB gzip JS, 7.5 KB gzip CSS, 249.7 KB drink/banner WebPs, 24.8 KB local font |
| `npm audit --omit=dev` | No reported production-dependency vulnerabilities |
| `git diff --check` | Passed |

## Acceptance coverage

| Requirement | Software evidence |
| --- | --- |
| AC01, AC08 | Browse, search, categories, finder, details, same-recipe cart and quantity totals |
| AC02, AC03 | Strict filters, goal-derived temperature, retired-budget migration, option gating, unknown required attributes, goal/sugar ranking, stable ties and max three picks |
| AC04 | Explicit unmet-goal alternatives, coffee-extract exclusion and attribute-based explanations |
| AC05, AC06 | Edit one answer while retaining others; zero, one and two-result recovery |
| AC07 | Stock changes after selection disable Add; unavailable cart lines cannot increase |
| AC09 | Refresh restoration, reset, malformed data, unknown IDs and blocked storage |

The browser suite runs the complete flow at 320×740, 390×844, 768×1024,
1440×1000 and 844×390. It checks positive detail-content space and no page-wide
horizontal overflow. Phone screens are full width; tablet/desktop frames are
centred and at most 430 px wide, with a 393 × 852 logical inner screen. Desktop
fit checks at 1440×900, 1280×720, 1024×600, 844×390 and 600×600 verify that the
complete phone and caption fit without outer scrolling. An in-place resize retains
the route and inner scroll position.

Other checks cover neutral goal cards after back navigation and refresh, retained
optional answers, one-tap goal selection without Continue, persistent preferences
actions, compact results without repeated headings, keyboard dialog
focus/Escape/restoration, brief opacity/transform motion, reduced motion,
missing-image recovery, invalid routes and local-only runtime asset requests.
Short goal, single-result and empty-cart screens centre vertically; overflowing
content stays top-aligned and scrollable. Unselected choices contain no tick or
reserved tick space, and all sweetness choices fit one row at 375 px.

Native goal-transition checks at 375 and 1280 px verify forward/reverse movement,
selected-only snapshots and safe repeat navigation. Paired drink-name/photo motion
is checked from menu, picks and cart into details and back, retaining circular
photo crops, with restored list scroll,
no unrelated snapshots, and final shared-name cleanup. Reduced-motion and missing-API
cases use direct navigation. Captures in `app/test-results/design-*`
cover core screens, empty states, fitted frames and mid-transition movement.
They verify the loaded Manrope font, zero-count hiding, nonzero cart badges and
44 px touch targets. Screenshot review covers icons, alignment and readability.

All 24 recipe images load locally and match their categories. Circular frames
clip separately scaled/centred photos, with per-photo framing where needed.
The full Chocolate Chip cup remains visible. The three-drink banner is ready
before capture. At 320 and 375 px, its artwork is on the left and its action has
a verified 44 px touch target. Independent visual
review covers all 24 settled detail images at 320, 375 and 1440 px.
The updated banner and neutral goal chooser also pass visual review at 320×740,
375×844, 1440×900 and 844×390, with no artwork/text overlap or outer overflow.
The local Find My Drink heading, balanced two-line supporting copy and
Try it now action fit the same 188 px banner height. At 320 and 375 px,
the artwork does not overlap text, the title/body gap is 6 px,
the body/action gap is 16 px and the action retains its 44 px target.
The paragraph has a 4 px visual lift without moving the heading or button.
Heading, both visible body lines and button share the right-column center,
8 px left of the right-half column's geometric center. The heading keeps at
least 12 px clear of the right border at 320 and 375 px. The copy stack has
balanced top/bottom space; a 4 px
artwork inset keeps leaves inside the banner. Tests check actual text-line
rectangles, not just the paragraph container. Revised alignment captures are
in `app/.performance-audit/banner-alignment/`.
The reference-inspired cream banner uses transparent botanical artwork rather
than a circular crop. Optimized 200/400 px files retain genuine alpha; exact
preload and rendered-image sizes match. Their combined 21,706 bytes keep all
50 WebPs within the 250,000-byte budget. The original source and 49 other image
assets are unchanged. Four-size visual captures are retained separately in
`app/.performance-audit/banner-designer/`.
Production deployment `1b8420a3` now includes this banner and its loading changes.

Goal-aware preferences omit No coffee for Coffee boost, including contradictory saved
answers. Impossible strict choices are disabled against the current goal, other filters
and stock. Neutral and sweetness choices stay usable; saved mismatches and later stock
changes retain honest recovery. Preference legend icons, centered custom search clearing,
keyboard activation, input refocus and preserved category selection are covered.

Each goal shows three preference groups without helper paragraphs or budget controls.
Refreshing uses iced recipes and Warm and comforting uses hot recipes; only Coffee boost
shows a temperature choice. Saved budgets and opposite inferred temperatures are corrected.
Entering Coffee boost from another goal resets temperature to Either; reselecting Coffee
boost preserves its explicit temperature. The unavailable-options notice follows Clear
optional preferences and remains associated with disabled choices. Independent visual
review passed at 320, 375 and 1440 px and in the fitted 844×390 landscape frame.

Drawer regressions sample 32 animation frames at 375 and 1440 px, with the main
content at scroll offsets 0 and 220. Hidden ancestor scroll positions and background
bounds must remain unchanged while the sheet opens. The drawer still scrolls
independently without a visible scrollbar. Initial autofocus uses `preventScroll`
so the translated close button does not scroll the hidden phone container.

## Public deployment checks

Wrangler published production deployment `1b8420a3-a8ff-44a2-9d83-65c07a8db3ed`
on branch `main` at approximately 19:05 SGT on 2 October 2026. The custom domain
and Pages fallback both serve `index-DYnv34lt.js` and `index-BcBcwVU7.css`.
Fresh-browser smoke checks passed on each hostname at 375×812 with DPR 2 and
1440×900 with DPR 1. The current banner, finder, preferences, results, Cold Brew
details and cart passed with normal TLS verification. Each fresh context requested
exactly one responsive hero asset: the full 400 px image on mobile DPR 2 and the
small 200 px image on desktop DPR 1. There were no console/page errors, failed
requests, HTTP error responses or outer page overflow. The update changed no DNS.

On 2 October 2026, both `https://starbucks-drink-finder.pages.dev/` and
`https://starbucks.utf.sh/` returned HTTP 200 with the deployed production bundle.
Cloudflare reports the custom domain Active with SSL enabled. The custom-domain
browser check used normal certificate verification and negotiated TLS 1.3.

Independent public-build smoke tests at 375×812 and 1440×1000 loaded all 24 photos
and Manrope without failed requests, HTTP errors or page errors. Menu, neutral
goal selection, simplified preferences, picks, details, cart and refresh
restoration passed. Goal-specific temperature behavior and mobile/desktop
overflow checks passed. A separate 375px custom-domain check passed the same
finder-to-cart flow and retained the selected drink after refresh.

## Original image performance diagnosis

On 2 October, three-run medians in isolated, unthrottled Chromium at 375 px:

| Timing | Public fresh browser | Public repeat visit | Local fresh browser |
| --- | ---: | ---: | ---: |
| Banner request discovered | 1,869 ms | 383 ms | 119 ms |
| Banner response complete | 2,173 ms | 383 ms | 126 ms |
| Detail photo ready after click | 371 ms | 34 ms | 74 ms |

The banner is 3,948 bytes and the first thumbnail 1,578 bytes. Their bodies
downloaded in about 1–2 ms; image decode took about 2 ms. Initial discovery waits
on JS/CSS and React rendering. Network response waiting dominates the remainder.
Public assets returned REVALIDATED and a 14,400-second browser cache lifetime;
repeat image transfers were zero bytes. These results do not establish that an
empty Cloudflare cache caused the delay.

A browser-only responsive-banner-preload probe moved median request completion
to 1,500 ms and observed lab LCP from 2,196 to 1,980 ms. Rendering still waits
on JS/CSS. These are historical timings for the original deployed build.

The connection used Cloudflare's FRA edge, not Singapore field users. DPR 2/3
already select the larger menu photo and avoid that detail upgrade.

## Deployed performance improvements

The deployed build preloads one matching responsive menu banner before JavaScript
renders the app. Tests hold the actual JavaScript response and verify the image
request still starts at DPR 1 and 2, with exactly one selected request.
Direct goal, preferences, detail and cart links avoid this unused preload.

The detail page retains an already loaded thumbnail while its larger photo is
held back. It then displays the full photo without changing the circular crop,
shared transition name or accessible primary image. Error fallback, direct
detail entry without an unseen thumbnail and no unrelated full-photo prefetch
are covered. Thumbnail load events no longer cause component rerenders.

All production photos, logo and font have content-digest filenames. Build tests
recompute every media digest, verify one copy of each asset, and check that the
font preload and stylesheet use the same URL. Cloudflare `_headers` rules cache
versioned media and code for one year, while HTML remains revalidated. On 2 October,
live response checks confirmed these headers on both public hostnames. HTML
returned `public, max-age=0, must-revalidate`; JS, CSS, banner and font returned
`public, max-age=31536000, immutable`. Their response-body SHA-256 hashes matched
the corresponding local build files, and HTML referenced the latest JS/CSS/banner.

The rerunnable controlled comparison is in ignored
`app/.performance-audit/performance-latency-compare.mjs`. The baseline and reports
are protected from Playwright output cleanup. It applies the same fixed HTML,
JavaScript, CSS, image and font delays to each build, using three fresh contexts
per DPR. These lab results do not predict Singapore field Core Web Vitals.

Final controlled medians on 2 October:

| Timing | Before, DPR 1 | After, DPR 1 | Before, DPR 2 | After, DPR 2 |
| --- | ---: | ---: | ---: | ---: |
| Banner request discovered | 906 ms | 74 ms | 887 ms | 80 ms |
| Banner response complete | 1,069 ms | 240 ms | 1,054 ms | 252 ms |
| Observed lab LCP | 1,092 ms | 900 ms | 1,076 ms | 896 ms |

Fixed delays were 50 ms for HTML, 700 ms for JavaScript, 150 ms for CSS/images
and 80 ms for the font. All six final samples used one responsive banner request,
had no failed requests and completed the banner before JavaScript. Image bytes
were unchanged in that comparison, which used the earlier circular banner art.
The current botanical banner is 6,114/15,592 bytes; preload and single-request
behaviour were reverified with browser tests. Final comparison data is in
`performance-latency-after.json` beside the
comparison script. These controlled timings are historical local comparisons,
not measurements of the current botanical banner on the public site. Separate
live response checks confirmed the deployed Cloudflare header behaviour.

These are software checks, not evidence of user demand, business uplift, a full
accessibility audit or real-device performance. Firefox, WebKit, screen readers
and real devices remain unverified. Bundle budgets are engineering targets, not
Core Web Vitals scores. Comparative user testing remains pending.

## Local conversation checks, 3 October 2026

The local chat uses a server-only OpenAI key, `gpt-6-luna`, medium reasoning and
a dedicated $5 hard-limited project. No chat deployment has been made.

- 199 unit tests passed, including 47 endpoint/policy tests and 12 chat-session
  cases. Provider tests use fake fetch responses and do not consume credits.
- 75 Chromium browser tests passed. The two chat tests block all external and
  unmocked API requests, and cover the fourth card, multi-turn preferences,
  suggested replies, recipe/back, refresh, sample history, reset and error retry.
- Wrangler successfully compiled the Pages Function. Two environment-helper
  tests passed. `npm run test:api-local` verifies the actual Vite-to-Function
  proxy accepts local origins and rejects foreign origins, with no AI calls.
- A small real API/browser smoke check demonstrated sample iced-coffee history,
  a new tea recommendation and iced/no-coffee follow-up. This is functional
  evidence, not evidence of recommendation quality across all possible queries.
- The key and secret files were absent from the client build. Both root `.env`
  and `app/.dev.vars` are ignored. Current code budgets pass at 89.5 KB gzipped
  total JavaScript and 9.2 KB CSS. The 3.3 KB chat chunk loads only when opened.
- Chat visuals were inspected at 320, 375 and 1440 px. The existing phone frame
  fits short landscape windows by scaling, which can make its controls small.
  Portrait mobile and ordinary desktop remain the intended demo views.

The short local setup copies only `OPENAI_API_KEY` from `codebase/.env` into
ignored `app/.dev.vars`. Wrangler's parent `--env-file` did not bind the key
to Pages Functions. The local proxy also rewrites the verified same-origin
development Origin with its target Host. Public origin checks remain unchanged.

## Local size-selection checks, 3 October 2026

- 362 unit tests passed across eight files. These include the shared size quotes,
  recipe-and-size cart identity, totals, legacy-cart migration and mocked chat
  catalogue metadata. No real API calls were made for this update.
- Typecheck and production build passed. All 36 selected Chromium checks passed:
  13 new size cases and 23 affected finder, preference, cart and chat regressions.
  This was a targeted run, not a rerun of the entire browser suite.
- Hot recipes offer Short, Tall, Grande and Venti; iced recipes omit Short.
  Prices and the sticky Add action update together. Distinct sizes remain separate
  in the cart, reopening retains their size, and old carts restore as Tall.
  Changing size preserves scroll, survives refresh and does not add browser-Back
  steps. Recipe-level stock still blocks every size.
- Native image/title transitions pass with two sizes of the same recipe. Keyboard
  focus rings clear the header and fixed Add bar at 320 and 375 px, desktop,
  landscape and enlarged text. Visual review found no clipped labels or controls.
  Captures are in `app/.performance-audit/sizes-final-tests/`.
- CSS, photos, illustration and font budgets pass. JavaScript is 90,632 bytes
  gzip: 632 bytes over the unchanged 90,000-byte budget. The size check therefore
  remains failing for JavaScript; no budget was raised to hide the regression.
- Price differences and per-recipe size availability are demo fixtures, documented
  in [Drink sizes](../docs/drink-sizes.md). Nutrition is not extrapolated from cup
  capacity. These local changes have not been deployed.

## Local cart size-edit checks, 3 October 2026

- All 375 unit tests, typecheck and production build passed. The new pure edit
  helper preserves quantities and input objects, keeps destination ordering,
  accepts an exact-99 merge and rejects overflow or unsupported sizes unchanged.
- All 33 selected Chromium checks passed: 12 cart-edit cases, all 13 size cases
  and eight affected finder/cart/chat/dialog regressions. This was a targeted run.
  The new tests block external and unmocked API requests.
- Edit opens an in-place bottom drawer. Draft prices update without modifying the
  cart; Update order retains the item's whole quantity, recalculates totals and
  persists through refresh. Matching destination sizes merge with focus restored
  to the resulting Edit button. Closing by X, Escape or scrim discards the draft
  and preserves background scroll. The sheet becomes inert during dismissal so
  an immediate pointer click on Update cannot save a cancelled edit.
- The fixed confirmation remains reachable at 320 and 375 px, desktop,
  landscape and enlarged text. Touch targets, reduced motion, focus trapping and
  the unchanged details size selector pass. Visual captures are in
  `app/.performance-audit/cart-edit-final-tests/`.
- Current compressed assets total 91,473 bytes of JavaScript and 10,121 bytes of
  CSS. Both exceed the unchanged code budgets; photo, illustration and font
  budgets pass. No dependencies, additional image assets or real API calls were
  added in that local test run. Deployment checks follow below.

## Production deployment checks, 3 October 2026

- Wrangler 4.146.0 compiled and deployed the Pages Function and static assets
  to the existing `starbucks-drink-finder` project on branch `main`.
  Deployment: `422371dd`. No DNS changes or paid Cloudflare upgrade were made.
- Fresh preflight: 375 unit tests across eight files and two environment-helper
  tests passed, along with typecheck, production build and `git diff --check`.
  The code-size warnings above remain; no budget was raised.
- `starbucks.utf.sh`, the production `pages.dev` hostname and the deployment URL
  returned HTTPS 200 with `index-B-feQIMk.js` and `index-BPWD4n_9.css`. HTML
  requires revalidation; the checked fingerprinted JS has one-year immutable caching.
- The OpenAI key was installed as an encrypted production secret before deploy.
  An in-memory scan of all 62 client-build files found no key value or secret file.
  No preview-environment secret was configured.
- Live `/api/chat` returned 405 for GET, 400 for malformed input and 403 for a
  foreign Origin. One real provider-backed request returned HTTP 200 in about
  3.6 seconds, with two valid iced-coffee catalogue picks and concise quick replies.
  This consumed a real API request; it is a smoke test, not a model-quality benchmark.
- Isolated Chromium smoke checks passed at 375 × 812 and 1440 × 900. They covered
  the menu, four goals, idle chat, size selection and refresh, distinct cart sizes,
  Edit-drawer saving, merge quantities/totals, restored focus and refresh persistence.
  There were no runtime/console errors, failed requests, HTTP error responses or
  horizontal overflow. Those browser checks made no API requests or remote writes.
- Captures and reports are in ignored
  `app/.performance-audit/cart-size-live-1790996830112/`. The mobile drawer and
  final merged cart were visually reviewed. Production retains the documented
  demo-level in-memory limits, with no durable limiter, authentication or anti-bot
  layer. Cross-browser and real-device checks remain unverified.

## Local chat motion and cooldown checks, 3 October 2026

- Reproduced reply snapping through the actual UI with a held mocked response:
  response completion called `scrollTo` with `behavior: 'instant'`. The same loop
  now observes smooth scrolling and the newest assistant's reveal animation.
- All 375 unit tests, typecheck and production build passed. All 31 selected
  Chromium checks in `chat.spec.ts` and `chat-motion.spec.ts` passed. This was a
  targeted chat run, not the full browser suite. Model requests were mocked and
  external traffic blocked, so these checks consumed no provider credits.
- The 13 new motion/cooldown cases cover readable long replies, interrupted
  following, shared chip-to-bubble snapshots on mobile/scaled desktop, reduced
  motion, unsupported browsers, repeated labels, stable history nodes after
  context trimming, manual retry after cooldown and native-transition races.
  Double clicks send once; reset before snapshot commit makes no request and
  cannot resurrect the discarded message.
- The real goal-to-chat navigation path exposed a route-animation replay after
  the chip transition ended. Toggling the route's animation off and back on
  restarted `route-forward`, causing the whole-page slide. Removing that chat
  override keeps the route still while preserving the shared button motion.
  The new navigation-path regression went red, then green after the CSS fix.
  Keyboard-sent bubbles now use the same green focus ring as the other controls.
- Fixed-clock mocked endpoint checks reproduced the existing per-isolate token
  throttle. Six compact ordinary calls fit the 60,000-token window; a seventh
  returned 429. Two two-round history turns succeeded before the next turn was
  blocked. A new IP did not bypass the shared bucket. OpenAI 429 mapped to 503.
  No limiter threshold, server secret, model or billing setting was changed.
- Independent visual review covered 320, 375 and 1440 px, landscape, enlarged
  text and reduced motion. The shell stayed stationary, reply chips wrapped
  without overlap and old turns did not replay entrance animations. Captures are
  in `app/.performance-audit/chat-motion-visual-1791000359276/`; browser regression
  artifacts are in `app/.performance-audit/chat-motion-final-tests/`.
- Code-size checks still flag about 92.5 KB JavaScript and 10.3 KB CSS gzip,
  above the unchanged 90/10 KB targets. Photos, illustration and font pass.
  No dependency or image asset was added. These checks preceded deployment `a4f1d870`.

## Local chat allowance and size-picker checks, 3 October 2026

- The Function now allows 30 customer inference requests per IP per minute and
  reserves up to 1,000,000 estimated tokens per running isolate per minute.
  First-round dispatch counts the customer request; a history follow-up reserves
  tokens without counting another customer message. Provider, conversation and
  spending settings are unchanged. Shared-IP and per-isolate limits still apply.
- All 380 unit tests passed, including 153 chat policy cases. New mocked checks
  cover a full 20-submission conversation, 30 ordinary or history-based requests,
  shared token exhaustion, second-round reservation and remaining cooldowns.
  Overlapping windows use the longer remaining wait. No real provider request
  or secret access was required.
- All nine focused chat size-picker browser cases passed. Tall is only a draft
  until confirmation; Grande/Venti and hot-only Short use shared size prices.
  Cancel, Escape and scrim leave the cart unchanged. Confirmation merges only
  identical drink-size pairs, preserves the chat and composer draft, restores
  the originating Add button's focus, and makes no additional API request.
  Duplicate confirmation adds once; a 99-quantity size cannot be added again.
- Independent visual review covered 375px, fitted desktop/landscape frames,
  reduced motion and 200% text. The actual goal-to-chat path produced 0px
  background movement through opening and closing. Chat scroll was unchanged
  after cancel and confirmation. All keyboard focus stayed inside the drawer.
  Hot drinks at 200% text initially exposed label overflow; two regressions went
  red before the shared size controls were changed to wrap into two columns.
  Rechecks at 320px and 375px found no overflow or clipped labels.
- The final targeted Chromium run passed all 65 cases across chat, chat motion,
  chat size picking, drink sizes and cart editing. Typecheck, production build
  and the two environment-helper tests also passed. Model traffic was mocked
  or blocked. This was not a full browser-suite or real-model evaluation.
- An existing pending-phrase test failed intermittently because CSS reflected
  a motion-preference change before React registered the timer. The test now
  waits for React's remount before advancing its fake clock. The exact test
  passed 30 repeated two-worker runs; no application fix was needed.
- The new picker adds no dependency or image asset; it reuses
  the cart editor's controls. A small shared CSS correction supports larger text.
  Captures are in `app/.performance-audit/chat-size-picker-final-tests/` and
  `app/.performance-audit/chat-add-size-visual-1791001446210/`.
  Final browser artifacts are in
  `app/.performance-audit/chat-size-allowance-final-tests/`. Code-size checks
  still warn at 92.7 KB JS and 10.3 KB CSS gzip against unchanged 90/10 KB targets;
  photos, illustration and font remain within budget.
  These checks preceded deployment `a4f1d870`.

## Local bottom-right chat opening, 3 October 2026

- The greeting and three vertical reply buttons sit bottom-right above the
  composer. At 375px, the last button leaves 20px clearance above the composer.
  Large text and short viewports collapse the spare space without hiding the
  greeting or choices. The conversation itself remains top-aligned.
- All 37 targeted chat, motion and opening-layout browser tests passed with
  mocked or blocked API traffic. Six new checks cover narrow phones, fitted
  desktop/landscape frames, enlarged text, first-send behaviour and reset.
  Typecheck and build passed. Visual captures are in
  `app/.performance-audit/chat-opening-reach-qa/`; final browser artifacts are in
  `app/.performance-audit/chat-bottom-right-combined-tests/`.
  This local layout trial was later published in deployment `a4f1d870`.

## Chat update production checks, 3 October 2026

- Published deployment `a4f1d870` to the existing Cloudflare Pages project on
  branch `main`. It includes the bottom-right opening, chat size drawer,
  reply motion and revised request allowance. Existing secrets, model,
  billing settings and DNS were unchanged.
- Fresh preflight passed 380 unit tests, two environment-helper tests,
  typecheck, production build and 71 targeted Chromium cases. This was not
  the full browser suite. These tests made no paid provider calls.
- All three public hosts returned HTTPS 200 with `index-BEo6714I.js` and
  `index-BlFyzFaZ.css`. HTML requires revalidation; both checked fingerprinted
  assets have one-year immutable caching.
- Live API guards returned 405 for GET, 400 for malformed input and 403 for
  a foreign Origin. One real provider-backed request returned HTTP 200 in
  2.75 seconds, two valid iced-coffee picks and two quick replies. This was
  a connection smoke test, not a model-quality benchmark.
- Live Chromium checks passed at 375 × 812 and 1440 × 900. Opening choices
  sit bottom-right, the composer stays visible, and Add opens a Tall-first
  size drawer. Cancel adds nothing; Grande confirmation uses S$9.15.
  Chat, draft, internal scroll and originating focus survived. No overflow,
  console errors, HTTP errors or API calls occurred in these browser checks.
- An initial desktop capture suggested frame clipping. Instrumented source
  and live rechecks did not reproduce it: outer scroll stayed at zero and
  the frame position stayed fixed through focus and drawer interactions.
  Reports and screenshots are in
  `app/.performance-audit/release-live-a4f1d870/`.
- Known code-size warnings remain at 92.7 KB JS and 10.3 KB CSS gzip against
  unchanged 90/10 KB targets. Photos, illustration and font pass. Cross-browser
  and physical-device checks remain unverified.

## Feedback and analytics release, 3 October 2026

### Feedback UI follow-up, published in `fbd79a7d`

- No now precedes Yes in DOM and visual order. The question names Find My Drink.
  The automatic four-second confirmed-add trigger opens the complete drawer at
  the next safe screen, without a small banner or another Feedback tap. A saved
  vote closes the drawer, then shows a six-second floating thank-you with Add a
  comment and a shrinking bar. The action opens only the comment form.
  Countdown pauses cover hover, focus, hidden tabs and other open drawers.
- Closing an unanswered automatic drawer by Close, Escape or scrim applies the
  seven-day cooldown. Acknowledged votes stop future automatic requests. Manual
  feedback opening marks the question seen for the tab, preventing a queued
  add-trigger from reopening it immediately after dismissal.
- `?feedback=preview` opens neutral despite a saved vote, including on localhost.
  It simulates voting/comments without UUID generation, feedback writes or any
  analytics events. Browser checks preserve saved feedback, cart, preferences,
  stock, chat, opt-out and prompt state across interaction and reload. Preview
  never clears real state, and DNT/opt-out behavior in normal mode is unchanged.
- The About gap regression went red at 0 px on the previous build. The scoped
  copyright spacing now measures 20 px. This simple layout issue was checked at
  the actual dialog boundary rather than through a broader diagnostic loop.
- Typecheck, production build, 538 unit tests and all 169 browser cases passed
  before the final notification-only large-text CSS refinement. The focused
  feedback cases cover acknowledgement-only success, pending-close suppression,
  comment-only focus and the timed invitation. API/model calls were mocked or
  blocked. Published size warnings are 100.9 KB JS and 11.9 KB CSS gzip, above unchanged
  90/10 KB targets. Photos, illustration and font budgets pass.
- Independent screenshots checked 375px, fitted desktop and landscape frames,
  reduced motion and 200% text. The app/frame and scroll remain stationary and
  all content stays reachable. A synchronous preview-send focus regression went
  red with BODY active after two animation frames. Restoration now also handles
  the same focused control becoming disabled before the browser blurs it. The
  rebuilt regression and all five visual cases pass with unassisted Escape and
  no API requests. Evidence is in `app/.performance-audit/feedback-revision-audit/`.
- The new notification was reviewed independently at normal and 200% text.
  Enlarged text initially squeezed into a narrow column; a wrapping layout now
  places the message above the right-aligned action. Final screenshots and
  geometry checks confirm the larger layout stays inside the phone, preserves
  the stationary app/frame and changes no real preview storage.
  All 27 focused feedback/browser cases passed again on the final build,
  including the new 320px and 375px enlarged-text regressions.

### Feedback UI production verification

- Wrangler 4.146.0 published deployment `fbd79a7d` to the existing
  `starbucks-drink-finder` project on `main` on 3 October 2026. It compiled and
  uploaded the Pages Functions along with 65 static assets, nine changed and
  56 reused. The production routes include `/api/chat` and `/api/events`.
- `starbucks.utf.sh`, `starbucks-drink-finder.pages.dev` and the immutable
  `fbd79a7d.starbucks-drink-finder.pages.dev` hostname returned HTTPS 200.
  HTML, `index-4F48HacY.js`, `index-CqMLolU3.css` and
  `FeedbackThanks-IZe5o9lt.css` matched the final local files by SHA-256 on all
  three hosts. HTML remains revalidated; these versioned assets have one-year
  immutable caching.
- No DNS, secrets, billing, OpenAI or PostHog configuration changed during
  deployment. Verification fetched static files only, with no paid model call
  or telemetry probe. The existing analytics transport was not re-probed.
- The final CSS-only refinement follows the full 538-unit and 169-browser
  verification above. The final build passed the 27 focused feedback/browser
  cases and all five visual cases. The 100.9 KB JS / 11.9 KB CSS warnings remain
  above unchanged 90/10 KB targets; media and font budgets still pass.

### Initial analytics production release verification

- Deployment `b4963c84` adds explicit first-party analytics, optional Yes/No feedback,
  a seven-day dismissal cooldown and private misuse-closed chat excerpts. It keeps
  the existing chat, size picker and cart flows. The existing PostHog project now
  has an app-filtered dashboard; other apps and billing settings were preserved.
- Typecheck, production build, 521 unit tests and two environment-helper tests pass.
  Earlier runs covered the complete 153-case browser suite in two batches, with
  mocked or blocked provider traffic. The final ten-case feedback/analytics run
  passes, including a new response-ID failure regression. Together these cover
  all 154 current browser cases, but the final run was targeted, not a fresh full run.
- Feedback waits for acknowledgement before saving the vote. Failed delivery and
  UUID generation allow deliberate retry, never leave controls stuck, and do not
  save an unacknowledged vote. Optional comments, textarea focus, Escape, closing
  during a request, refresh, new tabs, reset and dismissal cooldown were checked.
  Disabling a focused send control had moved focus to body; the drawer now restores
  it only if the visitor has not moved focus elsewhere.
- Ordering remains usable under analytics opt-out and Do Not Track. Cancelled
  size picking does not complete a flow. A misuse closure sends only the last three
  user messages once; normal replies and turn-limit closures send no excerpt.
  Tests intercept both API routes, so browser QA sends no real user or model data.
- All three production hosts returned HTTPS 200 and `index-BzDLlK81.js`.
  Live endpoint guards rejected wrong methods, malformed batches and foreign
  origins; DNT requests were discarded. Excluded QA batches reached PostHog and
  verified `is_test`, disabled GeoIP/person profiles, fixed `0.0.0.0` IP placeholders
  and redaction of known email, phone and labelled-secret fixtures. No paid model
  request was made for this release. AI classifications are not abuse ground truth.
- All 11 dashboard query sources returned successfully. Ratings use the latest
  answer per versioned response ID, funnels group ordered steps by flow, and test
  events are excluded. Chat review is private and excludes turn-limit excerpts.
  A 30-day query window is not a retention policy or automatic deletion mechanism.
- Known code-size warnings remain at 99.1 KB JS and 11.2 KB CSS gzip against the
  unchanged 90/10 KB targets. Photos, illustration and font pass. No PostHog SDK,
  session replay or automatic capture was added. Physical-device and cross-browser
  checks remain unverified.

## Milk summary copy release, 4 October 2026

- The shared menu, picks and cart metadata omits milk when the recipe has
  `milk=none`. Its drink detail page also omits the Milk recipe row. Dairy,
  oatmilk and unknown labels remain unchanged, along with catalogue facts,
  filters, AI ingredient answers, serving sizes and prices.
- Build/typecheck, all 538 unit tests and six focused browser checks passed
  before deployment. The 375px menu, drink details and cart were visually
  checked. This was a focused browser run, not another full browser suite.
- Wrangler 4.146.0 published deployment `04488876` to the existing
  `starbucks-drink-finder` project on `main`. It compiled and uploaded the
  Functions and intended `/api/chat` and `/api/events` routes, with four changed
  static assets and 61 reused. Preflight confirmed that the verified build was
  newer than the source and Functions and contained no credential filenames.
- `starbucks.utf.sh`, `starbucks-drink-finder.pages.dev` and the immutable
  `04488876.starbucks-drink-finder.pages.dev` hostname returned HTTPS 200.
  HTML and every referenced JS/CSS file, `index-6Nf8uDfR.js`,
  `jsx-runtime-DLNB9Qsn.js` and `index-CqMLolU3.css`, matched the local build by
  SHA-256 on all three hosts. HTML requires revalidation; checked versioned
  assets keep one-year immutable caching.
- Verification fetched static files only. No paid model call or analytics
  probe was sent. DNS, secrets, PostHog data/configuration, billing and Git
  history were unchanged. The existing code-size warnings remain recorded;
  no budget was raised or source/dependency changed during deployment.

## Find My Drink feedback trigger, 4 October 2026, local verification

- Confirmed quick-choice and chat adds schedule feedback at four seconds.
  The drawer can open on drink details or chat; the cart is not a prerequisite
  and never displays the automatic invitation. Normal menu/cart-origin adds,
  cart visits, quantity changes, size edits, cancelled size selection and refused
  adds do not schedule it. Later adds preserve the first qualifying deadline.
- The invitation waits for visible tabs, closed drawers, unfocused text inputs
  and completed chat replies. Chat busy reporting includes the suggested chip's
  pre-commit transition. Manual feedback cancels a pending invitation. Saved
  votes, seven-day dismissal cooldown, session suppression, privacy opt-out,
  preview isolation and acknowledged-save behavior remain covered.
- Build/typecheck and all 538 unit tests passed. The 37-case focused feedback
  suite passed, followed by the complete 185-case browser suite in 1.8 minutes.
  Final browser command: `npx playwright test
  --output=test-results-feedback-full --reporter=list`. A persistent local
  preview and isolated output folders avoided the shared-server/artifact
  interference encountered in the initial parallel test attempts.
- Exact-delay checks prove no prompt at 3,900 ms and the prompt decision at
  4,000 ms, then resume the browser clock for the lazy drawer to render. Main
  and test agent reviewed the 375px automatic detail/chat drawers and the
  200% text thank-you notification. Broader browser cases cover mobile,
  landscape, desktop, enlarged text, reduced motion and native transitions.
- APIs and foreign origins were mocked or blocked. No production analytics,
  model request, dashboard mutation or deployment ran during local verification. The existing
  code-size warnings remain: JS 101.1 KB gzip / 90 KB and CSS 11.9 KB / 10 KB.
  Photos, illustration and font budgets pass; no budget was raised.

## Feedback trigger deployment, 4 October 2026

- Wrangler 4.146.0 published `8007ad18` to the existing
  `starbucks-drink-finder` project on production branch `main`. It compiled and
  uploaded the Functions, `_headers` and intended `/api/chat` and `/api/events`
  routes. Four static assets changed; 61 were reused. Preflight checked all 99
  build inputs and Functions for freshness and found no credential/private config files
  or source maps in the 67-file static artifact.
- The custom `starbucks.utf.sh`, canonical `starbucks-drink-finder.pages.dev`
  and immutable `8007ad18.starbucks-drink-finder.pages.dev` hosts returned HTTPS
  200. HTML and all nine JS/CSS files matched the tested build by SHA-256 on all
  three hosts. Entry JS is `index-B1jLOE-0.js`; chat is `DrinkChat-wXbTvXv4.js`.
  HTML SHA-256 is
  `3b236a12c5553467b4efc559b1b8a517595f80f3dd558a76f08d8ad7933c6a1d`.
  HTML is revalidated; every checked versioned asset has one-year immutable
  caching. The static build was not regenerated after its 185-case browser run.
- Four isolated live smoke cases covered quick-choice and chat adds at
  375x812 and 1440x900. Feedback was absent at 3,900 ms and scheduled at
  4,000 ms, on details or chat without visiting the cart. Frame/header positions
  stayed fixed with zero overflow, runtime errors or HTTP errors. Main and test
  agent visually reviewed the captures. Evidence is in
  `app/.performance-audit/release-feedback-trigger/report.json` and four PNGs.
- Ten telemetry envelopes were intercepted and fulfilled locally before
  network I/O. No chat or foreign-origin request ran. No production analytics
  or paid inference probe, DNS change, secret rotation, PostHog mutation,
  billing change or Git-history mutation was performed. Existing size warnings
  remain recorded; no budget was raised.
