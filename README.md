# sc4025-dpm

SC4025 Digital Product Management group project for **Starbucks**. This
repository holds the evidence, product blueprint, design work, and functional
MVP used for the final report and presentation.

## Course outcome

The project should move from a supported customer problem to a functional MVP.
Keep the four course pillars connected:

1. **Discovery & Strategy** - problem framing, user insights, roadmap, and KPIs.
2. **Execution & Design** - PRD, user stories, MVP scope, flows, and wireframes.
3. **Tech Stack** - a working prototype that validates the design choices.
4. **Go-To-Market & Governance** - GTM, pricing, risks, and mitigations.

The final submission must also include a specific individual-contribution
breakdown, the GitHub URL, and a literature review supporting product decisions.
Commit history should make each member's work visible.

## Repository structure

```text
.
|-- AGENTS.md                 # Instructions for coding/research agents
|-- app/                      # Functional MVP and setup instructions
|-- docs/                     # Product blueprint and report-ready material
|   `-- contributions.md      # Required individual contribution tracker
|-- research/                 # User, market, competitor, and literature evidence
|-- tests/                    # Automated and manual validation of key flows
`-- README.md
```

The structure is intentionally stack-neutral. Add framework-specific files only
after the team agrees on the MVP and technology choice.

## Working agreement

- Back every important product decision with user evidence, academic literature,
  industry research, or clearly labelled assumptions.
- Do not invent interview results, metrics, citations, or Starbucks capabilities.
- Record specific outputs in `docs/contributions.md`; avoid vague entries such as
  "research" or "coding."
- Keep secrets and personal participant data out of Git.
- Make the prepared demo reliable, while keeping the MVP behaviour honest and
  reproducible.

## Contributing

- Branch: `<name>/<type>-<lowercase-kebab-description>`
- PR title and commit subject: `<type>: <short description>`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- GitHub Actions blocks invalid branch names and PR titles. Commit-subject
  findings are advisory so shared history does not need to be rewritten.
- Keep each pull request focused on one reviewable outcome.
- In the PR description, state the product decision or requirement addressed,
  evidence used, validation performed, and contribution-tracker entry updated.
- Preserve shared history; do not rewrite pushed commits merely to rename them.

Enable the repository's commit-message template after cloning:

```text
git config commit.template .gitmessage
```

Examples:

```text
faqih/docs-rewards-research
siwen/feat-group-order-flow
docs: compare Starbucks rewards redemption flows
feat: add separate payment to group order
```

## Starting the project

1. Audit the current Starbucks Singapore customer experience.
2. Put source-backed findings in `research/`.
3. Define the selected problem, target user, value proposition, and MVP in
   `docs/`.
4. Record each member's concrete outputs in `docs/contributions.md`.
5. Add the chosen stack and run instructions to `app/README.md` before
   implementation begins.
