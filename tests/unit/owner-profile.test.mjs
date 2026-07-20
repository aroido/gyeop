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
  parseOwnerProfileWatermark,
  serializeOwnerProfileWatermark,
} from "../../lib/owner-profile/owner-profile-core.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const manifest = JSON.parse(
  readFileSync(path.join(root, "content/packs/old-friend-v1.json"), "utf8"),
);

function profile(overrides = {}) {
  return {
    playId: "27000000-0000-4000-8000-000000000001",
    packSlug: "old-friend",
    packVersion: "old-friend-v1",
    packTitle: "오래 본 너의 시선",
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
    ...overrides,
  };
}

test("strictly decodes the ten-card owner profile allowlist", () => {
  const decoded = decodeOwnerProfile(profile());
  assert.equal(decoded.cards.length, 10);
  assert.ok(Object.isFrozen(decoded));
  assert.ok(Object.isFrozen(decoded.cards));

  const revealed = profile({
    sightCount: 3,
    sightStatus: "has_sight",
    cards: profile().cards.map((card, index) =>
      index === 0 ? { ...card, sampleCount: 3, counts: { a: 2, b: 1 } } : card,
    ),
  });
  assert.deepEqual(decodeOwnerProfile(revealed).cards[0].counts, {
    a: 2,
    b: 1,
  });

  for (const invalid of [
    { ...profile(), visitorId: "leak" },
    profile({ playId: "not-a-uuid" }),
    profile({ sightCount: 1, sightStatus: "empty" }),
    profile({ cards: profile().cards.slice(0, 9) }),
    profile({
      cards: profile().cards.map((card, index) =>
        index === 0 ? { ...card, responseId: "leak" } : card,
      ),
    }),
    profile({
      cards: profile().cards.map((card, index) =>
        index === 0 ? { ...card, position: 2 } : card,
      ),
    }),
    profile({
      cards: profile().cards.map((card, index) =>
        index === 0
          ? { ...card, sampleCount: 2, counts: { a: 2, b: 0 } }
          : card,
      ),
    }),
    profile({
      cards: profile().cards.map((card, index) =>
        index === 0
          ? { ...card, sampleCount: 3, counts: { a: 3, b: 1 } }
          : card,
      ),
    }),
  ]) {
    assert.throws(() => decodeOwnerProfile(invalid), /Invalid owner profile/);
  }
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
    profile({ sightCount: 3, sightStatus: "has_sight" }),
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
