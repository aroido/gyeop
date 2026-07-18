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

The task harness fixes the QA artifact contents before checking or reusing the exact-SHA full verification marker, then requires the file to be byte-for-byte unchanged and the QA gate to still pass afterward.

## PR and completion gate

- Before full verification and every delayed push, PR write, ready-for-review write, CI boundary, or merge write, require an open issue with exactly `status:qa` and no `blocked-from:*` label. A failed initial PR gate must run no full verification, push, or GitHub write; a drift before ready-for-review leaves the draft open for a safe rerun.
- The configured GitHub repository must exactly match every fetch and push URL configured for local `origin` at command start and again immediately before delayed remote or GitHub mutation.
- A PR body must start with a line whose complete contents are `Closes #<issue-number>` for the expected issue and contain no other GitHub closing keyword reference. `Fixes`, `Resolves`, prose, negations, fenced or quoted examples, cross-repository references, and duplicate lines are not completion evidence.
- PR creation checks open candidates before full verification and repeats the candidate/repository/remote-head check immediately afterward before push. A rerun may recover exactly one matching open PR; ambiguous, changed, or mismatched candidates fail before local or remote mutation. If ready transition success is uncertain, the PR remains open for the next rerun instead of being closed automatically.
- PR and merge reuse a successful local full verification only for the exact immutable `head.sha`; a missing marker runs the suite once as a safe fallback. Merge fixes both `base.sha` and `head.sha`, checks them again immediately before the merge call, and passes the expected head SHA to GitHub. GitHub does not accept an expected base SHA in the merge API, so a base update between the final read and write remains a documented API race.
- `close <issue-number> <pr-number>` writes one deterministic completion marker before closing. A rerun uses the marker to avoid duplicate completion comments.
- `cleanup <issue-number> <pr-number>` rejects tracked/untracked changes and ignored paths outside the documented disposable generated allowlist. It snapshots target branch config, moves the exact local branch to a deterministic task-specific quarantine ref that a rerun can recover, rechecks worktree/ref/config state before and after deletion, deletes the quarantine ref with an expected-SHA compare-and-swap, uses an expected-SHA lease for remote deletion, cleans remote-tracking/config state, and treats an already absent remote branch as a safe rerun state.
- An already merged PR is the only workflow-state exception: after validating its repository, issue relationship, head SHA, and merge SHA, `merge` may return `alreadyMerged: true` without writes even if the issue is closed. This exception must not restore the branch or bypass evidence checks.

## Status transition gate

- Require exactly one managed `status:*` label on every open workflow issue. Require exactly one `blocked-from:*` label only with `status:blocked`, and require none otherwise.
- Allow only `backlog -> ready -> spec -> implementing -> qa`. Entering `blocked` records the exact source; leaving it may target only that source and must rerun the source gate. `qa` completes only through verified merge and close.
- Recheck issue state and target gates immediately before a label PUT, validate both its response and an immediate GET, and preserve unrelated labels. Never report success after an uncertain response or failed final read.
- A same-state non-blocked request reruns its gate and returns `changed: false` without PUT. A same-state blocked request validates only exact blocked provenance; it does not certify the source artifact.
- `ready` requires all declared predecessors closed. `spec` requires the canonical expected worktree, exact branch/ref/HEAD, and a clean checkout. `implementing` and `qa` also require the reviewed spec from that worktree's absolute path.
- If `start` creates the exact worktree but its status write fails, preserve that partial state and report failure. A rerun must validate and reuse it rather than deleting or overwriting it.
- When Project is configured, run its sync only after the label PUT response and immediate GET confirm the target. Recheck the pinned source and target gates after Project I/O; never roll back the label or report full success when the postflight gate or Project readback fails.

## Resume and reconcile gate

- `resume` accepts only an open issue in exact `ready`, `spec`, `implementing`, `qa`, or valid `blocked`, and rejects any merged PR found across all pages for the same repository/base/head.
- Reuse an existing registered clean task worktree, restore an absent worktree from the exact local ref, or restore it from a pinned commit fetched through the verified origin URL with compare-and-create. Require the canonical target and shared Git common directory to match.
- Snapshot issue state, origin configuration, explicit verified fetch URL, local and remote SHA-or-absence, worktree registry, and target filesystem state. Recheck them before mutation, after each mutation, after configured Project synchronization, and before success.
- Fail without reset, deletion, force movement, status change, or rollback on dirty/wrong worktrees, any target node outside the expected registered worktree, cleanup quarantine, merged PR, repository/path alias, local/remote mismatch, or snapshot drift. Report partial state so a rerun can decide safely.
- `reconcile` must collect every pagination page before any write, deduplicate and sort by issue number, and exclude pull requests. Page collection failure means zero writes and a nonzero exit.
- Always emit `promoted`, `waiting`, `skipped`, and `errors`: all predecessors closed goes to `promoted`, any open predecessor to `waiting`, no predecessor to `skipped`, and malformed/read/write/verification failures to `errors`. Continue other safe items after an item error, then exit nonzero when `errors` is nonempty.
- A label promotion followed by Project failure belongs only in `errors`, with authoritative `status:ready` and a cause-specific recovery command: missing membership uses `project-add`; an existing-item field failure uses `project-sync`.
- Pagination is not a GitHub snapshot: if an external actor changes backlog labels while pages are being collected, review the result and rerun `reconcile` so the queue converges.

## GitHub state rule

- REST issue labels are the workflow source of truth.
- GitHub Project is an optional synchronized view configured by `GYEOP_GITHUB_PROJECT_NUMBER`; REST issue labels remain authoritative.
- `doctor` must validate the configured Project owner, number, update permission, exact managed fields, and required options without mutation.
- Only `project-add` may add missing membership. It synchronizes an open issue, but for a closed issue it adds membership only. `project-sync` requires an existing item and an open exact workflow issue.
- Configured `status`, `start`, `resume`, and `reconcile` hooks synchronize current labels. Only verified `close <issue> <pr>` may synchronize `Done` and `완료`.
- A missing Project number makes automatic hooks skip without Project or GraphQL calls. Explicit `project-add` and `project-sync` fail nonzero.
- Partial field writes are never rolled back. Require a final readback and source snapshot check, report confirmed changes and `projectSynced: false`, and use the ordered recovery: open existing=`project-sync`, open missing=`project-add`, completed existing=`close`, completed missing=`project-add` then verified `close`.
- Do not claim board status is synchronized without a successful command result and final Project readback.
- Local full verification and required CI checks must pass before merge.
