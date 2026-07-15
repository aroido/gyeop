---
name: gyeop-product-doc-writer
description: Create and revise authoritative Korean product planning documents for GYEOP from rough ideas, notes, discussions, or incomplete drafts. Use when writing a PRD, feature brief, product requirements, scope and priority plan, roadmap section, success metrics, acceptance criteria, or when deciding which active docs/product SSOT should contain new planning information before GitHub issue or implementation-spec work begins.
---

# GYEOP Product Doc Writer

Turn an unstructured product idea into one coherent planning artifact without creating parallel truth.

## Read first

1. Read `AGENTS.md`, `.codex/AGENTS.md`, and `docs/product/README.md`.
2. Read `docs/product/core-feature-priority.md` completely.
3. Read `docs/product/question-pack-spec.md` when the work touches packs, cards, sampling, responses, or results.
4. Read `docs/product/decision-log.md` for prior rationale.
5. Use `docs/product/full-product-plan.md` only for broader context and `docs/archive/` only for history.
6. Inspect every active document that already discusses the requested idea before choosing an output file.

## Choose the document

- Update `docs/product/core-feature-priority.md` for the current loop, scope, priority, metrics, or acceptance criteria.
- Update `docs/product/question-pack-spec.md` for reusable pack, card, sampling, sharing, or result rules.
- Append to `docs/product/decision-log.md` for a material decision and its rationale.
- Update `docs/product/full-product-plan.md` only for long-term context that does not override active SSOT.
- Create a focused document under `docs/product/` only when the user needs a standalone artifact and no active SSOT section can own it. Link it from `docs/product/README.md` and state its authority relative to existing SSOT.

Prefer updating one existing document over adding a new one. Never revive archived behavior silently.

## Resolve product direction

Use `$gyeop-product-guardrails` first when the draft introduces, changes, prioritizes, accepts, or rejects product behavior. Separate confirmed decisions from assumptions and open questions. Do not invent identity exposure, billing, destructive data behavior, or a new public surface without explicit direction.

## Write the plan

Preserve the structure of an existing SSOT document. For a new standalone artifact, include only the sections needed from:

- summary and decision
- user and problem
- goal and non-goals
- affected core-loop steps
- scope and priority
- requirements and product rules
- privacy and abuse constraints
- success metrics and funnel events
- testable acceptance criteria
- risks, dependencies, and open decisions
- related active SSOT

Write product-facing prose in Korean. Keep paths, event names, schema names, API names, commands, and code symbols in English. Make requirements observable enough for `$gyeop-issue-writer` to split after the document is approved.

## Quality gate

- Keep one authoritative home for every rule.
- Match the active core loop and privacy invariants unless the user explicitly changes them.
- State P0, P1, P2, P3, or excluded when priority matters.
- Distinguish confirmed facts, assumptions, and unresolved decisions.
- Pair goals with measurable outcomes and acceptance criteria.
- Update every active document, metric, and diagram made contradictory by the decision.
- Do not create GitHub issues or implementation specs unless the user asks for the next stage.
- Run `./scripts/run-ai-verify --mode full` after repository document changes.

## Report

Return the document path, document type, key decisions, SSOT files updated, and unresolved blockers. Recommend `$gyeop-issue-writer` only when the planning document is ready to become executable work.
