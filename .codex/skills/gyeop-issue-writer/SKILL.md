---
name: gyeop-issue-writer
description: Create, split, refine, and register detailed Korean GitHub issues and optional GitHub Project items for GYEOP. Use when converting product plans or specs into one-PR-sized work, preparing the MVP backlog, assigning type/priority/status labels, registering live issues through gh, or reviewing whether an issue is executable by the GYEOP task workflow.
---

# GYEOP Issue Writer

Write issues that can enter the spec-first task workflow without another requirements interview.

## Read first

1. Read `AGENTS.md` and `.codex/AGENTS.md`.
2. Read `docs/product/core-feature-priority.md`.
3. Read the relevant product or pack SSOT.
4. Read `references/task-template.md` before drafting a concrete issue.
5. Inspect the current repository structure before naming likely files or modules.

## Split work

Prefer one mergeable vertical slice per issue. Split when the work needs multiple independent PRs, combines unrelated layers, has several unrelated QA strategies, or cannot state one coherent outcome.

Keep frontend and backend together only when neither side creates user value alone and splitting would require fake or broken intermediate behavior.

## Required issue sections

- `## 목표`
- `## 배경/문제`
- `## 범위`
- `## 참조 문서`
- `## 완료 기준`
- `## 검증`
- `## 산출물`
- `## 의존성/블로커`
- `## 제외 범위`

Write user-facing issue text in Korean. Keep labels, status values, commands, paths, env vars, API names, and code symbols in English.

## Labels

Use only managed labels:

- `type:planning`, `type:design`, `type:frontend`, `type:backend`
- `type:data`, `type:safety`, `type:qa`, `type:ops`
- `priority:p0`, `priority:p1`, `priority:p2`
- `status:backlog`, `status:ready`, `status:spec`, `status:implementing`, `status:qa`, `status:blocked`

Use `status:backlog` when the issue is fully specified but predecessor issues are still open. Promote it to `status:ready` only after every predecessor is closed. New work with no open predecessor starts with `status:ready`. Use `status:blocked` only when a concrete external or product decision blocks work.

## Register live work

1. Run `scripts/task-harness doctor` and inspect GitHub plus configured Project permission/schema failures.
2. Run `scripts/task-harness label-sync` after the GitHub repository is configured.
3. Resolve the repository from `origin` or `GYEOP_GITHUB_REPO`; never hardcode a different repository.
4. Avoid duplicate issues by searching exact and near-exact titles first.
5. Create or update issues with REST through `gh api repos/<owner>/<repo>/...`, including exactly one managed `status:*` label and no duplicate `priority:*` or `type:*` labels.
6. If `GYEOP_GITHUB_PROJECT_NUMBER` is configured, run `scripts/task-harness project-add <issue-number>`. This is the only command that adds missing membership and, for an open issue, also synchronizes the four managed Project fields.
7. Treat `status:*` issue labels as workflow truth; treat the GitHub Project board as an optional synchronized view.
8. If registration sync fails, preserve the issue labels. Rerun `project-add` for missing membership or `project-sync` for an existing open item; do not edit Project fields manually and report success.

For a closed issue, `project-add` restores membership only and never infers completion. Restore completed fields by rerunning the verified `scripts/task-harness close <issue-number> <pr-number>` afterward. When Project is not configured, report that Project registration was skipped; issue registration and label workflow remain valid.

When no remote repository exists, produce the complete issue draft and report that live issue registration and Project sync were skipped. Do not create a remote repository without explicit user direction.

## Quality bar

- State likely files, screens, API boundaries, and data paths.
- Make completion criteria observable and testable.
- Include `./scripts/run-ai-verify --mode full` plus focused checks.
- State dependencies and exclusions explicitly.
- Do not create vague issues such as `MVP 만들기` or `UI 개선`.
