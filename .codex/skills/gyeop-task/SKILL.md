---
name: gyeop-task
description: Execute GYEOP GitHub issue work through the repository task harness from queue intake to reviewed spec, implementation, QA, PR, merge, close, and worktree cleanup. Use when asked to pick the next ready issue, start or continue an issue, enforce spec-first work, run independent review gates, publish a PR, merge verified work, or inspect workflow status.
---

# GYEOP Task Workflow

Run every executable GitHub issue through one issue, one worktree, one branch, one spec, and one PR.

## Operating contract

- Use GitHub Issue `status:*` labels as workflow truth.
- Treat GitHub Project as an optional synchronized view.
- Use REST through `gh api repos/<owner>/<repo>/...` for issue and PR state.
- Write GitHub-facing titles, bodies, comments, and summaries in Korean.
- Keep branch names, labels, commands, paths, env vars, and code symbols in English.
- Do not pause between clear, safe stages unless product direction, secrets, billing, destructive data, or external access blocks progress.

## Commands

```bash
scripts/task-harness doctor
scripts/task-harness label-sync
scripts/task-harness project-add <issue-number>
scripts/task-harness queue
scripts/task-harness status <issue-number> <status-label>
scripts/task-harness start <issue-number>
scripts/task-harness spec <issue-number>
scripts/task-harness spec-check <spec-path>
scripts/task-harness qa-check <qa-path>
scripts/task-harness pr <issue-number>
scripts/task-harness merge <pr-number>
scripts/task-harness close <issue-number>
scripts/task-harness cleanup <issue-number>
```

## Required flow

1. Run `scripts/task-harness doctor`.
2. Use the specified issue or choose the highest-priority item from `scripts/task-harness queue`.
3. Run `scripts/task-harness start <issue-number>`.
4. Change into the `worktree` path printed by `start`; run the remaining issue commands there through merge.
5. Create the spec with `scripts/task-harness spec <issue-number>`.
6. Use `$gyeop-spec-writer` to complete the spec.
7. Have an independent `critic` or `architect` review the spec using only the issue, spec, and SSOT.
8. Fix all P0/P1 findings and run `scripts/task-harness spec-check <spec-path>`.
9. Set `status:implementing` and implement only the reviewed spec.
10. Run `scripts/task-harness status <issue-number> status:qa` before independent QA begins.
11. Have an independent `verifier` or `test-engineer` review the spec, diff, and relevant SSOT.
12. Write QA to `docs/temp/qa/issue-<number>.md` using the QA template.
13. Fix all P0/P1 QA findings and run `scripts/task-harness qa-check <qa-path>`.
14. Run `./scripts/run-ai-verify --mode full`.
15. Create the PR with `scripts/task-harness pr <issue-number>`.
16. Merge only after required CI checks and local full verification pass.
17. Return to the base checkout, then close the issue and remove its worktree.

Read `references/review-gates.md` before spec review or QA.

## Blocking rules

- Any P0/P1 spec finding blocks implementation.
- Any P0/P1 QA finding blocks PR creation and merge.
- A failing full verification blocks completion.
- A missing GitHub remote blocks live issue execution but not local issue/spec drafting.
- Do not mark a task blocked merely because it is difficult or incomplete.

## Installation

Project-owned skill sources live under `.codex/skills/`. Install or refresh namespaced global copies with:

```bash
scripts/install-codex-skills
```
