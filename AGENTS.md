# Agent instructions

## Read first

Read the root `README.md` before making changes. It defines the course outcome,
repository boundaries, evidence standard, and Git workflow.

## Project context

This is the SC4025 Starbucks product-blueprint project. The repository must tell
one traceable story:

```text
evidence -> validated problem -> product decision -> design -> functional MVP -> validation
```

Do not treat an attractive feature idea as validated merely because it is easy to
build. Mark assumptions explicitly and preserve contrary evidence.

## Repository boundaries

- `research/`: source-backed user, market, competitor, and literature findings.
- `docs/`: problem framing, PRD, roadmap, metrics, design, GTM, governance, and
  report-ready material.
- `app/`: only the functional MVP and the files needed to run it.
- `tests/`: automated tests, manual test cases, and usability-validation notes.

Keep generated files, temporary exports, credentials, and identifiable research
participant data out of the repository.

## Evidence and writing

- Never fabricate interviews, survey responses, citations, statistics, app
  behaviour, or test results.
- Record the source URL or document, access date, relevant finding, and product
  implication for external evidence.
- Distinguish observed facts from interpretation and from untested hypotheses.
- Use concise, report-ready language and keep terminology consistent.
- Update `docs/contributions.md` when a task produces a meaningful deliverable.

## Implementation

- Implement only the agreed MVP scope and keep the main user flow demonstrable.
- Match the current product documentation and flag contradictions before coding.
- Add proportionate tests for business rules and critical flows.
- Document setup, configuration, test, and demo commands in `app/README.md`.
- Do not commit secrets; provide example environment-variable names instead.

## Git workflow

For any task that creates or changes a branch, commit, or pull request, follow
the naming rules in the root `README.md` **Contributing** section.

Keep changes focused and reviewable. Preserve shared history; do not rewrite
pushed commits solely to silence naming warnings.
