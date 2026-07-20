---
name: gyeop-product
description: Evaluate and document GYEOP product ideas against the active core loop, scope, privacy rules, and owner-to-visitor-to-new-owner flow. Use when accepting, rejecting, or prioritizing a feature; writing or revising Korean product SSOT; or reviewing onboarding, sharing, comparison screens, CTAs, analytics, and viral conversion. Do not use for question-card wording, pack schemas, the visitor sampling algorithm, or GitHub issue execution.
---

# GYEOP Product

Use `.codex/AGENTS.md` as the common product contract. Read only the active SSOT sections needed for the request; archived documents are historical context.

## Decide and document

1. Trace the effect on the owner, visitor, and converted owner.
2. Check the core loop, P0 scope, privacy invariants, mobile friction, and primary CTA.
3. State conflicts and choose `accept`, `revise`, `defer`, or `reject` with a priority.
4. Prefer updating an existing SSOT over adding a document.
5. Record material decisions in `docs/product/decision-log.md` and update any active SSOT made contradictory.

For a new standalone product document, include only the sections needed to make the decision executable: goal, non-goals, affected flow, requirements, metrics, acceptance criteria, risks, and open decisions. Write product prose in Korean and keep technical identifiers in English.

## Review a flow

Check that the visitor can open, answer, compare, and start the same pack without sign-up friction; owner answers stay hidden until submission; sensitive results remain private by default; and analytics distinguish owner, visitor, and converted-owner steps. Analytics may include pack template, play, link type, and anonymous session identifiers, but never response values.

## Report

Return the decision, priority, core-loop effect, changed SSOT paths, testable acceptance criteria, and unresolved product decision. Change files only when the user asked for an update.
