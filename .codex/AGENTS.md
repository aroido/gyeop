# GYEOP Project Contract

## Product objective

Build a mobile-first social profile where an owner answers a 10-card question pack, visitors answer a lightweight subset, compare their view with the owner's answer, and can immediately start the same pack for themselves.

## Source of truth

Use documents in this order when they conflict:

1. `docs/product/core-feature-priority.md`
2. `docs/product/question-pack-spec.md`
3. `docs/product/decision-log.md`
4. `docs/product/full-product-plan.md`
5. `docs/archive/` for historical context only

Do not silently revive behavior that exists only in archived or older documents. Record material product decisions in `docs/product/decision-log.md` and update the active SSOT in the same change.

## Product invariants

- Keep visitor participation on mobile web with no install requirement.
- Let the owner answer all 10 cards before creating a share link.
- Let the visitor select their own relationship to the owner.
- Give a visitor 3 required cards: 1 pack signature card and 2 under-sampled cards.
- Hide the owner's answers until the visitor submits all 3 required cards.
- Make `나도 이 팩으로 시작하기` the primary result CTA.
- Start the same pack's owner flow directly from that CTA.
- Treat optional 2-card continuation as secondary and never block the viral CTA.
- Support both reusable public links and single-use 1:1 links.
- Keep sensitive relationship results private unless explicitly shared.
- Never let a pack template creator access another user's response contents.

## Working rules

- Default user-facing product copy and planning documents to Korean.
- Design for a narrow mobile viewport first; desktop is a responsive expansion.
- Prefer one clear path over speculative modes in P0.
- Keep A/B as the only answer format in P0.
- Do not add payments, ads, public user search, chat, comments, rankings, or MBTI-style fixed labels without an explicit product decision.
- Use one matching project skill in `.codex/skills/`; do not chain skills when one entry point covers the work.
- Use `$gyeop-product` for product decisions, planning documents, and viral-flow review.
- Use `$gyeop-question-pack-design` for pack and card content.
- Use `$gyeop-issue-writer` when creating or splitting GitHub work.
- Use `$gyeop-task` for issue execution and its implementation spec; keep one issue per worktree, branch, spec, and PR.
- Treat `status:*` labels as task workflow truth and GitHub Project as an optional synchronized view.

## Completion gate

For issue work, `scripts/task-harness pr` reuses an exact clean-HEAD verification marker or runs `./scripts/run-ai-verify --mode full` once when absent; do not run it separately before `pr`. Outside the harness, run it before declaring meaningful project work complete. Report the failing command and cause when verification does not pass.
