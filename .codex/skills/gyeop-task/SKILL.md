---
name: gyeop-task
description: Execute one GYEOP GitHub issue through the repository task harness from queue intake or resume to implementation spec, code, QA, PR, merge, close, and cleanup. Use when picking, starting, continuing, implementing, verifying, publishing, merging, or inspecting issue work. This skill owns implementation-spec writing; do not invoke a separate spec skill.
---

# GYEOP Task

Use `scripts/task-harness` as the workflow authority. Follow its canonical worktree, recovery command, and failure state; do not reproduce transitions with ad hoc GitHub, Project, or Git mutations.

## Required flow

1. Run `doctor`; run `reconcile` only when predecessors may have closed; choose the requested issue or one from `queue`.
2. Run `start <issue>` or `resume <issue>`, then use only the returned worktree.
3. Read the issue, linked SSOT, affected code, routes, tests, and conventions. Run `spec <issue>` and complete every template section in Korean. Resolve unmade product decisions with `$gyeop-product`; do not invent behavior.
4. Read `references/review-gates.md`, get independent spec review, fix P0/P1 findings, and run `spec-check <spec-path>`.
5. Set `status:implementing`, implement only reviewed scope, and run focused checks.
6. Set `status:qa`, get independent QA review, write `docs/temp/qa/issue-<number>.md`, fix P0/P1 findings, and run `qa-check <qa-path>`.
7. Use `pr`; it reuses an exact-HEAD full-verification marker or runs the suite once when absent, then records the verified SHA in the PR. After named `verify` CI passes, use `merge`; then return to base for `close` and `cleanup`.

Fail closed on harness errors. Preserve partial state and use the reported recovery command; never delete or rewrite uncertain worktree, branch, label, Project, PR, or QA state manually.
