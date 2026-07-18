---
name: gyeop-task
description: Execute GYEOP GitHub issue work through the repository task harness from queue intake to reviewed spec, implementation, QA, PR, merge, close, and worktree cleanup. Use when asked to pick the next ready issue, start or continue an issue, enforce spec-first work, run independent review gates, publish a PR, merge verified work, or inspect workflow status.
---

# GYEOP Task Workflow

Run every executable GitHub issue through one issue, one worktree, one branch, one spec, and one PR.

## Operating contract

- Use GitHub Issue `status:*` labels as workflow truth.
- Treat GitHub Project as an optional synchronized view. Issue labels remain authoritative; Project fields never approve workflow transitions.
- Use REST through `gh api repos/<owner>/<repo>/...` for issue and PR state.
- Write GitHub-facing titles, bodies, comments, and summaries in Korean.
- Keep branch names, labels, commands, paths, env vars, and code symbols in English.
- Do not pause between clear, safe stages unless product direction, secrets, billing, destructive data, or external access blocks progress.

## Commands

```bash
scripts/task-harness doctor
scripts/task-harness label-sync
scripts/task-harness project-add <issue-number>
scripts/task-harness project-sync <issue-number>
scripts/task-harness queue
scripts/task-harness reconcile
scripts/task-harness status <issue-number> <status-label>
scripts/task-harness start <issue-number>
scripts/task-harness resume <issue-number>
scripts/task-harness spec <issue-number>
scripts/task-harness spec-check <spec-path>
scripts/task-harness qa-check <qa-path>
scripts/task-harness pr <issue-number>
scripts/task-harness merge <pr-number>
scripts/task-harness close <issue-number> <pr-number>
scripts/task-harness cleanup <issue-number> <pr-number>
```

## Required flow

1. Run `scripts/task-harness doctor`.
2. Run `scripts/task-harness reconcile` when predecessors may have closed. Review its complete result before continuing; this is an explicit operation, not a scheduler. When Project is configured, successful promotions also synchronize its Korean fields.
3. Use the specified ready issue or choose the highest-priority item from `scripts/task-harness queue`.
4. Run `scripts/task-harness start <issue-number>` for a new task. For interrupted work, run `scripts/task-harness resume <issue-number>` and use only the returned canonical worktree; do not recreate or move its branch manually.
5. Change into the `worktree` path printed by `start` or `resume`; run the remaining issue commands there through merge.
6. Create the spec with `scripts/task-harness spec <issue-number>`.
7. Use `$gyeop-spec-writer` to complete the spec.
8. Have an independent `critic` or `architect` review the spec using only the issue, spec, and SSOT.
9. Fix all P0/P1 findings and run `scripts/task-harness spec-check <spec-path>`.
10. Set `status:implementing` and implement only the reviewed spec.
11. Run `scripts/task-harness status <issue-number> status:qa` before independent QA begins.
12. Have an independent `verifier` or `test-engineer` review the spec, diff, and relevant SSOT.
13. Write QA to `docs/temp/qa/issue-<number>.md` using the QA template.
14. Fix all P0/P1 QA findings and run `scripts/task-harness qa-check <qa-path>`.
15. Run targeted checks while implementing, then run `./scripts/run-ai-verify --mode full` once on the final clean commit immediately before publishing.
16. Create or recover the PR with `scripts/task-harness pr <issue-number>`; the harness reuses the exact-SHA local verification marker, falls back to one full verification when the marker is missing, rejects ambiguous or mismatched open PRs, verifies a draft before making it ready, preserves uncertain ready transitions for rerun recovery, and requires `Closes #<issue>` as the first line with no other GitHub closing keyword reference.
17. Merge only after required CI checks, exact-SHA local full verification, unchanged QA artifact, and the final PR base/head snapshot checks pass. The merge gate reuses that verification instead of rerunning the full suite.
18. Return to the base checkout, then run `scripts/task-harness close <issue-number> <pr-number>` and `scripts/task-harness cleanup <issue-number> <pr-number>`.

Read `references/review-gates.md` before resuming work, changing status, reviewing a spec, starting QA, publishing a PR, or merging.

## Workflow state

- Every open workflow issue must have exactly one managed `status:*` label.
- `status:blocked` must have exactly one matching `blocked-from:*` provenance label. Every other status must have none.
- Normal progress is only `backlog -> ready -> spec -> implementing -> qa`. Any active state may enter `blocked`, but it may return only to the recorded source after that source's gate passes again.
- A same-state non-blocked rerun still rechecks that state's gate and returns `changed: false` without a label write. A same-state blocked rerun checks only the exact status and provenance structure.
- `status:qa` has no direct completion or rollback transition. Completion requires the existing merge and close evidence.
- `start` may preserve a correctly created worktree when its later status write fails. Inspect the error, then rerun `start` or use `resume`; never delete the partial state automatically.

## Project synchronization

- The configured Project is organization Project #5 for `aroido/gyeop`. `doctor` verifies its owner, number, update permission, field types, and required options without mutation.
- `project-add` is the only command that adds missing membership. For an open issue it also synchronizes `Status`, `작업 상태`, `우선순위`, and `작업 유형`; for a closed issue it adds membership only.
- `project-sync` repairs an existing item for an open exact workflow issue. It rejects closed issues and missing membership without field writes.
- Configured `status`, `start`, `resume`, and `reconcile` hooks synchronize current labels. Verified `close` alone writes `Done` and `완료`. Every transition reruns its source and target gate after Project I/O; `start` and `resume` also rerun their exact Git and issue snapshots.
- Without `GYEOP_GITHUB_PROJECT_NUMBER`, automatic hooks report `skipped` and do not call Project or GraphQL. Explicit `project-add` and `project-sync` fail nonzero because their requested work cannot run.
- Project writes are not transactional. Never roll back authoritative labels or Git state after a partial Project failure. Follow the ordered recovery in the JSON: existing open item=`project-sync`, missing open item=`project-add`, existing completed item=`close`, missing completed item=`project-add` then the same verified `close`.

## Blocking rules

- Any P0/P1 spec finding blocks implementation.
- Any P0/P1 QA finding blocks PR creation and merge.
- A failing full verification blocks completion.
- Missing, duplicate, or malformed `status:*` and `blocked-from:*` labels block `status`, `start`, `resume`, `reconcile`, `pr`, and an unmerged `merge` before mutation.
- `resume` never changes issue status, fast-forwards, rewinds, force-moves, deletes, or cleans anything. Merged PRs, dirty or conflicting worktrees, repository/path/ref/origin drift, and local/remote SHA mismatches fail closed.
- `reconcile` fetches every backlog page before mutation. A page-fetch error produces no mutations; item errors are reported after other safe items and make the command exit nonzero. External label churn during pagination is handled by reviewing the result and rerunning `reconcile`.
- A configured Project schema, permission, membership, source snapshot, field write, or final readback failure must exit nonzero and report `projectSynced: false`, confirmed partial changes, and a cause-specific recovery command. Missing membership and an existing-item field failure are different recovery cases.
- `pr` and an unmerged `merge` require an open issue at exact `status:qa` with no blocked provenance at every delayed boundary. A previously merged PR may return `alreadyMerged: true` only after read-only relationship and SHA verification, even when its issue is closed.
- Duplicate or missing exact spec/QA fields, a changed QA artifact, zero CI results, or a changed PR base/head snapshot blocks publication or merge.
- Close and cleanup require the merged PR number; reruns must preserve the single completion marker and may skip only resources already absent. `close` writes Project completion only after merged-PR evidence and a closed issue GET. If completed membership is missing, run `project-add` for membership only and then rerun the same `close`. Local branch removal first moves the exact expected SHA to a task-specific recoverable quarantine ref, rechecks worktree/ref/config state, and deletes that quarantine ref with an expected-SHA compare-and-swap.
- A missing GitHub remote blocks live issue execution but not local issue/spec drafting.
- Do not mark a task blocked merely because it is difficult or incomplete.

## Installation

Project-owned skill sources live under `.codex/skills/`. Install or refresh namespaced global copies with:

```bash
scripts/install-codex-skills
```
