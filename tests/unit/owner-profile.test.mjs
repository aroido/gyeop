import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  decodeOwnerProfile,
  decodeOwnerProfileEventOutcome,
  decodeOwnerProfileOutcome,
  deriveOwnerSightNotice,
  initialOwnerProfileRelationshipCode,
  parseOwnerProfileWatermark,
  serializeOwnerProfileWatermark,
} from "../../lib/owner-profile/owner-profile-core.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const manifest = JSON.parse(
  readFileSync(path.join(root, "content/packs/old-friend-v2.json"), "utf8"),
);
const deadlineModeManifest = JSON.parse(
  readFileSync(path.join(root, "content/packs/deadline-mode-v1.json"), "utf8"),
);

function relationshipLayer(
  relationshipCode,
  sightCount,
  samples = {},
  pack = manifest,
) {
  if (sightCount < 3) {
    return {
      relationshipCode,
      sightCount,
      status: "collecting",
      cards: [],
    };
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

function profile(overrides = {}) {
  const {
    pack = manifest,
    relationshipLayers = [],
    cards: cardOverrides,
    ...profileOverrides
  } = overrides;
  const cards =
    cardOverrides ??
    pack.cards.map((card, index) => {
      let sampleCount = 0;
      let a = 0;
      let b = 0;
      for (const layer of relationshipLayers) {
        if (layer.status !== "available") continue;
        const relationshipCard = layer.cards[index];
        if (relationshipCard.status !== "available") continue;
        sampleCount += relationshipCard.sampleCount;
        a += relationshipCard.counts.a;
        b += relationshipCard.counts.b;
      }
      return {
        cardId: card.id,
        position: card.position,
        ownerPrompt: card.ownerPrompt,
        optionA: card.optionA,
        optionB: card.optionB,
        selfChoice: index % 2 === 0 ? "a" : "b",
        sampleCount,
        counts: sampleCount === 0 ? null : { a, b },
      };
    });
  const sightCount = relationshipLayers.reduce(
    (total, layer) => total + layer.sightCount,
    0,
  );
  return {
    playId: "27000000-0000-4000-8000-000000000001",
    packSlug: pack.slug,
    packVersion: pack.version,
    packTitle: pack.title,
    sightCount,
    sightStatus: sightCount === 0 ? "empty" : "has_sight",
    cards,
    relationshipLayers,
    ...profileOverrides,
  };
}

test("strictly decodes relationship layers and their safe top-level projection", () => {
  const available = relationshipLayer("school_friend", 3, {
    [manifest.cards[0].id]: { a: 2, b: 1 },
  });
  const decoded = decodeOwnerProfile(
    profile({
      relationshipLayers: [relationshipLayer("old_friend", 2), available],
    }),
  );
  assert.equal(decoded.cards.length, 10);
  assert.deepEqual(decoded.cards[0].counts, { a: 2, b: 1 });
  assert.equal(decoded.relationshipLayers[0].status, "collecting");
  assert.equal(decoded.relationshipLayers[1].status, "available");
  assert.ok(Object.isFrozen(decoded));
  assert.ok(Object.isFrozen(decoded.cards));
  assert.ok(Object.isFrozen(decoded.relationshipLayers));
  assert.equal(
    initialOwnerProfileRelationshipCode(decoded.relationshipLayers),
    "school_friend",
  );

  const hiddenRelations = decodeOwnerProfile(
    profile({
      relationshipLayers: [
        relationshipLayer("old_friend", 2),
        relationshipLayer("school_friend", 1),
      ],
    }),
  );
  assert.equal(hiddenRelations.cards[0].sampleCount, 0);
  assert.equal(hiddenRelations.cards[0].counts, null);

  const hiddenCards = decodeOwnerProfile(
    profile({
      relationshipLayers: [
        relationshipLayer("old_friend", 3, {
          [manifest.cards[0].id]: { a: 2, b: 0 },
        }),
        relationshipLayer("school_friend", 3, {
          [manifest.cards[0].id]: { a: 1, b: 0 },
        }),
      ],
    }),
  );
  assert.equal(hiddenCards.cards[0].sampleCount, 0);
  assert.equal(hiddenCards.cards[0].counts, null);
});

test("rejects malformed layers and projection mismatches", () => {
  const available = relationshipLayer("old_friend", 3, {
    [manifest.cards[0].id]: { a: 2, b: 1 },
  });
  const base = profile({ relationshipLayers: [available] });
  const replaceLayer = (change) =>
    profile({ relationshipLayers: [{ ...available, ...change }] });
  const replaceRelationshipCard = (change, index = 0) => {
    const cards = available.cards.map((card, cardIndex) =>
      cardIndex === index ? { ...card, ...change } : card,
    );
    return replaceLayer({ cards });
  };

  for (const invalid of [
    { ...base, visitorId: "leak" },
    profile({ playId: "not-a-uuid" }),
    profile({ sightCount: 1, sightStatus: "has_sight" }),
    { ...base, sightCount: 4 },
    profile({
      relationshipLayers: [
        available,
        { ...available, relationshipCode: "old_friend" },
      ],
    }),
    profile({
      relationshipLayers: [
        relationshipLayer("school_friend", 3),
        relationshipLayer("old_friend", 3),
      ],
    }),
    replaceRelationshipCard({ sampleCount: 4, counts: { a: 3, b: 1 } }),
    replaceRelationshipCard({ cardId: manifest.cards[1].id }),
    replaceRelationshipCard({
      sampleCount: 2,
      status: "collecting",
      counts: { a: 2, b: 0 },
    }),
    replaceRelationshipCard({
      sampleCount: 3,
      status: "available",
      counts: { a: 3, b: 1 },
    }),
    {
      ...base,
      relationshipLayers: [
        { ...available, cards: available.cards.slice(0, 9) },
      ],
    },
    {
      ...base,
      cards: base.cards.map((card, index) =>
        index === 0 ? { ...card, sampleCount: 0, counts: null } : card,
      ),
    },
    {
      ...base,
      cards: base.cards.map((card, index) =>
        index === 0 ? { ...card, sampleCount: 2, counts: null } : card,
      ),
    },
    {
      ...base,
      cards: base.cards.map((card, index) =>
        index === 0 ? { ...card, responseId: "leak" } : card,
      ),
    },
  ]) {
    assert.throws(() => decodeOwnerProfile(invalid), /Invalid owner profile/);
  }
});

test("decodes an owner profile for an expanded active pack", () => {
  const expandedProfile = profile({ pack: deadlineModeManifest });
  assert.equal(decodeOwnerProfile(expandedProfile).packSlug, "deadline-mode");
});

test("strictly decodes profile and event RPC outcomes", () => {
  const authorized = decodeOwnerProfileOutcome({
    outcome: "authorized",
    managementExpiresAt: "2026-07-25T00:00:00.000Z",
    managementTtlSeconds: 604800,
    profile: profile(),
  });
  assert.equal(authorized.outcome, "authorized");
  assert.equal(
    decodeOwnerProfileOutcome({
      outcome: "not_completed",
      managementExpiresAt: "2026-07-25T00:00:00.000Z",
      managementTtlSeconds: 604800,
    }).outcome,
    "not_completed",
  );
  assert.deepEqual(decodeOwnerProfileOutcome({ outcome: "expired" }), {
    outcome: "expired",
  });
  assert.deepEqual(decodeOwnerProfileEventOutcome({ outcome: "recorded" }), {
    outcome: "recorded",
  });
  assert.deepEqual(
    decodeOwnerProfileEventOutcome({ outcome: "not_eligible" }),
    { outcome: "not_eligible" },
  );

  for (const invalid of [
    { outcome: "authorized", profile: profile() },
    {
      outcome: "not_completed",
      managementExpiresAt: "2026-07-25T00:00:00.000Z",
      managementTtlSeconds: 1,
    },
    { outcome: "not_found", profile: profile() },
  ]) {
    assert.throws(
      () => decodeOwnerProfileOutcome(invalid),
      /Invalid owner profile/,
    );
  }
  assert.throws(
    () => decodeOwnerProfileEventOutcome({ outcome: "unknown" }),
    /Invalid owner profile/,
  );
});

test("derives new sight only from an honest same-play count watermark", () => {
  const current = decodeOwnerProfile(
    profile({
      relationshipLayers: [relationshipLayer("old_friend", 3)],
    }),
  );
  const raw = serializeOwnerProfileWatermark(current);
  assert.deepEqual(parseOwnerProfileWatermark(raw), {
    outcome: "valid",
    playId: current.playId,
    sightCount: 3,
  });
  assert.equal(
    deriveOwnerSightNotice(current, parseOwnerProfileWatermark(null), true),
    "new",
  );
  assert.equal(
    deriveOwnerSightNotice(
      current,
      parseOwnerProfileWatermark(
        JSON.stringify({ version: 1, playId: current.playId, sightCount: 2 }),
      ),
      true,
    ),
    "new",
  );
  assert.equal(
    deriveOwnerSightNotice(current, parseOwnerProfileWatermark(raw), true),
    "existing",
  );
  assert.equal(
    deriveOwnerSightNotice(
      current,
      parseOwnerProfileWatermark("not-json"),
      true,
    ),
    "existing",
  );
  assert.equal(
    deriveOwnerSightNotice(current, parseOwnerProfileWatermark(null), false),
    "existing",
  );
  assert.equal(
    deriveOwnerSightNotice(
      decodeOwnerProfile(profile()),
      parseOwnerProfileWatermark(null),
      true,
    ),
    "empty",
  );
});
