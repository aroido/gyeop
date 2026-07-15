---
name: gyeop-product-guardrails
description: Evaluate and update GYEOP product decisions against the active core loop, scope, privacy rules, and SSOT. Use when proposing, prioritizing, accepting, rejecting, or documenting GYEOP features; revising PRDs or roadmaps; resolving conflicts between product documents; or deciding whether work belongs in P0, P1, P2, or P3.
---

# GYEOP Product Guardrails

Keep product decisions consistent with the current GYEOP loop and update the active SSOT instead of creating parallel truth.

## Read first

1. Read `docs/product/core-feature-priority.md` completely.
2. Read `docs/product/question-pack-spec.md` when the decision touches packs, cards, sampling, responses, or results.
3. Read `docs/product/decision-log.md` for prior rationale.
4. Use `docs/product/full-product-plan.md` only for broader context.
5. Treat `docs/archive/` as history, never current requirements.

## Evaluate a decision

1. Name the affected actor: owner, visitor, converted owner, pack creator, or operator.
2. Trace the change through the core loop from entry to the next share.
3. State which measurable friction or product outcome the change improves.
4. Classify it as P0, P1, P2, P3, or excluded.
5. Check every invariant below.
6. Define testable acceptance criteria and affected funnel events.
7. Recommend keep, revise, defer, or reject.

## Invariants

- The owner answers all 10 cards before sharing.
- The visitor chooses their own relationship to the owner.
- The visitor answers 1 Signature card and 2 under-sampled cards.
- The owner's answers stay hidden until the visitor submits 3 cards.
- Comparison appears immediately after the required 3 cards.
- `나도 이 팩으로 시작하기` is the Primary CTA and opens the same pack.
- Optional 2-card continuation is secondary.
- Public and single-use 1:1 links remain distinct.
- Sensitive results remain private unless explicitly shared.
- Pack creators cannot read another user's responses.
- Visitor participation requires no app install and no account.

Do not preserve an invariant blindly when the user explicitly changes the product. Record the new decision and update every affected SSOT section in the same change.

## Update the SSOT

When a decision changes current behavior:

1. Update `docs/product/core-feature-priority.md`.
2. Update `docs/product/question-pack-spec.md` when data or pack behavior changes.
3. Append a dated entry to `docs/product/decision-log.md` for material decisions.
4. Update acceptance criteria, metrics, and diagrams that now contradict the decision.
5. Do not rewrite archived documents.
6. Run `./scripts/run-ai-verify --mode full`.

## Report

Return:

- Decision
- Effect on the core loop
- Priority and rationale
- SSOT files changed
- Acceptance criteria
- Remaining product decision, if any

