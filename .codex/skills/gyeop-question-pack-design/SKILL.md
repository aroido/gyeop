---
name: gyeop-question-pack-design
description: Create, remix, review, and specify GYEOP A/B question packs, cards, Signature questions, relationship tags, sensitivity defaults, visitor sampling, and comparison results. Use when drafting official packs, designing the P1 pack maker, reviewing user-generated questions, changing pack schemas, or validating whether a pack is safe and useful on mobile.
---

# GYEOP Question Pack Design

Produce mobile-friendly packs that reveal differences between self-perception and another person's view without turning the experience into a test or ranking.

## Read first

Read `docs/product/question-pack-spec.md` completely, then read the current loop and acceptance criteria in `docs/product/core-feature-priority.md`.

## Design a pack

1. Define the intended relationship, theme, tone, and sensitivity.
2. Draft 15 candidate A/B cards.
3. Remove cards that ask two things, expose private information, or imply a desirable answer.
4. Select exactly 10 cards with varied topics and emotional intensity.
5. Mark exactly 1 representative Signature card.
6. Preview each card in owner and visitor wording.
7. Set public or 1:1 as the recommended share mode.
8. Run the validation checklist.

## Card rules

- Ask about observable behavior, preference, habit, or perceived attitude.
- Keep one judgment per card.
- Make left and right choices mutually distinct and similarly attractive.
- Avoid factual trivia, diagnoses, moral judgment, sexual coercion, secrets, or identity exposure.
- Do not label one choice as correct.
- Keep the question within two or three mobile lines and each option within two lines.
- Make the owner prompt natural in first person.
- Verify the generated named-subject visitor prompt before publishing.

## Visitor sampling

For each visitor:

1. Assign the pack's Signature card.
2. Exclude cards the visitor already answered.
3. Find the lowest response-count group among the remaining cards.
4. Randomly assign 2 distinct cards from that group, expanding to the next group only if needed.
5. After submission, show comparison immediately.
6. Offer 2 additional under-sampled cards only as a Secondary CTA.

Never expose the owner's choices before the required 3 cards are submitted.

## Output a pack

Provide:

- Pack title and one-line promise
- Relationship, tone, sensitivity, and share recommendation
- A table of 10 owner prompts with left/right choices
- Signature card marker
- Visitor wording preview for every card
- Safety or ambiguity notes
- Expected result-card insight examples

## Validate

- Exactly 10 active cards
- Exactly 1 Signature card
- No missing prompt or option
- No overlapping or obviously preferred choices
- Natural owner and visitor wording
- Sensitivity matches share defaults
- No response leaks before submission
- Result CTA starts the same pack for the visitor

Update `docs/product/question-pack-spec.md` only when the reusable product rule changes, not when creating one pack instance. Run `./scripts/run-ai-verify --mode full` after SSOT edits.

