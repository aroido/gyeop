---
name: gyeop-task
description: Execute one GYEOP GitHub issue through the repository task harness from queue intake or resume to implementation spec, code, QA, PR, merge, close, and cleanup. Use when picking, starting, continuing, implementing, verifying, publishing, merging, or inspecting issue work. This skill owns implementation-spec writing; do not invoke a separate spec skill.
---

# GYEOP Task

Use `scripts/task-harness` as the workflow authority. Follow its canonical worktree, recovery command, and failure state; do not reproduce transitions with ad hoc GitHub, Project, or Git mutations.

## Model routing

- Keep the root context on repository discovery, task-harness commands, focused test execution, logs, GitHub state, and final orchestration.
- Spawn one `gyeop-core` agent for the implementation spec, reviewed implementation, debugging, and required fixes. Reuse that agent across those dependent stages instead of respawning it.
- Use a fresh independent `critic` agent for the spec gate and a fresh independent `verifier` agent for the QA gate. Wait for each result before continuing.
- Give every editing agent explicit file ownership and remind it that other agents may be working in the repository; never run concurrent edits in the same worktree.

## Required flow

1. Run `doctor`; run `reconcile` only when predecessors may have closed; choose the requested issue or one from `queue`.
2. Run `start <issue>` or `resume <issue>`, then use only the returned worktree.
3. Read the issue, linked SSOT, affected code, routes, tests, and conventions. Run `spec <issue>`, then give `gyeop-core` ownership of the spec file and require every template section in Korean. Resolve unmade product decisions with `$gyeop-product`; do not invent behavior.
4. Read `references/review-gates.md`, get independent `critic` review, have `gyeop-core` fix P0/P1 findings, and run `spec-check <spec-path>`.
5. Set `status:implementing`, resume `gyeop-core` to implement only reviewed scope, then run focused checks from the root context.
6. Set `status:qa`, get independent `verifier` review, write `docs/temp/qa/issue-<number>.md`, have `gyeop-core` fix P0/P1 findings, and run `qa-check <qa-path>`.
7. Use `pr`; it reuses an exact-HEAD full-verification marker or runs the suite once when absent, then records the verified SHA in the PR. After named `verify` CI passes, use `merge`; then return to base for `close` and `cleanup`.

Fail closed on harness errors. Preserve partial state and use the reported recovery command; never delete or rewrite uncertain worktree, branch, label, Project, PR, or QA state manually.
