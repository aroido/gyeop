import assert from "node:assert/strict";
import test from "node:test";

import afterWork from "../../content/packs/after-work-v3.json" with { type: "json" };
import { CONCEPT_CATALOG_V1 } from "../../lib/concepts/catalog-core.mjs";
import {
  buildConceptProfile,
  conceptCardKey,
  decodeConceptProfile,
  selectConceptProfileSourcePairs,
} from "../../lib/owner-profile/concept-profile-core.mjs";
import { parseConceptProfileEnabled } from "../../lib/owner-profile/concept-profile-feature.mjs";

function summary(id, completedAt) {
  return {
    id,
    packSlug: afterWork.slug,
    packVersion: afterWork.version,
    packTitle: afterWork.title,
    status: "completed",
    answeredCount: 10,
    updatedAt: "2026-07-24T23:59:00.000Z",
    completedAt,
  };
}

function profile(playId) {
  return {
    playId,
    packSlug: afterWork.slug,
    packVersion: afterWork.version,
    packTitle: afterWork.title,
    sightCount: 0,
    sightStatus: "empty",
    cards: afterWork.cards.map((card, index) => ({
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
    }),
  });
}

function clone(value) {
  return structuredClone(value);
}

const TEST_CONCEPTS = CONCEPT_CATALOG_V1.concepts.slice(0, 8);

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
  const value = clone(builtProfile());
  const hook = value.hooks[0];
  const conceptDirection = "미리 구조를 잡는다";
  const evidence = {
    cardCount: 3,
    packCount: 2,
    contextCount: 2,
    packs: [
      {
        packSlug: "after-work",
        packTitle: "퇴근 후 본캐",
        contexts: ["계획"],
      },
      {
        packSlug: "coworker",
        packTitle: "퇴근 전의 우리",
        contexts: ["업무·공유"],
      },
    ],
  };
  hook.shareSafeOthers = {
    status: "available",
    stage: "outline",
    direction: "a",
    directionText: conceptDirection,
    evidence,
  };
  hook.shareEvidence = {
    status: "available",
    source: "shareSafeOthers",
    stage: "outline",
    direction: "a",
    directionText: conceptDirection,
    observation:
      "주변 시선에서는 여러 장면에서 “미리 구조를 잡는다” 쪽이 반복됐어요.",
    question: "너는 내가 어떤 장면에서 그렇게 보였어?",
    evidence: clone(evidence),
  };
  hook.shareEligible = true;
  hook.shareSourcePlayId = hook.profileSourcePlayId;
  hook.shareSourcePackSlug = "after-work";
  hook.shareSourcePackTitle = "퇴근 후 본캐";
  value.shareOptions = [
    {
      conceptId: hook.conceptId,
      safeCopy: hook.shareEvidence.observation,
      safeQuestion: hook.shareEvidence.question,
      shareEvidence: clone(hook.shareEvidence),
      sourcePlayId: hook.shareSourcePlayId,
    },
  ];
  return decodeConceptProfile(value);
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
  });
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].summary.id, newer.id);
  assert.equal(
    conceptCardKey(afterWork.slug, afterWork.version, afterWork.cards[0].id),
    "after-work\0after-work-v3\0clock-out",
  );
});

test("turns one completed pack into three to five non-diagnostic traces", () => {
  const result = builtProfile();
  assert.equal(result.modelVersion, 1);
  assert.ok(result.hooks.length >= 3 && result.hooks.length <= 5);
  assert.ok(
    result.hooks.every(
      ({ kind, stage }) => kind === "emerging" && stage === "trace",
    ),
  );
  assert.deepEqual(result.shareOptions, []);
  assert.ok(
    result.hooks.every(
      ({ observation }) =>
        !observation.includes("유형") && !observation.includes("점수"),
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
  assert.equal(hook.shareEligible, false);
  assert.deepEqual(result.shareOptions, []);
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
  assert.equal(romanticHook.shareEligible, false);
  assert.deepEqual(romantic.shareOptions, []);
});

test("allows only outline non-romantic evidence into share options", () => {
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
  assert.deepEqual(
    result.shareOptions.map(({ conceptId }) => conceptId),
    [TEST_CONCEPTS[0].id],
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
      [TEST_CONCEPTS[3].id, "emerging"],
    ],
  );
});

test("promotes one shareable hook while retaining share options outside the top five", () => {
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
    [
      TEST_CONCEPTS[0].id,
      TEST_CONCEPTS[1].id,
      TEST_CONCEPTS[2].id,
      TEST_CONCEPTS[3].id,
      TEST_CONCEPTS[5].id,
    ],
  );
  assert.equal(result.hooks.at(-1).shareEligible, true);
  assert.deepEqual(
    result.shareOptions.map(({ conceptId }) => conceptId),
    lastThree.map(({ id }) => id),
  );
  assert.deepEqual(
    result.shareOptions
      .map(({ conceptId }) => conceptId)
      .filter(
        (conceptId) =>
          !result.hooks.some((hook) => hook.conceptId === conceptId),
      ),
    TEST_CONCEPTS.slice(6, 8).map(({ id }) => id),
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
    value.hooks[0].privateOthers.direction = "a";
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
    value.hooks[0].areaLabel = "다른 영역";
  });
  expectInvalid((value) => {
    value.hooks[0].conceptLabel = "다른 결";
  });
  expectInvalid((value) => {
    value.hooks[0].self.directionText = "반대 방향";
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
