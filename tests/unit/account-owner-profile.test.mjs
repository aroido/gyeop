import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildAccountOwnerProfile,
  decodeAccountOwnerProfile,
  readOwnerProfilesBounded,
} from "../../lib/owner-profile/account-profile-core.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const packs = ["old-friend-v2", "honest-self-v2"].map((name) =>
  JSON.parse(
    readFileSync(path.join(root, `content/packs/${name}.json`), "utf8"),
  ),
);
const ids = [
  "15000000-0000-4000-8000-000000000001",
  "15000000-0000-4000-8000-000000000002",
];

function relation(pack, relationshipCode, sightCount, samples = {}) {
  if (sightCount < 3) {
    return { relationshipCode, sightCount, status: "collecting", cards: [] };
  }
  return {
    relationshipCode,
    sightCount,
    status: "available",
    cards: pack.cards.map((card) => {
      const counts = samples[card.id] ?? { a: 0, b: 0 };
      const sampleCount = counts.a + counts.b;
      return sampleCount < 3
        ? { cardId: card.id, sampleCount, status: "collecting" }
        : { cardId: card.id, sampleCount, status: "available", counts };
    }),
  };
}

function ownerProfile(index, relationshipLayers = []) {
  const pack = packs[index];
  const cards = pack.cards.map((card, cardIndex) => {
    let sampleCount = 0;
    let a = 0;
    let b = 0;
    for (const layer of relationshipLayers) {
      if (layer.status !== "available") continue;
      const sample = layer.cards[cardIndex];
      if (sample.status !== "available") continue;
      sampleCount += sample.sampleCount;
      a += sample.counts.a;
      b += sample.counts.b;
    }
    return {
      cardId: card.id,
      position: card.position,
      ownerPrompt: card.ownerPrompt,
      optionA: card.optionA,
      optionB: card.optionB,
      selfChoice: cardIndex % 2 ? "b" : "a",
      sampleCount,
      counts: sampleCount === 0 ? null : { a, b },
    };
  });
  const sightCount = relationshipLayers.reduce(
    (sum, layer) => sum + layer.sightCount,
    0,
  );
  return {
    playId: ids[index],
    packSlug: pack.slug,
    packVersion: pack.version,
    packTitle: pack.title,
    sightCount,
    sightStatus: sightCount === 0 ? "empty" : "has_sight",
    cards,
    relationshipLayers,
  };
}

function summary(index, status = "completed") {
  const pack = packs[index];
  return {
    id: ids[index],
    packSlug: pack.slug,
    packVersion: pack.version,
    packTitle: pack.title,
    status,
    answeredCount: status === "completed" ? 10 : 2,
    updatedAt: `2026-07-23T00:00:0${index}Z`,
  };
}

test("keeps empty and draft-only accounts inside the profile chrome", () => {
  for (const plays of [[], [summary(0, "draft")]]) {
    const profile = buildAccountOwnerProfile({
      nickname: "겹친구",
      plays,
      profiles: [],
    });

    assert.equal(profile.completedPlayCount, 0);
    assert.equal(profile.sightCount, 0);
    assert.equal(profile.relationshipCount, 0);
    assert.equal(profile.ctaPlayId, null);
    assert.deepEqual(profile.selfLayers, []);
    assert.deepEqual(profile.availableLayers, []);
    assert.deepEqual(profile.collectingLayers, []);
    assert.equal(profile.plays.length, plays.length);
  }
});

test("builds one exact account model without crossing play thresholds", () => {
  const available = relation(packs[1], "school_friend", 3, {
    [packs[1].cards[0].id]: { a: 2, b: 1 },
  });
  const profile = buildAccountOwnerProfile({
    nickname: "겹친구",
    plays: [summary(0), summary(1)],
    profiles: [
      ownerProfile(0, [relation(packs[0], "old_friend", 2)]),
      ownerProfile(1, [available]),
    ],
  });

  assert.equal(profile.sightCount, 5);
  assert.equal(profile.completedPlayCount, 2);
  assert.equal(profile.relationshipCount, 2);
  assert.deepEqual(
    profile.selfLayers.map(({ playId, position }) => ({ playId, position })),
    [
      { playId: ids[0], position: 1 },
      { playId: ids[1], position: 1 },
    ],
  );
  assert.equal(profile.availableLayers.length, 1);
  assert.deepEqual(profile.availableLayers[0].counts, { a: 2, b: 1 });
  assert.deepEqual(Object.keys(profile.availableLayers[0]).sort(), [
    "cardId",
    "counts",
    "kind",
    "optionA",
    "optionB",
    "packTitle",
    "playId",
    "position",
    "prompt",
    "relationshipCode",
    "sampleCount",
    "selfChoice",
  ]);
  assert.deepEqual(Object.keys(profile.collectingLayers[0]).sort(), [
    "kind",
    "packTitle",
    "playId",
    "relationshipCode",
    "sightCount",
    "status",
  ]);
  assert.doesNotMatch(
    JSON.stringify(profile.collectingLayers),
    /cardId|sampleCount|counts|prompt|optionA|optionB|selfChoice/,
  );
});

test("keeps 2+1 of the same relationship as two collecting play layers", () => {
  const profile = buildAccountOwnerProfile({
    nickname: "겹친구",
    plays: [summary(0), summary(1)],
    profiles: [
      ownerProfile(0, [relation(packs[0], "old_friend", 2)]),
      ownerProfile(1, [relation(packs[1], "old_friend", 1)]),
    ],
  });
  assert.equal(profile.relationshipCount, 1);
  assert.equal(profile.availableLayers.length, 0);
  assert.deepEqual(
    profile.collectingLayers.map(({ playId, sightCount }) => ({
      playId,
      sightCount,
    })),
    [
      { playId: ids[0], sightCount: 2 },
      { playId: ids[1], sightCount: 1 },
    ],
  );
});

test("counts an arrived relationship without leaking collecting question data", () => {
  const profile = buildAccountOwnerProfile({
    nickname: "겹친구",
    plays: [summary(0)],
    profiles: [ownerProfile(0, [relation(packs[0], "old_friend", 3)])],
  });

  assert.equal(profile.sightCount, 3);
  assert.equal(profile.relationshipCount, 1);
  assert.equal(profile.availableLayers.length, 0);
  assert.equal(profile.collectingLayers.length, 0);
  assert.doesNotMatch(
    JSON.stringify(profile),
    /sampleCount|counts|relationshipCode/,
  );
});

test("rejects metadata mismatch and unexpected serialized keys", () => {
  assert.throws(() =>
    buildAccountOwnerProfile({
      nickname: "겹친구",
      plays: [summary(0)],
      profiles: [{ ...ownerProfile(0), packTitle: "wrong" }],
    }),
  );
  const valid = buildAccountOwnerProfile({
    nickname: "겹친구",
    plays: [summary(0)],
    profiles: [ownerProfile(0)],
  });
  assert.throws(() =>
    decodeAccountOwnerProfile({ ...valid, rawVisitorCount: 1 }),
  );
  assert.throws(() =>
    decodeAccountOwnerProfile({
      ...valid,
      collectingLayers: [
        {
          kind: "collecting",
          playId: ids[0],
          packTitle: packs[0].title,
          relationshipCode: "old_friend",
          sightCount: 2,
          status: "collecting",
          sampleCount: 2,
        },
      ],
      relationshipCount: 1,
    }),
  );
});

test("reads every profile with four workers, stable order, and one actor", async () => {
  const actor = Object.freeze({ uid: "actor-1" });
  const controller = new AbortController();
  const playIds = Array.from(
    { length: 9 },
    (_, index) => `15000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  let active = 0;
  let maximum = 0;
  const seenActors = new Set();
  const result = await readOwnerProfilesBounded({
    actor,
    playIds,
    signal: controller.signal,
    readProfile: async ({ actor: received, playId }) => {
      active += 1;
      maximum = Math.max(maximum, active);
      seenActors.add(received);
      await new Promise((resolve) => setTimeout(resolve, 4));
      active -= 1;
      return playId;
    },
  });
  assert.equal(maximum, 4);
  assert.equal(seenActors.size, 1);
  assert.equal([...seenActors][0], actor);
  assert.deepEqual(result, playIds);
});

test("fails the whole bounded read on a per-profile deadline", async () => {
  await assert.rejects(
    readOwnerProfilesBounded({
      actor: { uid: "actor-1" },
      playIds: [ids[0], ids[1]],
      signal: new AbortController().signal,
      perProfileDeadlineMs: 5,
      readProfile: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          setTimeout(resolve, 100);
        }),
    }),
  );
});
