---
name: gyeop-viral-flow-review
description: Review GYEOP mobile web screens, prototypes, implementation plans, analytics, and code for the owner-to-visitor-to-new-owner viral loop. Use when designing or auditing onboarding, pack opening, share links, relationship selection, three-card guest response, comparison results, social cards, deep links, or conversion funnels.
---

# GYEOP Viral Flow Review

Protect the zero-install path from an owner's share to a visitor's answer and then to that visitor starting the same pack.

## Read first

Read the core loop, P0 scope, success metrics, and acceptance criteria in `docs/product/core-feature-priority.md`. Read `docs/product/question-pack-spec.md` when reviewing card assignment or results.

## Trace three actors

### Owner

`팩 선택 → 셀프 10장 → 공개·1:1 링크 → 외부 공유`

### Visitor

`링크 진입 → 관계 직접 선택 → 필수 3장 → 실제 답 비교`

### Converted owner

`나도 이 팩으로 시작하기 → 같은 팩 셀프 10장 → 새 링크 공유`

Do not approve a flow that ends after the visitor submits answers.

## Review checkpoints

- The shared link opens useful content before login or installation.
- The landing page identifies the owner and pack without revealing answers.
- Relationship selection is short and owned by the visitor.
- Three required cards are visibly finite and completable in under a minute.
- The Signature card is always present and the other two are under-sampled.
- The owner's answer appears only after submission.
- Comparison is understandable card by card without a score.
- `나도 이 팩으로 시작하기` is visually primary.
- The CTA deep-links directly to the same pack's owner flow.
- Optional 2-card continuation is secondary.
- Browser back, refresh, duplicate submission, expired 1:1 links, and closed public links have defined states.
- Sensitive packs do not default to public results.

## Analytics checkpoints

Require events for:

- share link opened
- relationship selected
- visitor response started
- required card submitted
- three cards completed
- comparison viewed
- same-pack CTA clicked
- converted owner flow started
- owner 10 cards completed
- new link created
- optional 2-card continuation started and completed

Every event must include pack template, pack play, link type, and anonymous session identifiers without leaking response values into analytics.

## Report findings

Rank findings by impact on:

1. Visitor completion
2. Comparison comprehension
3. Same-pack conversion
4. New-link sharing
5. Privacy and abuse resistance

For each finding, give the affected step, observed friction, proposed change, and measurable acceptance criterion. Update the SSOT only when the user asks for the product decision to change.

