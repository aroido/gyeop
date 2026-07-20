---
name: gyeop-issue-writer
description: Create, split, refine, and register detailed Korean GitHub issues and optional GitHub Project items for GYEOP. Use when authoring or rewriting issue definitions, converting product plans into one-PR-sized work, preparing the MVP backlog, assigning type/priority/status labels, registering live issues through gh, or checking whether an issue can enter the GYEOP task workflow.
---

# GYEOP Issue Writer

Read `.codex/AGENTS.md`, the relevant active SSOT, the current repository structure, and `references/task-template.md`.

## Define the work

Prefer one mergeable vertical slice per issue. Split unrelated outcomes, dependencies, or QA strategies; keep frontend and backend together only when neither provides user value alone.

Use the template headings in order. State likely files, screens, API and data boundaries, exclusions, dependencies, focused checks, the later task-harness full verification, and observable completion criteria. Write issue prose in Korean; keep paths, commands, labels, and code identifiers in English.

Assign exactly one managed label from each set: `type:{planning,design,frontend,backend,data,safety,qa,ops}`, `priority:{p0,p1,p2}`, and `status:{backlog,ready,spec,implementing,qa,blocked}`. Use `blocked` only with one matching `blocked-from:*` for a real external or product-decision blocker.

## Register live work

1. Run `scripts/task-harness doctor`, then search exact and near-exact titles before creating anything.
2. Create or update through `gh api` with the resolved repository and exact labels.
3. When a Project is configured, use `scripts/task-harness project-add <issue-number>`; never edit Project fields manually.

Without a remote, return local-ready bodies and labels without inventing issue numbers.
