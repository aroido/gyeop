# GYEOP Task Review Gates

## Spec reviewer gate

Use an independent `critic` or `architect` context when available.

The review must include:

- `Status: PASS` or `Status: FAIL`
- P0/P1/P2 findings
- Missing SSOT or code references
- Over-scope or under-specified acceptance criteria
- Product-direction questions only when SSOT cannot resolve them

Implementation starts only when P0/P1 findings are zero and the spec records:

- `Status: Reviewed`
- `Reviewer Agent: <name>`
- `Review Status: PASS`
- `P0/P1 Findings: 0`

## QA gate

Use an independent `verifier` or `test-engineer` context when available.

QA must include:

- `## QA 판정`
- `Status: PASS` or `Status: FAIL`
- P0/P1/P2 findings
- Verification commands and results
- Required fixes

PR creation and merge are blocked by `Status: FAIL` or any P0/P1 finding.

## GitHub state rule

- REST issue labels are the workflow source of truth.
- GitHub Project is an optional view configured by `GYEOP_GITHUB_PROJECT_NUMBER`.
- Do not claim board status is synchronized when Project configuration or GraphQL-backed commands are unavailable.
- Local full verification and required CI checks must pass before merge.

