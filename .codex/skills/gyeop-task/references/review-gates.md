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

Each field must begin at the start of a line, appear exactly once, and contain the exact allowed value. Blank reviewer names and `TODO`, `TBD`, or `Not run` are invalid.

## QA gate

Use an independent `verifier` or `test-engineer` context when available.

QA must include:

- `## QA 판정`
- `Status: PASS` or `Status: FAIL`
- P0/P1/P2 findings
- Verification commands and results
- Required fixes

PR creation and merge are blocked by `Status: FAIL` or any P0/P1 finding.

The QA artifact must contain exactly one line-start field for each of `Reviewer Agent`, `Status`, and `P0/P1 Findings`, with a valid reviewer, `PASS`, and `0`. It must also contain exactly one adjacent full-verification block:

```text
- Command: ./scripts/run-ai-verify --mode full
- Result: PASS
```

The task harness fixes the QA artifact contents before each PR or merge full verification, then requires the file to be byte-for-byte unchanged and the QA gate to still pass afterward.

## PR and completion gate

- The configured GitHub repository must exactly match every fetch and push URL configured for local `origin` at command start and again immediately before delayed remote or GitHub mutation.
- A PR body must start with a line whose complete contents are `Closes #<issue-number>` for the expected issue and contain no other GitHub closing keyword reference. `Fixes`, `Resolves`, prose, negations, fenced or quoted examples, cross-repository references, and duplicate lines are not completion evidence.
- PR creation checks open candidates before full verification and repeats the candidate/repository/remote-head check immediately afterward before push. A rerun may recover exactly one matching open PR; ambiguous, changed, or mismatched candidates fail before local or remote mutation. If ready transition success is uncertain, the PR remains open for the next rerun instead of being closed automatically.
- Merge fixes both `base.sha` and `head.sha` before full verification, checks them again afterward and immediately before the merge call, and passes the expected head SHA to GitHub. GitHub does not accept an expected base SHA in the merge API, so a base update between the final read and write remains a documented API race.
- `close <issue-number> <pr-number>` writes one deterministic completion marker before closing. A rerun uses the marker to avoid duplicate completion comments.
- `cleanup <issue-number> <pr-number>` rejects tracked/untracked changes and ignored paths outside the documented disposable generated allowlist. It snapshots target branch config, moves the exact local branch to a deterministic task-specific quarantine ref that a rerun can recover, rechecks worktree/ref/config state before and after deletion, deletes the quarantine ref with an expected-SHA compare-and-swap, uses an expected-SHA lease for remote deletion, cleans remote-tracking/config state, and treats an already absent remote branch as a safe rerun state.

## GitHub state rule

- REST issue labels are the workflow source of truth.
- GitHub Project is an optional view configured by `GYEOP_GITHUB_PROJECT_NUMBER`.
- Do not claim board status is synchronized when Project configuration or GraphQL-backed commands are unavailable.
- Local full verification and required CI checks must pass before merge.
