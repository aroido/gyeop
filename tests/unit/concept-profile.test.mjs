import assert from "node:assert/strict";
import test from "node:test";

import afterWork from "../../content/packs/after-work-v3.json" with { type: "json" };
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
