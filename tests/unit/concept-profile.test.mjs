import assert from "node:assert/strict";
import test from "node:test";

import afterWork from "../../content/packs/after-work-v3.json" with { type: "json" };
import coworkerV1 from "../../content/packs/coworker-v1.json" with { type: "json" };
import coworkerV2 from "../../content/packs/coworker-v2.json" with { type: "json" };
import groupChatRoleV1 from "../../content/packs/group-chat-role-v1.json" with { type: "json" };
import groupChatRoleV2 from "../../content/packs/group-chat-role-v2.json" with { type: "json" };
import groupChatRoleV3 from "../../content/packs/group-chat-role-v3.json" with { type: "json" };
import oldFriendV1 from "../../content/packs/old-friend-v1.json" with { type: "json" };
import oldFriendV2 from "../../content/packs/old-friend-v2.json" with { type: "json" };
import oldFriendV3 from "../../content/packs/old-friend-v3.json" with { type: "json" };
import {
  CONCEPT_CATALOG_V1,
  conceptById,
  isConceptContextV1,
} from "../../lib/concepts/catalog-core.mjs";
import {
  buildConceptProfile,
  buildConceptShareBundle,
  conceptCardKey,
  decodeConceptProfile,
  selectConceptProfileSourcePairs,
} from "../../lib/owner-profile/concept-profile-core.mjs";
import { parseConceptProfileEnabled } from "../../lib/owner-profile/concept-profile-feature.mjs";

function summary(id, completedAt, manifest = afterWork) {
  return {
    id,
    packSlug: manifest.slug,
    packVersion: manifest.version,
    packTitle: manifest.title,
    status: "completed",
    answeredCount: 10,
    updatedAt: "2026-07-24T23:59:00.000Z",
    completedAt,
  };
}

function profile(playId, manifest = afterWork) {
  return {
    playId,
    packSlug: manifest.slug,
    packVersion: manifest.version,
    packTitle: manifest.title,
    sightCount: 0,
    sightStatus: "empty",
    cards: manifest.cards.map((card, index) => ({
      cardId: card.id,
      position: card.position,
      ownerPrompt: card.ownerPrompt,
      optionA: card.optionA,
      optionB: card.optionB,
      selfChoice: index % 2 === 0 ? "a" : "b",
      sampleCount: 0,
      counts: null,
    })),
    relationshipLayers: [],
  };
}

function builtProfile() {
  const play = summary(
    "19000000-0000-4000-8000-000000000023",
    "2026-07-24T00:00:00.000Z",
  );
  return buildConceptProfile({
    pairs: selectConceptProfileSourcePairs({
      plays: [play],
      profiles: [profile(play.id)],
      manifests: [afterWork],
      currentManifests: [afterWork],
    }),
  });
}

function clone(value) {
  return structuredClone(value);
}

const TEST_CONCEPTS = CONCEPT_CATALOG_V1.concepts.slice(0, 8);
const SHARE_CONCEPTS = [0, 4, 8, 12].map(
  (index) => CONCEPT_CATALOG_V1.concepts[index],
);

function syntheticPair(
  packNumber,
  {
    signals = new Map(),
    choices = new Map(),
    relationships = [],
    includeFillers = packNumber === 1,
  } = {},
) {
  const packSlug = `fixture-pack-${packNumber}`;
  const packVersion = `${packSlug}-v1`;
  const cards = afterWork.cards.map((source, index) => {
    const conceptSignals = [...(signals.get(index) ?? [])];
    if (includeFillers && index === 9) {
      for (const concept of TEST_CONCEPTS.slice(1, 4)) {
        conceptSignals.push({
          conceptId: concept.id,
          directionForOptionA: "a",
        });
      }
    }
    return {
      id: `shared-card-${index + 1}`,
      position: index + 1,
      ownerPrompt: `Owner ${packNumber}-${index + 1}`,
      visitorPrompt: `Visitor ${packNumber}-${index + 1}`,
      optionA: "A",
      optionB: "B",
      isSignature: index === 0,
      conceptContext: source.conceptContext,
      conceptSignals,
    };
  });
  const playId = `15700000-0000-4000-8${String(packNumber).padStart(3, "0")}-000000000001`;
  const layers = relationships.map((relationship) => {
    if (relationship.status === "collecting") {
      return {
        relationshipCode: relationship.relationshipCode,
        sightCount: relationship.sightCount,
        status: "collecting",
        cards: [],
      };
    }
    return {
      relationshipCode: relationship.relationshipCode,
      sightCount: relationship.sightCount,
      status: "available",
      cards: cards.map((card) => {
        const counts = relationship.counts.get(card.id);
        return counts
          ? {
              cardId: card.id,
              sampleCount: counts.a + counts.b,
              status: "available",
              counts,
            }
          : {
              cardId: card.id,
              sampleCount: 0,
              status: "collecting",
            };
      }),
    };
  });
  return {
    summary: {
      id: playId,
      packSlug,
      packVersion,
      packTitle: `Fixture Pack ${packNumber}`,
      status: "completed",
      answeredCount: 10,
      completedAt: `2026-07-2${packNumber}T00:00:00.000Z`,
      updatedAt: `2026-07-2${packNumber}T00:00:00.000Z`,
    },
    manifest: {
      slug: packSlug,
      version: packVersion,
      title: `Fixture Pack ${packNumber}`,
      targetRelationship: "old_friend",
      sensitivity: "low",
      conceptVersion: 1,
      cards,
    },
    profile: {
      playId,
      packSlug,
      packVersion,
      packTitle: `Fixture Pack ${packNumber}`,
      sightCount: relationships.reduce(
        (total, relationship) => total + relationship.sightCount,
        0,
      ),
      sightStatus: relationships.length ? "has_sight" : "empty",
      cards: cards.map((card, index) => ({
        cardId: card.id,
        position: card.position,
        ownerPrompt: card.ownerPrompt,
        optionA: card.optionA,
        optionB: card.optionB,
        selfChoice: choices.get(index) ?? "a",
        sampleCount: 0,
        counts: null,
      })),
      relationshipLayers: layers,
    },
  };
}

function targetSignals(indices, directionForOptionA = "a", conceptIndex = 0) {
  return new Map(
    indices.map((index) => [
      index,
      [
        {
          conceptId: TEST_CONCEPTS[conceptIndex].id,
          directionForOptionA,
        },
      ],
    ]),
  );
}

function hookFor(result, conceptIndex = 0) {
  const hook = result.hooks.find(
    ({ conceptId }) => conceptId === TEST_CONCEPTS[conceptIndex].id,
  );
  assert.ok(hook, `missing fixture hook ${TEST_CONCEPTS[conceptIndex].id}`);
  return hook;
}

function expectInvalid(mutator, source = builtProfile()) {
  const value = clone(source);
  mutator(value);
  assert.throws(() => decodeConceptProfile(value), /Invalid concept profile/);
}

function shareableProfile() {
  const signals = (indices) =>
    new Map(
      indices.map((index) => [
        index,
        SHARE_CONCEPTS.slice(0, 3).map((concept) => ({
          conceptId: concept.id,
          directionForOptionA: "a",
        })),
      ]),
    );
  return buildConceptProfile({
    pairs: [1, 2].map((packNumber) => {
      const indices = packNumber === 1 ? [0, 1] : [2];
      return syntheticPair(packNumber, {
        signals: signals(indices),
        relationships: [
          {
            relationshipCode: "old_friend",
            sightCount: 3,
            status: "available",
            counts: new Map(
              indices.map((index) => [
                `shared-card-${index + 1}`,
                { a: 3, b: 0 },
              ]),
            ),
          },
        ],
        includeFillers: false,
      });
    }),
  });
}

test("selects one immutable concept source per slug by completion time", () => {
  const older = summary(
    "19000000-0000-4000-8000-000000000021",
    "2026-07-23T00:00:00.000Z",
  );
  const newer = summary(
    "19000000-0000-4000-8000-000000000022",
    "2026-07-24T00:00:00.000Z",
  );
  const pairs = selectConceptProfileSourcePairs({
    plays: [older, newer],
    profiles: [profile(older.id), profile(newer.id)],
    manifests: [afterWork],
    currentManifests: [afterWork],
  });
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].summary.id, newer.id);
  assert.equal(
    conceptCardKey(afterWork.slug, afterWork.version, afterWork.cards[0].id),
    "after-work\0after-work-v3\0clock-out",
  );
});

test("adapts only unchanged historical cards to current concept signals", () => {
  const cases = [
    {
      historical: coworkerV1,
      current: coworkerV2,
      count: 10,
      excluded: [],
    },
    {
      historical: groupChatRoleV1,
      current: groupChatRoleV3,
      count: 8,
      excluded: ["decision", "inside-joke"],
    },
    {
      historical: groupChatRoleV2,
      current: groupChatRoleV3,
      count: 8,
      excluded: ["decision", "inside-joke"],
    },
    {
      historical: oldFriendV1,
      current: oldFriendV3,
      count: 9,
      excluded: ["celebration"],
    },
    {
      historical: oldFriendV2,
      current: oldFriendV3,
      count: 10,
      excluded: [],
    },
  ];
  for (const { historical, current, count, excluded } of cases) {
    const play = summary(
      "19000000-0000-4000-8000-000000000031",
      "2026-07-24T00:00:00.000Z",
      historical,
    );
    const [pair] = selectConceptProfileSourcePairs({
      plays: [play],
      profiles: [profile(play.id, historical)],
      manifests: [historical],
      currentManifests: [current],
    });
    assert.equal(pair.manifest.cards.length, 10);
    assert.equal(
      pair.manifest.cards.filter(({ conceptSignals }) => conceptSignals.length)
        .length,
      count,
      historical.version,
    );
    assert.deepEqual(
      pair.manifest.cards
        .filter(({ conceptSignals }) => conceptSignals.length === 0)
        .map(({ id }) => id),
      excluded,
      historical.version,
    );
    assert.ok(
      pair.manifest.cards.every(
        ({ conceptContext, conceptSignals }) =>
          isConceptContextV1(conceptContext) && Array.isArray(conceptSignals),
      ),
    );
  }
});

test("treats every compatibility field mismatch as no concept contribution", () => {
  const fields = [
    ["id", "changed-card"],
    ["position", 99],
    ["ownerPrompt", "바뀐 주인 질문"],
    ["visitorPrompt", "바뀐 방문자 질문"],
    ["optionA", "바뀐 A"],
    ["optionB", "바뀐 B"],
  ];
  for (const [field, value] of fields) {
    const historical = clone(afterWork);
    historical.version = `after-work-${field}-v2`;
    historical.cards[0][field] = value;
    const play = summary(
      "19000000-0000-4000-8000-000000000032",
      "2026-07-24T00:00:00.000Z",
      historical,
    );
    const profileA = profile(play.id, historical);
    profileA.cards[0].selfChoice = "a";
    const profileB = clone(profileA);
    profileB.cards[0].selfChoice = "b";
    const select = (sourceProfile) =>
      selectConceptProfileSourcePairs({
        plays: [play],
        profiles: [sourceProfile],
        manifests: [historical],
        currentManifests: [afterWork],
      });
    const pairsA = select(profileA);
    const pairsB = select(profileB);
    assert.deepEqual(pairsA[0].manifest.cards[0].conceptSignals, [], field);
    assert.deepEqual(
      buildConceptProfile({ pairs: pairsA }),
      buildConceptProfile({ pairs: pairsB }),
      field,
    );
  }
});

test("uses authoritative current manifests despite concept history order", () => {
  const historicalConcept = clone(coworkerV1);
  historicalConcept.version = "coworker-v0";
  historicalConcept.conceptVersion = 1;
  historicalConcept.cards = coworkerV2.cards.map((card) => ({
    ...card,
    conceptSignals: [],
  }));
  const play = summary(
    "19000000-0000-4000-8000-000000000033",
    "2026-07-24T00:00:00.000Z",
    coworkerV1,
  );
  const select = (manifests) =>
    selectConceptProfileSourcePairs({
      plays: [play],
      profiles: [profile(play.id, coworkerV1)],
      manifests,
      currentManifests: [coworkerV2],
    });
  const first = select([historicalConcept, coworkerV1]);
  const last = select([coworkerV1, historicalConcept]);
  assert.deepEqual(first, last);
  assert.deepEqual(
    first[0].manifest.cards[0].conceptSignals,
    coworkerV2.cards[0].conceptSignals,
  );
});

test("turns one completed pack into self-first locked share options and eight area summaries", () => {
  const result = builtProfile();
  assert.equal(result.modelVersion, 1);
  assert.equal(result.hooks.length, 3);
  assert.ok(
    result.hooks.every(
      ({ kind, stage }) => kind === "emerging" && stage === "trace",
    ),
  );
  assert.ok(result.shareOptions.length >= 3);
  assert.ok(
    result.shareOptions.every(
      ({ sourcePlayId, bundle }) =>
        sourcePlayId === "19000000-0000-4000-8000-000000000023" &&
        bundle.length === 3 &&
        bundle.every(
          ({ others, cardCount }) =>
            cardCount > 0 &&
            Object.keys(others).join(",") === "status,sightCount" &&
            others.status === "locked" &&
            others.sightCount === 0,
        ),
    ),
  );
  assert.ok(
    result.hooks.every(
      ({ observation }) =>
        !observation.includes("유형") && !observation.includes("점수"),
    ),
  );
  assert.deepEqual(
    result.areaSummaries.map(({ areaId }) => areaId),
    CONCEPT_CATALOG_V1.areas.map(({ id }) => id),
  );
  assert.equal(result.areaSummaries.length, 8);
  assert.equal(new Set(result.hooks.map(({ areaId }) => areaId)).size, 3);
  assert.deepEqual(Object.keys(result).sort(), [
    "areaSummaries",
    "hooks",
    "modelVersion",
    "shareOptions",
  ]);
  assert.ok(
    result.hooks.every(
      (hook) =>
        hook.areaId === hook.conceptId.split(".")[0] &&
        typeof hook.directionA === "string" &&
        typeof hook.directionB === "string" &&
        Number.isFinite(hook.self.position) &&
        !Object.hasOwn(hook.self, "directionScore"),
    ),
  );
});

test("normalizes option direction, dedupes by pack card key, and applies stage edges", () => {
  const trace = buildConceptProfile({
    pairs: [
      syntheticPair(1, {
        signals: targetSignals([0, 1], "b"),
        choices: new Map([
          [0, "b"],
          [1, "b"],
        ]),
      }),
    ],
  });
  const traceHook = hookFor(trace);
  assert.equal(traceHook.self.direction, "a");
  assert.equal(traceHook.self.position, -1);
  assert.equal(traceHook.self.stage, "trace");
  assert.equal(traceHook.self.evidence.cardCount, 2);

  const outline = buildConceptProfile({
    pairs: [
      syntheticPair(1, { signals: targetSignals([0, 1]) }),
      syntheticPair(2, { signals: targetSignals([0]) }),
    ],
  });
  const outlineHook = hookFor(outline);
  assert.equal(outlineHook.self.stage, "outline");
  assert.equal(outlineHook.self.evidence.cardCount, 3);
  assert.equal(outlineHook.self.evidence.packCount, 2);
  assert.equal(
    outlineHook.self.evidence.cardCount,
    new Set([
      "fixture-pack-1\0fixture-pack-1-v1\0shared-card-1",
      "fixture-pack-1\0fixture-pack-1-v1\0shared-card-2",
      "fixture-pack-2\0fixture-pack-2-v1\0shared-card-1",
    ]).size,
  );

  const clear = buildConceptProfile({
    pairs: [1, 2, 3].map((packNumber) =>
      syntheticPair(packNumber, {
        signals: targetSignals([packNumber - 1, packNumber + 2]),
      }),
    ),
  });
  const clearHook = hookFor(clear);
  assert.equal(clearHook.self.stage, "clear");
  assert.equal(clearHook.self.evidence.cardCount, 6);
  assert.equal(clearHook.self.evidence.packCount, 3);
  assert.ok(clearHook.self.evidence.contextCount >= 3);
});

test("dedupes one card once per area while keeping each concept signal", () => {
  const result = buildConceptProfile({
    pairs: [
      syntheticPair(1, {
        signals: new Map([
          [
            0,
            [TEST_CONCEPTS[0], TEST_CONCEPTS[1]].map((concept) => ({
              conceptId: concept.id,
              directionForOptionA: "a",
            })),
          ],
          [
            1,
            [
              {
                conceptId: TEST_CONCEPTS[4].id,
                directionForOptionA: "a",
              },
            ],
          ],
        ]),
        includeFillers: false,
      }),
    ],
  });
  assert.equal(hookFor(result, 0).self.evidence.cardCount, 1);
  assert.equal(hookFor(result, 1).self.evidence.cardCount, 1);
  assert.equal(
    result.areaSummaries.find(({ areaId }) => areaId === "rel").cardCount,
    1,
  );
});

test("weights relationship direction by pack rather than respondent volume", () => {
  const firstCounts = new Map([
    ["shared-card-1", { a: 300, b: 0 }],
    ["shared-card-2", { a: 300, b: 0 }],
  ]);
  const secondCounts = new Map([["shared-card-1", { a: 0, b: 3 }]]);
  const result = buildConceptProfile({
    pairs: [
      syntheticPair(1, {
        signals: targetSignals([0, 1]),
        relationships: [
          {
            relationshipCode: "romantic",
            sightCount: 300,
            status: "available",
            counts: firstCounts,
          },
        ],
      }),
      syntheticPair(2, {
        signals: targetSignals([0]),
        relationships: [
          {
            relationshipCode: "romantic",
            sightCount: 3,
            status: "available",
            counts: secondCounts,
          },
        ],
      }),
    ],
  });
  const hook = hookFor(result);
  assert.equal(hook.privateOthers.stage, "outline");
  assert.equal(hook.privateOthers.direction, "unsettled");
  assert.equal(hook.shareSafeOthers.status, "locked");
  assert.equal(hook.shareEligible, true);
  assert.equal(hook.shareEvidence.status, "unavailable");
  assert.equal(hook.shareSourcePlayId, null);
  assert.ok(
    result.shareOptions.every(({ bundle }) =>
      bundle.every(({ others }) => others.status === "locked"),
    ),
  );
});

test("requires both directions across two cards, packs, and contexts for contextual", () => {
  const result = buildConceptProfile({
    pairs: [
      syntheticPair(1, {
        signals: targetSignals([0, 1]),
        choices: new Map([
          [0, "a"],
          [1, "b"],
        ]),
      }),
      syntheticPair(2, {
        signals: targetSignals([2, 3]),
        choices: new Map([
          [2, "a"],
          [3, "b"],
        ]),
      }),
    ],
  });
  const hook = hookFor(result);
  assert.equal(hook.kind, "contextual");
  assert.equal(hook.self.direction, "contextual");
  assert.equal(hook.self.stage, "outline");
  assert.equal(hook.self.evidence.cardCount, 4);
  assert.equal(hook.self.evidence.packCount, 2);
  assert.ok(hook.self.evidence.contextCount >= 2);
});

test("does not sum collecting sights across plays and keeps romantic evidence private", () => {
  const collecting = buildConceptProfile({
    pairs: [
      syntheticPair(1, {
        signals: targetSignals([0, 1]),
        relationships: [
          {
            relationshipCode: "old_friend",
            sightCount: 2,
            status: "collecting",
          },
        ],
      }),
      syntheticPair(2, {
        signals: targetSignals([0]),
        relationships: [
          {
            relationshipCode: "family",
            sightCount: 1,
            status: "collecting",
          },
        ],
      }),
    ],
  });
  const collectingHook = hookFor(collecting);
  assert.deepEqual(collectingHook.privateOthers, {
    status: "locked",
    sightCount: 2,
  });
  assert.deepEqual(collectingHook.shareSafeOthers, {
    status: "locked",
    sightCount: 2,
  });

  const romantic = buildConceptProfile({
    pairs: [1, 2].map((packNumber) =>
      syntheticPair(packNumber, {
        signals: targetSignals(packNumber === 1 ? [0, 1] : [2]),
        relationships: [
          {
            relationshipCode: "romantic",
            sightCount: 3,
            status: "available",
            counts: new Map(
              (packNumber === 1 ? [0, 1] : [2]).map((index) => [
                `shared-card-${index + 1}`,
                { a: 3, b: 0 },
              ]),
            ),
          },
        ],
      }),
    ),
  });
  const romanticHook = hookFor(romantic);
  assert.equal(romanticHook.privateOthers.status, "available");
  assert.equal(romanticHook.privateOthers.stage, "outline");
  assert.equal(romanticHook.shareSafeOthers.status, "locked");
  assert.equal(romanticHook.shareEligible, true);
  assert.equal(romanticHook.shareEvidence.status, "unavailable");
  assert.equal(romanticHook.shareSourcePlayId, null);
  assert.ok(
    romantic.shareOptions.every(({ bundle }) =>
      bundle.every(({ others }) => others.status === "locked"),
    ),
  );
});

test("keeps share evidence independent from self-first option eligibility", () => {
  const result = buildConceptProfile({
    pairs: [1, 2].map((packNumber) =>
      syntheticPair(packNumber, {
        signals: targetSignals(packNumber === 1 ? [0, 1] : [2]),
        relationships: [
          {
            relationshipCode: "old_friend",
            sightCount: 3,
            status: "available",
            counts: new Map(
              (packNumber === 1 ? [0, 1] : [2]).map((index) => [
                `shared-card-${index + 1}`,
                { a: 3, b: 0 },
              ]),
            ),
          },
        ],
      }),
    ),
  });
  const hook = hookFor(result);
  assert.equal(hook.shareSafeOthers.status, "available");
  assert.equal(hook.shareSafeOthers.stage, "outline");
  assert.equal(hook.shareEligible, true);
  assert.equal(hook.shareEvidence.status, "available");
  assert.ok(result.shareOptions.length >= 3);
  assert.ok(
    result.shareOptions.some(({ bundle }) =>
      bundle.some(({ others }) => others.status === "locked"),
    ),
  );
});

test("builds representative-first three-axis bundles with maximum area diversity", () => {
  const result = shareableProfile();
  assert.equal(result.shareOptions.length, 3);
  for (const option of result.shareOptions) {
    assert.equal(option.bundle.length, 3);
    assert.equal(
      option.bundle[0].conceptLabel,
      conceptById(option.conceptId).label,
    );
    assert.equal(
      new Set(option.bundle.map(({ conceptLabel }) => conceptLabel)).size,
      3,
    );
    assert.equal(
      new Set(option.bundle.map(({ areaLabel }) => areaLabel)).size,
      3,
    );
    assert.equal("safeCopy" in option, false);
    assert.equal("safeQuestion" in option, false);
    assert.equal(
      option.sourcePlayId,
      result.hooks.find(({ conceptId }) => conceptId === option.conceptId)
        ?.profileSourcePlayId,
    );
    const representative = result.hooks.find(
      ({ conceptId }) => conceptId === option.conceptId,
    );
    assert.equal(
      option.bundle[0].cardCount,
      representative.self.evidence.cardCount,
    );
  }
});

test("bundle selection preserves rank order and duplicates areas only when unavoidable", () => {
  const candidates = [0, 1, 4, 8].map((index) => {
    const concept = CONCEPT_CATALOG_V1.concepts[index];
    return { conceptId: concept.id, areaId: concept.areaId };
  });
  assert.deepEqual(
    buildConceptShareBundle(candidates, candidates[1].conceptId).map(
      ({ conceptId }) => conceptId,
    ),
    [candidates[1].conceptId, candidates[2].conceptId, candidates[3].conceptId],
  );

  const twoAreas = [0, 1, 4, 5].map((index) => {
    const concept = CONCEPT_CATALOG_V1.concepts[index];
    return { conceptId: concept.id, areaId: concept.areaId };
  });
  const selected = buildConceptShareBundle(twoAreas, twoAreas[0].conceptId);
  assert.deepEqual(
    selected.map(({ conceptId }) => conceptId),
    [twoAreas[0].conceptId, twoAreas[2].conceptId, twoAreas[1].conceptId],
  );
  assert.equal(new Set(selected.map(({ areaId }) => areaId)).size, 2);
  assert.equal(
    buildConceptShareBundle(twoAreas.slice(0, 2), twoAreas[0].conceptId),
    null,
  );
});

test("ranks difference, contextual, repeated, and emerging hooks in that order", () => {
  const firstSignals = new Map([
    [0, [{ conceptId: TEST_CONCEPTS[0].id, directionForOptionA: "a" }]],
    [1, [{ conceptId: TEST_CONCEPTS[0].id, directionForOptionA: "a" }]],
    [2, [{ conceptId: TEST_CONCEPTS[3].id, directionForOptionA: "a" }]],
    [3, [{ conceptId: TEST_CONCEPTS[1].id, directionForOptionA: "a" }]],
    [4, [{ conceptId: TEST_CONCEPTS[1].id, directionForOptionA: "a" }]],
    [7, [{ conceptId: TEST_CONCEPTS[2].id, directionForOptionA: "a" }]],
    [8, [{ conceptId: TEST_CONCEPTS[2].id, directionForOptionA: "a" }]],
  ]);
  const secondSignals = new Map([
    [2, [{ conceptId: TEST_CONCEPTS[0].id, directionForOptionA: "a" }]],
    [5, [{ conceptId: TEST_CONCEPTS[1].id, directionForOptionA: "a" }]],
    [6, [{ conceptId: TEST_CONCEPTS[1].id, directionForOptionA: "a" }]],
    [9, [{ conceptId: TEST_CONCEPTS[2].id, directionForOptionA: "a" }]],
  ]);
  const firstSafeCounts = new Map(
    [3, 4, 7, 8].map((index) => [`shared-card-${index + 1}`, { a: 3, b: 0 }]),
  );
  const secondSafeCounts = new Map(
    [5, 6, 9].map((index) => [`shared-card-${index + 1}`, { a: 3, b: 0 }]),
  );
  const result = buildConceptProfile({
    pairs: [
      syntheticPair(1, {
        signals: firstSignals,
        choices: new Map([[4, "b"]]),
        relationships: [
          {
            relationshipCode: "romantic",
            sightCount: 3,
            status: "available",
            counts: new Map([
              ["shared-card-1", { a: 0, b: 3 }],
              ["shared-card-2", { a: 0, b: 3 }],
            ]),
          },
          {
            relationshipCode: "old_friend",
            sightCount: 3,
            status: "available",
            counts: firstSafeCounts,
          },
        ],
        includeFillers: false,
      }),
      syntheticPair(2, {
        signals: secondSignals,
        choices: new Map([[6, "b"]]),
        relationships: [
          {
            relationshipCode: "romantic",
            sightCount: 3,
            status: "available",
            counts: new Map([["shared-card-3", { a: 0, b: 3 }]]),
          },
          {
            relationshipCode: "old_friend",
            sightCount: 3,
            status: "available",
            counts: secondSafeCounts,
          },
        ],
        includeFillers: false,
      }),
    ],
  });

  assert.deepEqual(
    result.hooks.map(({ conceptId, kind }) => [conceptId, kind]),
    [
      [TEST_CONCEPTS[0].id, "difference"],
      [TEST_CONCEPTS[1].id, "contextual"],
      [TEST_CONCEPTS[2].id, "repeated"],
    ],
  );
});

test("keeps existing profile rank and area diversity under self-first eligibility", () => {
  const signals = (firstGroup, secondGroup) =>
    new Map([
      [
        0,
        firstGroup.map((concept) => ({
          conceptId: concept.id,
          directionForOptionA: "a",
        })),
      ],
      [
        1,
        firstGroup.map((concept) => ({
          conceptId: concept.id,
          directionForOptionA: "a",
        })),
      ],
      [
        3,
        secondGroup.map((concept) => ({
          conceptId: concept.id,
          directionForOptionA: "a",
        })),
      ],
      [
        4,
        secondGroup.map((concept) => ({
          conceptId: concept.id,
          directionForOptionA: "a",
        })),
      ],
    ]);
  const firstFive = TEST_CONCEPTS.slice(0, 5);
  const lastThree = TEST_CONCEPTS.slice(5, 8);
  const result = buildConceptProfile({
    pairs: [
      syntheticPair(1, {
        signals: signals(firstFive, lastThree),
        relationships: [
          {
            relationshipCode: "old_friend",
            sightCount: 3,
            status: "available",
            counts: new Map([
              ["shared-card-4", { a: 3, b: 0 }],
              ["shared-card-5", { a: 3, b: 0 }],
            ]),
          },
        ],
        includeFillers: false,
      }),
      syntheticPair(2, {
        signals: new Map([
          [
            2,
            firstFive.map((concept) => ({
              conceptId: concept.id,
              directionForOptionA: "a",
            })),
          ],
          [
            5,
            lastThree.map((concept) => ({
              conceptId: concept.id,
              directionForOptionA: "a",
            })),
          ],
        ]),
        relationships: [
          {
            relationshipCode: "old_friend",
            sightCount: 3,
            status: "available",
            counts: new Map([["shared-card-6", { a: 3, b: 0 }]]),
          },
        ],
        includeFillers: false,
      }),
    ],
  });

  assert.deepEqual(
    result.hooks.map(({ conceptId }) => conceptId),
    [TEST_CONCEPTS[0].id, TEST_CONCEPTS[1].id, TEST_CONCEPTS[4].id],
  );
  assert.ok(result.hooks.every(({ shareEligible }) => shareEligible));
  assert.equal(new Set(result.hooks.map(({ areaId }) => areaId)).size, 2);
  assert.deepEqual(
    result.shareOptions.slice(0, 3).map(({ conceptId }) => conceptId),
    TEST_CONCEPTS.slice(0, 3).map(({ id }) => id),
  );
});

test("returns only the exact empty fallback for empty pairs", () => {
  assert.deepEqual(buildConceptProfile({ pairs: [] }), {
    modelVersion: 1,
    hooks: [],
    shareOptions: [],
    areaSummaries: [],
  });
  expectInvalid((value) => {
    value.hooks.pop();
  });
  assert.throws(
    () =>
      buildConceptProfile({
        pairs: [
          syntheticPair(1, {
            signals: new Map([
              [
                0,
                [TEST_CONCEPTS[0], TEST_CONCEPTS[1]].map((concept) => ({
                  conceptId: concept.id,
                  directionForOptionA: "a",
                })),
              ],
            ]),
            includeFillers: false,
          }),
        ],
      }),
    /Invalid concept profile/,
  );
});

test("recursively rejects unknown keys from every concept profile layer", () => {
  expectInvalid((value) => {
    value.rawVisitor = "forbidden";
  });
  expectInvalid((value) => {
    value.hooks[0].relationshipCode = "old_friend";
  });
  expectInvalid((value) => {
    value.hooks[0].self.rawCount = 3;
  });
  expectInvalid((value) => {
    value.hooks[0].self.directionScore = 1;
  });
  expectInvalid((value) => {
    value.hooks[0].privateOthers.direction = "a";
  });
  expectInvalid((value) => {
    value.hooks[0].privateOthers.position = 0;
  });
  expectInvalid((value) => {
    value.hooks[0].self.evidence.visitorResponseId = "forbidden";
  });
  expectInvalid((value) => {
    value.hooks[0].self.evidence.packs[0].packVersion = "after-work-v3";
  });
  expectInvalid((value) => {
    value.hooks[0].profileEvidence[0].answer = "a";
  });
  expectInvalid((value) => {
    value.areaSummaries[0].direction = "a";
  });
  expectInvalid((value) => {
    value.hooks[0].shareEvidence.reason = "private";
  });

  const shareable = shareableProfile();
  expectInvalid((value) => {
    value.hooks[0].shareEvidence.relationship = "old_friend";
  }, shareable);
  expectInvalid((value) => {
    value.shareOptions[0].profileObservation = "forbidden";
  }, shareable);
});

test("rejects invalid evidence counts, unions, and ordering", () => {
  expectInvalid((value) => {
    value.hooks[0].self.evidence.cardCount = 1.5;
  });
  expectInvalid((value) => {
    value.hooks[0].self.evidence.contextCount = 1;
  });
  expectInvalid((value) => {
    value.hooks[0].self.evidence.packs[0].contexts.reverse();
  });
  expectInvalid((value) => {
    value.hooks[0].self.evidence.packs.push({
      packSlug: "after-work",
      packTitle: "퇴근 후 본캐",
      contexts: ["연락"],
    });
    value.hooks[0].self.evidence.packCount = 2;
  });
  expectInvalid((value) => {
    value.hooks[0].self.evidence.packs[0].contexts[0] = "미등록·맥락";
  });
});

test("rejects catalog, presentation, source, and basis mismatches", () => {
  expectInvalid((value) => {
    value.hooks[0].areaId = "exp";
  });
  expectInvalid((value) => {
    value.hooks[0].areaLabel = "다른 영역";
  });
  expectInvalid((value) => {
    value.hooks[0].directionA = "다른 끝점";
  });
  expectInvalid((value) => {
    value.hooks[0].conceptLabel = "다른 결";
  });
  expectInvalid((value) => {
    value.hooks[0].self.directionText = "반대 방향";
  });
  expectInvalid((value) => {
    value.hooks[0].self.position = Number.NaN;
  });
  expectInvalid((value) => {
    value.hooks[0].self.position =
      value.hooks[0].self.direction === "a" ? 1 : -1;
  });
  expectInvalid((value) => {
    value.hooks[0].observation = "임의로 만든 문장";
  });
  expectInvalid((value) => {
    value.hooks[0].profileSourcePlayId = "not-a-uuid";
  });
  expectInvalid((value) => {
    value.hooks[0].profileSourcePackTitle = "다른 팩";
  });
  expectInvalid((value) => {
    value.hooks[0].basis = "both";
  });
  expectInvalid((value) => {
    value.hooks[0].shareSourcePlayId = "19000000-0000-4000-8000-000000000099";
  });
  expectInvalid((value) => {
    value.areaSummaries.reverse();
  });
  expectInvalid((value) => {
    value.areaSummaries[1] = clone(value.areaSummaries[0]);
  });
  expectInvalid((value) => {
    value.areaSummaries[0].stage = "clear";
  });
});

test("rejects forged available share evidence and option projections", () => {
  const shareable = shareableProfile();
  expectInvalid((value) => {
    value.hooks[0].shareSafeOthers.directionText = "반대 방향";
  }, shareable);
  expectInvalid((value) => {
    value.hooks[0].shareEvidence.observation = "임의 공유 문장";
  }, shareable);
  expectInvalid((value) => {
    value.hooks[0].shareSourcePlayId = "not-a-uuid";
  }, shareable);
  expectInvalid((value) => {
    value.hooks[0].shareSourcePackSlug = "coworker";
    value.hooks[0].shareSourcePackTitle = "다른 제목";
  }, shareable);
  expectInvalid((value) => {
    value.shareOptions[0].safeCopy = "다른 공유 문장";
  }, shareable);
  expectInvalid((value) => {
    value.shareOptions[0].sourcePlayId = "19000000-0000-4000-8000-000000000099";
  }, shareable);
  expectInvalid((value) => {
    value.shareOptions = [];
  }, shareable);
  assert.throws(
    () => decodeConceptProfile(clone(shareable), ["wrong-rank"]),
    /Invalid concept profile/,
  );
});

test("fails closed on invalid feature values", () => {
  assert.equal(parseConceptProfileEnabled(undefined), false);
  assert.equal(parseConceptProfileEnabled("false"), false);
  assert.equal(parseConceptProfileEnabled("true"), true);
  assert.throws(
    () => parseConceptProfileEnabled("TRUE"),
    /GYEOP_CONCEPT_PROFILE_ENABLED/,
  );
});
