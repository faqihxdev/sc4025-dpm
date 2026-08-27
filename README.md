# sc4025-dpm

Functional MVP source code for the SC4025 Digital Product Management Starbucks
group project.

Research, product planning, design artefacts, the report, and presentation files
belong in the team's
[shared Google Drive](https://drive.google.com/drive/folders/11N0HGz20NhOL_8pGfok2di_DfiXejzLh).
Do not duplicate them here.

## Repository structure

```text
.
|-- .github/                  # Pull-request template and naming checks
|-- AGENTS.md                 # Instructions for coding agents
|-- app/                      # Functional MVP source and setup instructions
|-- tests/                    # Automated and manual software validation
`-- README.md
```

The structure is intentionally stack-neutral. Add framework-specific files only
after the team agrees on the MVP and technology choice.

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

Enable the repository's commit-message template after cloning:

```text
git config commit.template .gitmessage
```

Examples:

```text
faqih/docs-local-setup
siwen/feat-group-order-flow
docs: document local development setup
feat: add separate payment to group order
```

## After cloning

1. Run `git config commit.template .gitmessage`.
2. Read `app/README.md` for the current stack and setup instructions.
3. Create a correctly named branch before making a focused change.
