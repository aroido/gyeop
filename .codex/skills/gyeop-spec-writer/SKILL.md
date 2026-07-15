---
name: gyeop-spec-writer
description: Create, complete, and revise implementation specifications for GYEOP features and GitHub issues. Use when turning a product idea or issue into a reviewed spec under docs/specs, defining scope and exclusions, grounding work in product SSOT and existing code, writing testable acceptance criteria, or preparing a spec for the task-harness review gate before implementation.
---

# GYEOP Spec Writer

Turn one issue into a spec that another agent can implement without re-interviewing the user.

## Start

1. Read `AGENTS.md` and `.codex/AGENTS.md`.
2. Read the issue body completely.
3. Read `docs/product/core-feature-priority.md` and every SSOT file linked by the issue.
4. Inspect affected code, routes, tests, and conventions before asking codebase questions.
5. For a live issue, change into the worktree printed by `scripts/task-harness start`, then create the draft with `scripts/task-harness spec <issue-number>`.
6. For work without a live issue, copy `docs/templates/implementation-spec.md` to a descriptive path under `docs/specs/`.

## Write the spec

Complete every template section in Korean. Keep paths, commands, labels, schema names, code symbols, and automation fields in English.

- 목표: one exact outcome
- 범위: files, screens, APIs, data, docs, and tests included
- 제외 범위: adjacent work not included
- SSOT: exact active documents
- 사용자 흐름 영향: owner, visitor, converted owner
- 디자인 영향: screens and mockups
- API와 데이터 영향: routes, schema, storage, auth, migration
- 구현 계획: ordered steps with likely files and boundaries
- 완료 기준: observable pass/fail conditions
- 테스트 계획: focused checks plus full verification
- 분석과 관측성: funnel events, logs, and dashboards
- 개인정보와 악용 방지: anonymous responses, public links, sensitive packs
- 롤아웃과 복구: flag, migration, rollback, or explicit none
- 리스크와 미결정 사항: real blockers only

Use `$gyeop-product-guardrails` first when the issue changes product behavior rather than implementing an existing decision.

## Quality gate

- Keep one issue, one spec, one branch, and one PR.
- Cite concrete files and SSOT paths wherever possible.
- Make at least 90% of acceptance criteria directly testable.
- Do not leave template instructions or ambiguous phrases such as `잘 동작한다`.
- Do not silently choose product direction, identity exposure, billing, or destructive data behavior.
- Require an independent `critic` or `architect` review when agents are available.
- Fix every P0/P1 finding.
- Record `Status: Reviewed`, reviewer name, `Review Status: PASS`, and `P0/P1 Findings: 0` only after the independent review passes.
- Run `scripts/task-harness spec-check <spec-path>` before implementation.

## Output

Return the spec path, issue number or source request, review state, and unresolved blockers. Do not implement while the spec gate is failing.
