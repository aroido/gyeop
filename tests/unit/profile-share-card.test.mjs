import assert from "node:assert/strict";
import test from "node:test";

import {
  PROFILE_SHARE_FILENAME,
  buildProfileShareCardModel,
  buildProfileShareCardPresentation,
  decodeConceptProfileShareCardModel,
  firstAccountProfileShareSelection,
  parseProfileShareSelection,
} from "../../lib/owner-profile/profile-share-card-core.mjs";
import { CONCEPT_CATALOG_V1 } from "../../lib/concepts/catalog-core.mjs";

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

test("derives match, mismatch, and tie presentation from card counts", () => {
  const model = buildProfileShareCardModel(profile(), {
    relationshipCode: "old_friend",
    cardId: "signature",
  });
  assert.deepEqual(buildProfileShareCardPresentation(model), {
    sampleCount: 3,
    dominantChoice: "a",
    resultState: "match",
    relationshipText: "오래된 친구 · 3명의 시선",
    resultText: "친구들은 나를 “먼저 분위기를 살핀다”로 더 많이 봤어요",
    agreementText: "내 선택도 같아요",
    selfText: "내 선택 · 먼저 분위기를 살핀다",
    questionText: card.ownerPrompt,
    distributionText: "A 2명 · B 1명",
  });

  const mismatch = buildProfileShareCardPresentation({
    ...model,
    counts: { a: 1, b: 2 },
  });
  assert.equal(mismatch.sampleCount, 3);
  assert.equal(mismatch.dominantChoice, "b");
  assert.equal(mismatch.resultState, "mismatch");
  assert.equal(mismatch.agreementText, "내 선택은 달라요");

  const tie = buildProfileShareCardPresentation({
    ...model,
    counts: { a: 2, b: 2 },
  });
  assert.equal(tie.sampleCount, 4);
  assert.equal(tie.dominantChoice, null);
  assert.equal(tie.resultState, "tie");
  assert.equal(tie.resultText, "시선이 반으로 갈렸어요");
  assert.equal(tie.agreementText, null);
  assert.equal(Object.isFrozen(tie), true);
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

function conceptAxis(catalogIndex, overrides = {}) {
  const concept = CONCEPT_CATALOG_V1.concepts[catalogIndex];
  const area = CONCEPT_CATALOG_V1.areas.find(({ id }) => id === concept.areaId);
  return {
    areaLabel: area.label,
    conceptLabel: concept.label,
    directionA: concept.directionA,
    directionB: concept.directionB,
    selfPosition: -0.6,
    others: {
      status: "available",
      source: "shareSafeOthers",
      direction: "a",
      stage: "outline",
      position: -0.5,
      range: "medium",
    },
    cardCount: 3,
    ...overrides,
  };
}

function conceptCard(overrides = {}) {
  return {
    nickname: "겹냥",
    axes: [
      conceptAxis(0),
      conceptAxis(4, {
        selfPosition: 0.7,
        others: {
          status: "available",
          source: "shareSafeOthers",
          direction: "contextual",
          stage: "trace",
          range: "split",
        },
      }),
      conceptAxis(8, {
        others: {
          status: "available",
          source: "shareSafeOthers",
          direction: "b",
          stage: "clear",
          position: 0.75,
          range: "narrow",
        },
        cardCount: 7,
      }),
    ],
    ...overrides,
  };
}

test("strictly decodes the public three-axis concept share card", () => {
  const decoded = decodeConceptProfileShareCardModel(conceptCard());
  assert.deepEqual(decoded, conceptCard());
  assert.deepEqual(Object.keys(decoded), ["nickname", "axes"]);
  assert.equal(Object.isFrozen(decoded), true);
  assert.equal(Object.isFrozen(decoded.axes), true);
  assert.equal(Object.isFrozen(decoded.axes[0].others), true);

  for (const invalid of [
    { ...conceptCard(), privateOthers: {} },
    { ...conceptCard(), nickname: "겹" },
    { ...conceptCard(), nickname: " 겹냥" },
    { ...conceptCard(), axes: conceptCard().axes.slice(0, 2) },
    {
      ...conceptCard(),
      axes: [...conceptCard().axes, conceptAxis(12)],
    },
    {
      ...conceptCard(),
      axes: [
        { ...conceptCard().axes[0], conceptLabel: "없는 결" },
        ...conceptCard().axes.slice(1),
      ],
    },
    {
      ...conceptCard(),
      axes: [
        { ...conceptCard().axes[0], selfPosition: 0 },
        ...conceptCard().axes.slice(1),
      ],
    },
    {
      ...conceptCard(),
      axes: [
        {
          ...conceptCard().axes[0],
          others: { ...conceptCard().axes[0].others, range: "narrow" },
        },
        ...conceptCard().axes.slice(1),
      ],
    },
    {
      ...conceptCard(),
      axes: [
        conceptCard().axes[0],
        {
          ...conceptCard().axes[1],
          others: { ...conceptCard().axes[1].others, position: 0 },
        },
        conceptCard().axes[2],
      ],
    },
    {
      ...conceptCard(),
      axes: [
        conceptCard().axes[0],
        conceptCard().axes[0],
        conceptCard().axes[2],
      ],
    },
    {
      ...conceptCard(),
      axes: [
        { ...conceptCard().axes[0], cardCount: 0 },
        ...conceptCard().axes.slice(1),
      ],
    },
    null,
    [],
  ]) {
    assert.throws(
      () => decodeConceptProfileShareCardModel(invalid),
      /Invalid concept profile share card/,
    );
  }
});

test("accepts locked, trace, and unsettled public axis states", () => {
  const decoded = decodeConceptProfileShareCardModel({
    nickname: "겹냥",
    axes: [
      conceptAxis(0, {
        others: { status: "locked", sightCount: 2 },
      }),
      conceptAxis(4, {
        others: {
          status: "available",
          source: "shareSafeOthers",
          direction: "a",
          stage: "trace",
          position: -0.5,
          range: "wide",
        },
      }),
      conceptAxis(8, {
        others: {
          status: "available",
          source: "shareSafeOthers",
          direction: "unsettled",
          stage: "trace",
          range: "neutral",
        },
      }),
    ],
  });
  assert.deepEqual(decoded.axes[0].others, {
    status: "locked",
    sightCount: 2,
  });
  assert.equal(decoded.axes[1].others.range, "wide");
  assert.equal(decoded.axes[2].others.range, "neutral");
});

test("rejects private, leaking locked, out-of-range, and mismatched axis data", () => {
  const base = conceptCard();
  for (const others of [
    {
      status: "available",
      source: "privateOthers",
      direction: "a",
      stage: "outline",
      position: -0.5,
      range: "medium",
    },
    {
      status: "available",
      source: "shareSafeOthers",
      direction: "unsettled",
      stage: "outline",
      position: 0,
      range: "medium",
    },
    {
      status: "available",
      source: "shareSafeOthers",
      direction: "a",
      stage: "outline",
      position: 0.5,
      range: "medium",
    },
    {
      status: "locked",
      sightCount: 2,
      direction: "a",
    },
    {
      status: "locked",
      sightCount: 3,
    },
    {
      status: "available",
      source: "shareSafeOthers",
      direction: "a",
      stage: "trace",
      position: -0.5,
      range: "medium",
    },
  ]) {
    assert.throws(
      () =>
        decodeConceptProfileShareCardModel({
          ...base,
          axes: [{ ...base.axes[0], others }, ...base.axes.slice(1)],
        }),
      /Invalid concept profile share card/,
    );
  }
  assert.throws(
    () =>
      decodeConceptProfileShareCardModel({
        ...base,
        axes: [
          { ...base.axes[0], selfPosition: Number.NaN },
          ...base.axes.slice(1),
        ],
      }),
    /Invalid concept profile share card/,
  );
});
