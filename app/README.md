# Find My Drink

Starbucks-inspired student prototype built with React, TypeScript, Vite and
Tailwind CSS. Browse drinks, answer preferences, chat for recommendations and
choose sizes for a demo cart.

Live demo: [starbucks.utf.sh](https://starbucks.utf.sh/).

## Local setup

Use Node.js 24 and npm. The package requires Node.js 22.12 or newer.
From the repository root:

```sh
cd app
npm ci
npm run dev -- --strictPort
```

Open [127.0.0.1:4177](http://127.0.0.1:4177/). The menu, guided finder and cart
work without credentials. AI chat requires the optional backend below.
Local and preview hosts do not collect analytics.

## Optional AI chat

1. Create `.env` in the repository root, beside `.env.example`, not inside `app/`.
2. Add your own key as `OPENAI_API_KEY=sk-your-project-key`.
3. From `app/`, start the backend:

   ```sh
   npm run build
   npm run dev:api
   ```

4. In another terminal, from `app/`, start the frontend:

   ```sh
   npm run dev -- --port 4178 --strictPort
   ```

Open [127.0.0.1:4178/#/chat](http://127.0.0.1:4178/#/chat).
Vite forwards `/api` requests to Wrangler on port 8788. The startup helper copies
only `OPENAI_API_KEY` into ignored `app/.dev.vars`. Restart the backend after
changing the key. Chat uses real OpenAI credits and does not simulate replies
when the backend is unavailable.

Never commit `.env` or `.dev.vars`, add a `VITE_` prefix to the key, or put it in
frontend code. The parent `.env` is not a browser configuration file. Cloudflare
login is needed for deployment, not the basic frontend setup.

## Checks

Run these commands from `app/`:

```sh
npm test                  # Unit tests, including mocked API handlers
npm run test:env          # Secret-loader tests with temporary fixtures
npm run typecheck
npm run build
npm run check:size        # Project budgets, not hosting limits
```

For browser tests, stop any dev server on port 4177 first:

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright starts the production preview on port 4177. It can reuse an existing
server, so an old dev server or stale build can give misleading results.
The browser suite mocks or blocks model and telemetry requests.
On a minimal Linux host, use `npx playwright install --with-deps chromium`.

With both local chat servers running, `npm run test:api-local` checks the proxy
and origin guards without making a model request.

`npm run check:size` exits with a failure when a budget is exceeded. The last
recorded release exceeded the 90 KB JavaScript and 10 KB CSS gzip targets.
Check the current output and record any accepted exception before deployment.

## Feedback preview

Open [4177/?feedback=preview#/menu](http://127.0.0.1:4177/?feedback=preview#/menu)
to test the complete feedback drawer. Use port 4178 when running the chat setup.
Refresh for a neutral vote. Preview uses memory only, sends no analytics and
does not change saved votes, cart or chat.

## Deployment

Only deploy when the team intends to update production. Git pushes and local
edits do not publish the site automatically. Cloudflare uses the existing Pages
project `starbucks-drink-finder`; run from `app/`:

```sh
npx --yes wrangler@4.146.0 login
npm test
npm run build
npm run check:size
npm run test:e2e
npx --yes wrangler@4.146.0 pages deploy dist --project-name starbucks-drink-finder --branch main
```

Resolve or explicitly review failed checks before running the deploy command.
Use a committed, reviewed build for a team release. Wrangler's `--branch main`
selects the Pages production environment; it does not merge a Git branch.
Deploy through Wrangler from `app/` so it compiles the adjacent `functions/`.
Dashboard folder uploads do not compile that backend.

Production secrets are server-side Pages bindings. `OPENAI_API_KEY` enables chat;
`POSTHOG_PROJECT_KEY` enables feedback delivery and analytics. Existing secrets
survive deployments. For initial OpenAI setup or rotation only, run
`node scripts/deploy-chat-secret.mjs` after configuring the root `.env` and
confirming the Cloudflare account. This command changes the production secret.
Do not put production keys in the static build or commit them.

## Code and reference

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Menu, preferences, drink details, cart and routes |
| `src/domain/` | Catalogue, sizes, filters and ranking |
| `src/chat/` | Conversation UI, API contract and session state |
| `src/analytics/`, `src/feedback/` | Explicit events, voting and prompt persistence |
| `functions/api/` | Server-only chat and analytics endpoints |
| `src/components/` | Shared sheets, size controls, icons and images |
| `e2e/` | Browser flow, layout and accessibility checks |

- [Product requirements](../docs/drink-finder-prd.md)
- [Cup sizes and demo prices](../docs/drink-sizes.md)
- [Chat architecture](../docs/chat-cloudflare-architecture.md)
- [Demo story and safety](../docs/chat-demo-and-safety.md)
- [Analytics and privacy](../docs/analytics-options.md)
- [Detailed implementation and release notes](../docs/app-implementation-and-release-notes.md)
- [Software test evidence](../tests/README.md)

## Demo boundaries

Prices, availability and order history are fixtures. There are no real orders,
payments or Starbucks accounts. Chat can send messages to OpenAI. On production,
optional feedback and usage events go through `/api/events` to PostHog. Misuse
closures can include up to three recent user messages with best-effort redaction.
Usage opt-out, Do Not Track and Global Privacy Control stop collection.
Do not enter sensitive information. Rate limits are in-memory demo safeguards,
not a global spending cap. Product photos and the logo belong to Starbucks;
commercial reuse permissions are not established.
