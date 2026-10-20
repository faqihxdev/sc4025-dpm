# Analytics options

Checked 3 October 2026. The initial research proposal below was approved and implemented. The following implementation record supersedes the proposed event names and free-text policy.

## Implemented setup

- Dashboard: [Starbucks | Find My Drink](https://us.posthog.com/project/167986/dashboard/2166239), in the existing project. Other apps and dashboards were preserved. Every tile filters `app=starbucks-drink-finder` and production events. Automated QA is excluded.
- No PostHog SDK, autocapture, replay, heatmaps, person profiles or third-party browser scripts. A small manual-event client sends bounded batches to the first-party Cloudflare `/api/events` Function. It forwards to PostHog's [batch capture API](https://posthog.com/docs/api/capture) with a server-side project token.
- The account's billing page was checked: no card, 1 million product-analytics events per cycle and a 1 million event billing limit. No paid plan or billing setting was changed. Custom feedback uses ordinary events, not managed Surveys.
- Random tab-session IDs, no persistent analytics identity. Collection only runs on `starbucks.utf.sh` and the canonical Pages hostname. Local and preview builds collect nothing. Opt-out, Do Not Track and Global Privacy Control stop collection. First-party delivery is for reliability, not a fallback around an explicit privacy choice.
- `visit_started` has coarse direct/search/social/other referral and mobile/tablet/desktop viewport categories. Cloudflare supplies country only. Visitor IPs, full URLs, city, coordinates, search terms and drink selections are not sent. GeoIP enrichment is disabled and `$ip` is the fixed `0.0.0.0` placeholder, because PostHog replaced a null override with its ingestion connection address in the live QA probe. No UTM collection was added.
- `feature_used` records menu, quick choices and chat. `finder_started`, `recommendations_shown` and `flow_completed` use per-attempt flow IDs. The dashboard counts start, nonempty picks and confirmed demo-cart add in that order. Opening/cancelling a size drawer is not completion; no purchase is measured. Recommendation displays can repeat on navigation, so the funnel groups distinct flows.
- `active_time_120s` accumulates foreground time while there has been interaction in the last 30 seconds. Hidden/idle time pauses it. This measures engagement, not liking.
- `idea_feedback` saves Yes/No to "Would you use Find My Drink?", a clearer label for the same version-1 willingness-to-use question. `feedback_comment` saves an optional note of up to 500 characters. The dashboard takes the latest rating per versioned response ID, so revisions do not create another respondent. Feedback is optional and self-selected, not a representative satisfaction rate.
- Successful voting suppresses future automatic prompts for that question version. Dismissing gives a seven-day cooldown across refresh, tabs and demo resets. Deployment `8007ad18` on 4 October schedules the voting drawer four seconds after a confirmed Find My Drink add from quick choices or chat, without requiring a cart visit. Menu adds, cart visits and cart edits do not schedule it. It waits during cart review, goal/preferences selection, other drawers, hidden tabs, focused text input or an in-flight chat reply. Later adds do not restart the first qualifying timer; manual feedback cancels it. An acknowledged vote closes the drawer and offers Add a comment through a six-second thank-you notification. Manual feedback stays in About. Unsent notes are not saved locally. Blocked storage suppresses automatic prompts.
- At the user's request, `chat_ended` records the AI's reason, user-turn count and conversation ID. Misuse-related closures may also include only the last three user messages, each at most 600 characters. Normal chats and `turn_limit` excerpts are excluded. Obvious contacts, links and secrets are redacted server-side in excerpts and feedback. This is best effort, not a guarantee of anonymity. AI classifications and client events are diagnostic signals, not tamper-proof abuse evidence.
- About explains collection and provides the opt-out. There is no extra chat popup. Do not share the admin dashboard publicly. PostHog retention still applies; a 30-day dashboard filter does not delete older events. No custom short-retention system was configured.
- Batches are capped at 10 events and 12,288 UTF-8 bytes. The server rejects unknown properties, checks origin, uses bounded best-effort per-isolate rate guards and times out forwarding. No retry loop or telemetry failure blocks drink discovery or ordering. Feedback only displays Saved after acknowledgement.

Implemented files: `app/src/analytics/`, `app/src/feedback/`, `app/functions/api/events.ts`, `app/functions/analytics/`, and App/chat integration. `POSTHOG_PROJECT_KEY` was added as an encrypted production Pages secret. No OpenAI secret was changed.

Local build audit after the 4 October feedback trigger revision: total JS 101.1 KB gzip and CSS 11.9 KB, above the unchanged 90/10 KB project targets. Feedback UI/CSS and the thank-you notification are lazy-loaded. Photos, illustration and font budgets pass. The initial analytics deployment was 99.1 KB JS and 11.2 KB CSS. Do not describe these internal byte targets as field-performance scores.

## Release verification

Deployment `fbd79a7d` published the UI refinement on 3 October 2026 through the
existing Cloudflare Pages project and `main` branch. "Would you use Find My Drink?" clarifies
the same version-1 question. No is left and Yes is right. The add-trigger opens
the whole drawer, not a banner. An acknowledged vote closes it and shows a
six-second thank-you notification with a shrinking time bar. Add a comment opens
only the comment form; the countdown pauses during hover, keyboard focus,
hidden tabs or other drawers. Failed votes remain retryable in the voting drawer.
Closing an unanswered automatic drawer gives the existing seven-day cooldown.
Explicit feedback preview simulates answers without analytics or saved-state
changes.

The custom, canonical Pages and immutable release hostnames returned HTTPS 200.
Their HTML, `index-4F48HacY.js`, `index-CqMLolU3.css` and
`FeedbackThanks-IZe5o9lt.css` matched the final local files by SHA-256. HTML is
revalidated; versioned assets retain one-year immutable caching. Wrangler
compiled and uploaded both Functions and the `/api/chat` and `/api/events` routes.
No DNS, secrets, billing or PostHog configuration was changed by this deployment.
No paid inference or telemetry probe was sent for this release.

Local typecheck/build, 538 unit tests and all 169 browser cases passed before
the final notification-only enlarged-text CSS refinement. All 27 focused
feedback/browser cases and five visual cases then passed on the final build.
Model and telemetry requests were mocked or blocked. These checks validate
the UI and preview safety, not fresh analytics delivery. The historical initial
analytics-release verification follows below.

Adblock note: browser traffic uses the first-party `/api/events` route, with
server-side forwarding to PostHog and no browser SDK. Common vendor-domain rules
are less relevant, but custom endpoint rules can still block collection. The
feedback preview simulates success and cannot verify delivery. Privacy opt-out,
DNT and GPC still stop collection; no alternate endpoint is used after a block.
[PostHog's proxy documentation](https://posthog.com/docs/advanced/proxy) explains
the domain-based blocking rationale.

### Initial analytics release

Published Cloudflare Pages deployment `b4963c84` on branch `main` on 3 October 2026. The custom, canonical Pages and immutable release hostnames returned HTTPS 200 with `index-BzDLlK81.js`. Existing DNS, OpenAI settings and other PostHog apps were unchanged.

Typecheck, build, 521 unit tests and two environment-helper tests passed. Earlier browser runs covered all 153 existing cases across two runs; the final focused run passed all ten feedback/analytics cases, including the new UUID-failure retry regression. These tests mock or block model requests and production telemetry.

An excluded `is_test=true` production probe reached PostHog. It confirmed fixed IP placeholders, disabled GeoIP/person profiles and removal of the fixture's email, phone and labelled secret from the stored excerpt. All 11 dashboard sources validated. The review tile excludes tests and message-limit closures. This checks transport and known redaction patterns, not all possible sensitive information or AI judgement quality.

## Original research proposal

## Recommendation

Use PostHog Cloud's free plan for a few explicit events and a small thumbs-up/down feedback prompt. Prioritise whether people like the idea, where visits come from and which flows people use. It supplies the dashboard and funnels. Keep Cloudflare Web Analytics optional for traffic and load-performance checks.

| Option | Useful for this app | Main limitation |
| --- | --- | --- |
| Cloudflare Web Analytics | Free visits, page views and visitor-experienced performance. No cookies, local storage or individual fingerprinting for analytics. | No custom events. It cannot directly measure our completed finder flow or yes/no feedback. |
| PostHog Cloud | Manual events, funnels, conversion time and feedback in one dashboard. | Requires a separate project and a small frontend integration. Default automatic tracking is broader than we need. |

Cloudflare's [overview](https://developers.cloudflare.com/web-analytics/about/) and [privacy description](https://www.cloudflare.com/web-analytics/) describe its traffic/performance scope. Its [FAQ](https://developers.cloudflare.com/web-analytics/faq/) explicitly says custom events are not supported. PostHog's [product analytics page](https://posthog.com/product-analytics) documents manual event capture, funnels and time between steps.

## Free allowance and spend protection

PostHog currently includes 1 million analytics events and 1,500 managed-survey responses per month. The no-card free plan has one project. Usage stops at the free limits; paid plans charge for additional usage. Stay on the no-card plan, or explicitly set relevant product billing limits to US$0 if using an existing paid organization. [PostHog pricing](https://posthog.com/pricing)

Our proposed feedback component can send an ordinary `idea_liked` custom event. It does not need the managed Surveys product. Managed [Surveys](https://posthog.com/docs/surveys/installation) remain an alternative if we later want dashboard-configured questions and event-based targeting.

## Proposed tracking

These are product measurement definitions, not vendor defaults. Record successful state changes, not every click.

| Event | When to record it | Allowed properties |
| --- | --- | --- |
| `visit_started` | First production app use in a tab session. | Coarse `country`, sanitised `referrer_domain`, allowlisted campaign tags |
| `finder_started` | User intentionally starts quick choices or chat. | `source`: `quick_choices` or `chat` |
| `recommendations_shown` | Nonempty, usable recommendations appear. | `source`, small numeric `count` |
| `flow_completed` | Recommended drink is successfully added after size confirmation. Not drawer opening or cancellation. | `source` |
| `active_time_120s` | Two minutes of accumulated visible, recently active app use. Pause while hidden or idle. | No content properties |
| `idea_liked` | User answers "Would you use this to choose a drink?" | `answer`: `yes` or `no`, `source`, `trigger` |
| `feedback_submitted` | User intentionally submits optional written feedback. | Short, explicitly submitted `comment` only |

Keep feedback available through a small persistent entry point. Gently suggest it after the person has actually tried a flow. Two minutes of active time can be an extra eligibility condition, not a reason to prompt someone who left a tab open. Ask "Would you use this to choose a drink?" with thumbs-up Yes and thumbs-down No. Record that vote immediately, then offer "Tell us more" as an optional comment. Allow dismissal. Do not make people answer both willingness to use and "helped choose" for this first revision. Cap comments at 500 characters, label them optional and say "Please don't include personal or sensitive information." Comments can contain personal data despite that hint, so restrict access and define a short retention period.

Prevent repeated nudges with a versioned local feedback-status record, separate from the app's demo/chat state. An answer prevents future automatic prompts for that question version. Dismissal starts a seven-day cooldown. Preserve this across refresh, a new tab, reopening the app and demo resets. Manual Feedback remains available to correct a vote or add a comment, so dashboard reporting must deduplicate or account for revisions rather than counting edits as new respondents. Do not persist unsent comments beyond the current tab. If storage is unavailable, fall back to a quiet per-tab/in-memory prompt state. This local status is not a persistent analytics identity.

The first dashboard needs thumbs-up/down counts and ratio, the submitted comments, visits by country/referral/campaign, flow usage, and an optional start → recommendations → confirmed-add funnel. A confirmed add measures demo task completion, not a real purchase. Count tab sessions, not unique people. Time spent is an engagement signal, not proof that people like the feature. Always report the feedback respondent count; people who choose to answer may differ from those who dismiss it. No response does not mean dislike, and willingness to use does not prove future real-world use.

PostHog's [web analytics dashboard](https://posthog.com/docs/web-analytics/dashboard) supports country, referrer and UTM breakdowns. Defaults collect more detail than our proposal. Its [GeoIP documentation](https://posthog.com/docs/libraries/go#overriding-geoip-properties) lists country, city, coordinates and other location properties. For country-only collection, disable that default enrichment and send only the country code, obtainable in our existing Cloudflare Function from [`request.cf.country`](https://developers.cloudflare.com/workers/runtime-apis/request/). Never copy the rest of the `cf` object or raw request headers. Country is an approximate network-origin signal and may reflect a VPN rather than residence. Referral information may be absent; classify that as direct/unknown rather than guessing. Store only the referring hostname and chosen non-personal campaign tags, not a full URL.

Tag the links shared in WhatsApp, class and QR codes with simple allowed values such as `utm_source=whatsapp`, `class` or `qr`. This gives useful attribution when browser/app referrer data is missing. These source labels describe links, not people.

## Privacy and performance

- Only enable collection on the production hostname. Disable local, preview, QA and bot/test traffic where practical.
- Use a random tab-session ID. Do not identify people, merge sessions across visits or create person profiles. Session-only measurement sacrifices retention and returning-user counts, which we do not need now. PostHog supports [anonymous custom events and funnels](https://posthog.com/docs/data/anonymous-vs-identified-events).
- Send only allowlisted event names and properties above. Written feedback is the sole opt-in free-text exception. Never send chat prompts, AI replies, search text, order history, drink selections, names, emails, IP properties, precise location or full query strings. Do not enable recording, DOM capture, console capture or automatic exception capture.
- If using `posthog-js`, explicitly disable autocapture, page views/page leaves, dead/rage clicks, recording and managed surveys; use session or memory persistence and `person_profiles: 'never'`. Validate outbound payloads because disabled autocapture alone does not disable the SDK's other defaults. The [configuration reference](https://posthog.com/docs/libraries/js/config) documents these controls and `before_send` filtering.
- Keep analytics outside the critical rendering path. Use a small manual-event client or a lazy-loaded minimal SDK, a bounded queue and nonblocking delivery. Do not delay navigation or adding to order if analytics fails. Pin and measure the chosen package before adding it. The app's existing JS budget is already over its 90 KB gzip target.
- Document the collection in the app's About/privacy copy and provide a simple opt-out. Session IDs are pseudonymous, not a guarantee of anonymity. Do not claim that avoiding cookies alone settles consent obligations.

## Implementation scope if approved

One project, a typed tracking helper, a feedback prompt and one dashboard. A small existing-stack Function is optional for country-only attribution and strictly filtered event forwarding; no new database is needed. No replay, heatmaps, user profiles or A/B testing. Verify deduplication, cancellation, idle/hidden time, no unintended sensitive payloads and zero production telemetry from automated tests before deployment.

## Removing other apps' historical data

Checked 3 October 2026 against current official documentation and public source. This section records research only. It does not confirm any deletion or account change.

Project `167986` contains Starbucks dashboard `2166239` and old "My App Dashboard" `416614`. A dashboard is a set of saved reports, not a separate event database. Removing the old dashboard or its insights cleans up reports, not historical events. Deleting an event definition likewise removes taxonomy metadata; its [current API implementation](https://github.com/PostHog/posthog/blob/master/posthog/api/event_definition.py) deletes the `EventDefinition` object, not ClickHouse event rows. Do not describe either action as a data purge. See [dashboard and insight management](https://posthog.com/docs/product-analytics/dashboards#removing-and-deleting-insights).

### Selective event deletion

PostHog documents a [Data Deletion API](https://posthog.com/docs/api/data-deletion-requests) that accepts a HogQL query selecting one event-UUID column. It can therefore select historical events by exact app/domain properties and a fixed time range. The preview endpoint validates the query and returns a count; submitting it creates a deletion request; GET endpoints report its status. It requires a personal API key with `data_deletion:write`, not the public capture key.

Availability matters. The [current API source](https://github.com/PostHog/posthog/blob/master/posthog/api/data_deletion_request.py) requires the `self-service-data-deletion` feature flag. Otherwise it denies access and describes the endpoint as alpha, not publicly available. The [submission code](https://github.com/PostHog/posthog/blob/master/posthog/data_deletion.py) creates a pending request that requires approval and deferred execution. Published API documentation is not proof that this Cloud project has access. No generally available filtered-deletion UI procedure was confirmed from the public docs.

The documented API exposes no restore/undo endpoint. Treat an approved historical purge as permanent, export anything needed first, and ask support to confirm completion and backup handling. Event deletion is asynchronous; accepting a request does not mean the rows are gone. PostHog describes deletion during non-peak periods in its [data storage documentation](https://posthog.com/docs/privacy/data-storage#asynchronous-data-deletion).

### Safe scope for this project

- Inventory the old apps' actual event properties and counts first. Use a positive allowlist of confirmed old app IDs or exact hosts. Do not delete every event missing the Starbucks tag, or use broad URL substring matching.
- Explicitly preserve every event with `app = starbucks-drink-finder`. Our server adds this marker but does not send `$host` or full URLs, so a hostname-only preservation rule is insufficient. Dashboard IDs do not identify which raw events belong to an app.
- Preview the proposed event selection and confirm that it intersects no Starbucks events before approval. Include a fixed cutoff so newly arriving events cannot change the intended historical scope. Verify the selected old events are gone and Starbucks counts remain after completion.
- Do not delete the shared project or organization. Those actions remove all their data, including Starbucks. See [data deletion options](https://posthog.com/docs/privacy/data-storage#data-deletion).

Avoid person-based deletion for this cleanup. `delete_events=true` deletes all earlier events associated with a person's identities, not only one app's events. If identities are shared across apps, this can erase Starbucks too. Anonymous events without person profiles also cannot be reliably cleaned up through a Persons list. See [person deletion](https://posthog.com/docs/privacy/data-storage#right-to-be-forgotten) and [anonymous versus identified events](https://posthog.com/docs/data/anonymous-vs-identified-events).

### Future collection and support

Removing the old apps' instrumentation, or enabling a tested [Drop events transformation](https://posthog.com/docs/cdp/transformations/drop-events), prevents future matching events from being stored. It does not purge already stored events. A dashboard date filter also does not shorten retention.

If this project has no deletion-alpha access, use PostHog's [in-app support ticket](https://app.posthog.com/home#supportModal). Ask for a selective historical event purge in project `167986`, provide the confirmed old app/host filters and date range, and explicitly require preservation of `app = starbucks-drink-finder`. Ask them to confirm the preview count, affected data types, irreversible scope, approval process and completion status. This is the safest supported escalation, not a guarantee that a free-account purge request will be granted. [Official support options](https://posthog.com/docs/support-options#in-app-support).

### Account inspection and partial cleanup, 3 October 2026

The read-only event inventory returned these groups:

| App marker | Host | Stored events |
| --- | --- | ---: |
| unset | `localhost:5173` | 91,958 |
| unset | `conformlabs.com` | 28,598 |
| unset | `conform-9py.pages.dev` | 248 |
| unset | `e7e193ef.conform-9py.pages.dev` | 3 |
| unset | `85d049a9.conform-9py.pages.dev` | 3 |
| `starbucks-drink-finder` | unset | 18 |

The old groups total 120,810 events. Conform still received events on the inspection date. Counts are a snapshot, not a completed purge.

Removed old dashboard `416614` through its recoverable dashboard-delete flow. Left "Delete this dashboard's insights" unchecked. The success notification offered Undo, and the dashboard list then contained only Starbucks dashboard `2166239`. Saved insights and historical event rows were not deleted. Project, organization, credentials and Starbucks data were not changed.

Project Danger zone exposed only Move project and permanent Delete project. No selective historical-deletion UI was found. The user decided to leave all event data unchanged and stop cleanup at the removed old dashboard. Cleared the unsaved Drop Events draft with Clear changes, which removed its host filter and restored the default Drop Events/CHANGE-ME state. Returned to Transformations and verified that no new blocking transformation was created. No events were blocked, no support request was submitted, and no historical event purge was requested or performed.
