# Find My Drink

SC4025 Digital Product Management group project. A Starbucks-inspired web
prototype with guided drink discovery, optional AI chat and a size-aware demo cart.

[Live demo](https://starbucks.utf.sh/) · [App setup](app/README.md) ·
[Product requirements](docs/drink-finder-prd.md)

## Start locally

Use Node.js 24 and npm. After accepting the private repository invitation:

```sh
git clone https://github.com/faqihxdev/sc4025-dpm.git
cd sc4025-dpm
git config commit.template .gitmessage
cd app
npm ci
npm run dev -- --strictPort
```

Open [127.0.0.1:4177](http://127.0.0.1:4177/). Browsing, guided recommendations
and the cart need no credentials. See [app/README.md](app/README.md) for optional
chat setup, tests and deployment. Real OpenAI calls use the key owner's credits.

If a private HTTPS clone fails, confirm that you accepted the invitation with
the correct GitHub account. With GitHub CLI installed, configure Git access:

```sh
gh auth login --hostname github.com
gh auth setup-git --hostname github.com
```

## Repository structure

```text
.
|-- .github/                  # Pull-request template and naming checks
|-- AGENTS.md                 # Instructions for coding agents
|-- app/                      # React/TypeScript MVP, local data and tests
|-- docs/                     # Requirements, architecture and reference notes
|-- tests/                    # Automated and manual software validation
`-- README.md
```

The app uses React, TypeScript, Vite and Tailwind CSS. Cloudflare Pages hosts
the frontend and server-side chat/analytics Functions. Secrets stay outside Git
and browser assets. Broader research, design files, the report and slides are
maintained separately.

## Development scope

- Implement the agreed MVP and keep the main user flow demonstrable.
- Document installation, configuration, test, build, and demo commands in
  `app/README.md`.
- Add proportionate tests for business rules and critical flows.
- Keep secrets, generated output, course documents, and participant data out of
  Git.
- Use example environment-variable names instead of committing credentials.

## Contributing

- Branch: `<name>/<type>-<lowercase-kebab-description>`
- PR title and commit subject: `<type>: <short description>`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- GitHub Actions blocks invalid branch names and PR titles. Commit-subject
  findings are advisory so shared history does not need to be rewritten.
- Keep each pull request focused on one reviewable outcome.
- In the PR description, explain what changed, why, and how it was validated.
- Preserve shared history; do not rewrite pushed commits merely to rename them.

Examples:

```text
faqih/docs-local-setup
siwen/feat-group-order-flow
docs: document local development setup
feat: add separate payment to group order
```

Before working, update your local `main` and create a named branch:

```sh
git switch main
git pull --ff-only
git switch -c yourname/feat-short-description
```

Run the relevant checks before committing. Push your branch and open a pull
request against `main`. A Cloudflare deployment is separate from a Git push.
