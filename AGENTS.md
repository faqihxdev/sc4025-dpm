# Agent instructions

## Read first

Read the root `README.md` and `app/README.md` before making changes. They define
the repository boundary, development workflow, and current stack.

## Project context

This repository contains only the functional MVP implementation for the SC4025
Starbucks project. Research, product planning, design artefacts, contribution
tracking, and submission files live in the team's shared Google Drive. Do not
copy those materials into the repository.

## Repository boundaries

- `app/`: functional MVP source code and the files needed to run it.
- `tests/`: automated tests and technical manual test cases.
- `.github/`: shared pull-request and repository-policy automation.

Keep generated output, temporary exports, credentials, course documents, and
participant data out of the repository.

## Implementation

- Implement only the agreed MVP scope and keep the main user flow demonstrable.
- Treat the shared Drive's agreed requirements and designs as inputs. Flag
  contradictions instead of silently choosing one interpretation.
- Add proportionate tests for business rules and critical flows.
- Document setup, configuration, test, and demo commands in `app/README.md`.
- Do not commit secrets; provide example environment-variable names instead.
- Do not claim a test passed unless it was actually run.

## Git workflow

For any task that creates or changes a branch, commit, or pull request, follow
the naming rules in the root `README.md` **Contributing** section.

Keep changes focused and reviewable. Preserve shared history; do not rewrite
pushed commits solely to silence naming warnings.
