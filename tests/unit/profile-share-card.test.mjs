import assert from "node:assert/strict";
import test from "node:test";

import {
  PROFILE_SHARE_FILENAME,
  buildProfileShareCardModel,
  firstAccountProfileShareSelection,
  parseProfileShareSelection,
} from "../../lib/owner-profile/profile-share-card-core.mjs";

const card = Object.freeze({
  cardId: "signature",
  position: 1,
  ownerPrompt: "여럿이 함께 있을 때 나는 먼저 분위기를 살피는 편일까?",
  optionA: "먼저 분위기를 살핀다",
  optionB: "먼저 말을 꺼낸다",
  selfChoice: "a",
  sampleCount: 3,
  counts: Object.freeze({ a: 2, b: 1 }),
});

function profile(relationshipCode = "old_friend", relationshipCard = {}) {
  return {
    playId: "14700000-0000-4000-8000-000000000001",
    packSlug: "old-friend",
    packVersion: "old-friend-v2",
    packTitle: "우리는 아직도 통하는 편",
    sightCount: 3,
    sightStatus: "has_sight",
    cards: [card],
    relationshipLayers: [
      {
        relationshipCode,
        sightCount: 3,
        status: "available",
        cards: [
          {
            cardId: card.cardId,
            sampleCount: 3,
            status: "available",
            counts: { a: 2, b: 1 },
            ...relationshipCard,
          },
        ],
      },
    ],
  };
}

test("parses only one non-sensitive relationship and one card", () => {
  assert.equal(parseProfileShareSelection(undefined, undefined), undefined);
  assert.equal(parseProfileShareSelection("romantic", "signature"), null);
  assert.equal(parseProfileShareSelection(["old_friend"], "signature"), null);
  assert.equal(parseProfileShareSelection("old_friend", ["signature"]), null);
  assert.equal(parseProfileShareSelection("old_friend", "../secret"), null);
  assert.deepEqual(parseProfileShareSelection("old_friend", "signature"), {
    relationshipCode: "old_friend",
    cardId: "signature",
  });
});

test("account selection skips a registry-earlier romantic layer", () => {
  const selection = firstAccountProfileShareSelection([
    {
      playId: "14700000-0000-4000-8000-000000000001",
      relationshipCode: "romantic",
      cardId: "first",
    },
    {
      playId: "14700000-0000-4000-8000-000000000002",
      relationshipCode: "school_friend",
      cardId: "second",
    },
  ]);
  assert.deepEqual(selection, {
    playId: "14700000-0000-4000-8000-000000000002",
    relationshipCode: "school_friend",
    cardId: "second",
  });
});

test("builds one exact public card model without identifiers", () => {
  const model = buildProfileShareCardModel(profile(), {
    relationshipCode: "old_friend",
    cardId: "signature",
  });
  assert.deepEqual(model, {
    packTitle: "우리는 아직도 통하는 편",
    relationshipLabel: "오래된 친구",
    prompt: card.ownerPrompt,
    optionA: card.optionA,
    optionB: card.optionB,
    selfChoice: "a",
    counts: { a: 2, b: 1 },
  });
  assert.deepEqual(Object.keys(model).sort(), [
    "counts",
    "optionA",
    "optionB",
    "packTitle",
    "prompt",
    "relationshipLabel",
    "selfChoice",
  ]);
  assert.doesNotMatch(
    JSON.stringify(model),
    /14700000|signature|old_friend|secret|nickname/i,
  );
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.counts), true);
  assert.equal(PROFILE_SHARE_FILENAME, "gyeop-insight.png");
});

test("fails closed for sensitive, collecting, or stale selections", () => {
  const selection = { relationshipCode: "old_friend", cardId: "signature" };
  assert.equal(
    buildProfileShareCardModel(profile("romantic"), {
      relationshipCode: "romantic",
      cardId: "signature",
    }),
    null,
  );
  assert.equal(
    buildProfileShareCardModel(
      {
        ...profile(),
        relationshipLayers: [
          {
            relationshipCode: "old_friend",
            sightCount: 2,
            status: "collecting",
            cards: [],
          },
        ],
      },
      selection,
    ),
    null,
  );
  assert.equal(
    buildProfileShareCardModel(profile(), {
      ...selection,
      cardId: "missing",
    }),
    null,
  );
});
