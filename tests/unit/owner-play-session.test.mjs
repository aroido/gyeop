import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  OWNER_COOKIE_NAME,
  OWNER_MANAGEMENT_TTL_SECONDS,
  createOwnerCredential,
  decodeOwnerPlayOutcome,
  decodeOwnerPlayState,
  hashOwnerSecret,
  parseOwnerCookieHeader,
  serializeDeletedOwnerCookie,
  serializeOwnerCookie,
} from "../../lib/owner-play/owner-play-session-core.mjs";
import { OFFICIAL_PACKS } from "../../lib/packs/official-pack-registry.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const manifest = JSON.parse(
  readFileSync(path.join(root, "content/packs/old-friend-v1.json"), "utf8"),
);
const orderedAnswers = manifest.cards.map((card, index) => ({
  cardId: card.id,
  choice: index % 2 === 0 ? "a" : "b",
}));

function state(overrides = {}) {
  return {
    id: "17000000-0000-4000-8000-000000000001",
    packSlug: "old-friend",
    packVersion: "old-friend-v1",
    status: "draft",
    currentPosition: 1,
    answers: [{ cardId: "conflict", choice: "a" }],
    managementExpiresAt: "2026-07-25T00:00:00.000Z",
    managementTtlSeconds: OWNER_MANAGEMENT_TTL_SECONDS,
    ...overrides,
  };
}

test("creates and parses a canonical 256-bit owner capability", () => {
  const credential = createOwnerCredential();
  assert.match(
    credential.value,
    /^v1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/,
  );
  assert.equal(credential.managementSecretHash.byteLength, 32);

  const parsed = parseOwnerCookieHeader(
    `another=value; ${OWNER_COOKIE_NAME}=${credential.value}`,
  );
  assert.equal(parsed.outcome, "valid");
  assert.equal(parsed.playId, credential.playId);
  assert.equal(parsed.value, credential.value);
  assert.deepEqual(
    parsed.managementSecretHash,
    credential.managementSecretHash,
  );
});

test("uses the domain-separated SHA-256 contract", () => {
  const secret = Buffer.alloc(32, 7);
  const expected = createHash("sha256")
    .update(Buffer.from("gyeop-owner-play-v1\0", "utf8"))
    .update(secret)
    .digest("hex");
  assert.equal(hashOwnerSecret(secret).toString("hex"), expected);
  assert.notEqual(
    hashOwnerSecret(secret).toString("hex"),
    createHash("sha256").update(secret).digest("hex"),
  );
});

test("distinguishes absent and malformed owner cookies without decoding ambiguity", () => {
  assert.deepEqual(parseOwnerCookieHeader(null), { outcome: "absent" });
  assert.deepEqual(parseOwnerCookieHeader("other=value"), {
    outcome: "absent",
  });
  for (const header of [
    `${OWNER_COOKIE_NAME}=v2.bad.bad`,
    `${OWNER_COOKIE_NAME}=v1.17000000-0000-4000-8000-000000000001.short`,
    `${OWNER_COOKIE_NAME}=v1.17000000-0000-4000-8000-000000000001.${"a".repeat(43)}; ${OWNER_COOKIE_NAME}=duplicate`,
    `${OWNER_COOKIE_NAME}=v1.17000000-0000-4000-8000-000000000001.${"!".repeat(43)}`,
  ]) {
    assert.deepEqual(parseOwnerCookieHeader(header), { outcome: "malformed" });
  }
});

test("serializes the exact secure host cookie and deletion attributes", () => {
  const credential = createOwnerCredential();
  const cookie = serializeOwnerCookie(
    credential.value,
    OWNER_MANAGEMENT_TTL_SECONDS,
    "2026-07-25T00:00:00.000Z",
  );
  assert.match(cookie, new RegExp(`^${OWNER_COOKIE_NAME}=`));
  for (const attribute of [
    "Path=/",
    "Expires=Sat, 25 Jul 2026 00:00:00 GMT",
    "Max-Age=604800",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ]) {
    assert.ok(cookie.includes(attribute));
  }
  assert.ok(!cookie.includes("Domain="));

  const deleted = serializeDeletedOwnerCookie();
  assert.ok(deleted.includes(`${OWNER_COOKIE_NAME}=`));
  assert.ok(deleted.includes("Max-Age=0"));
  assert.ok(deleted.includes("Expires=Thu, 01 Jan 1970 00:00:00 GMT"));
});

test("strictly decodes the owner-state allowlist", () => {
  const decoded = decodeOwnerPlayState(state());
  assert.equal(decoded.packSlug, "old-friend");
  assert.equal(decoded.answers.length, 1);
  assert.ok(Object.isFrozen(decoded));
  assert.ok(Object.isFrozen(decoded.answers));
  assert.equal(
    decodeOwnerPlayState(
      state({
        managementExpiresAt: "2026-07-25T01:26:53.017077+00:00",
      }),
    ).managementExpiresAt,
    "2026-07-25T01:26:53.017077+00:00",
  );

  for (const invalid of [
    { ...state(), secret: "leak" },
    state({ managementTtlSeconds: 604799 }),
    state({ currentPosition: "1" }),
    state({ answers: [{ cardId: "conflict", choice: "A" }] }),
    state({ answers: [{ cardId: "conflict", choice: "a", prompt: "leak" }] }),
    state({ managementExpiresAt: "1" }),
    state({ managementExpiresAt: "2026-02-31T00:00:00Z" }),
    state({ answers: [orderedAnswers[1], orderedAnswers[0]] }),
    state({ answers: [{ cardId: "unknown-card", choice: "a" }] }),
    state({ status: "completed" }),
  ]) {
    assert.throws(
      () => decodeOwnerPlayState(invalid),
      /Invalid owner play session/,
    );
  }

  assert.equal(
    decodeOwnerPlayState(
      state({ status: "completed", answers: orderedAnswers }),
    ).answers.length,
    10,
  );
});

test("decodes a draft state from every active official pack", () => {
  for (const pack of OFFICIAL_PACKS) {
    const decoded = decodeOwnerPlayState(
      state({
        packSlug: pack.slug,
        packVersion: pack.version,
        answers: [{ cardId: pack.cardIds[0], choice: "a" }],
      }),
    );
    assert.equal(decoded.packSlug, pack.slug);
    assert.deepEqual(decoded.answers, [
      { cardId: pack.cardIds[0], choice: "a" },
    ]);
  }
});

test("strictly decodes route-specific outcomes", () => {
  assert.equal(
    decodeOwnerPlayOutcome({ outcome: "created", play: state() }, [
      "created",
      "pack_not_found",
    ]).outcome,
    "created",
  );
  assert.deepEqual(
    decodeOwnerPlayOutcome({ outcome: "pack_not_found" }, [
      "created",
      "pack_not_found",
    ]),
    { outcome: "pack_not_found" },
  );
  assert.deepEqual(
    decodeOwnerPlayOutcome({ outcome: "rate_limited", retryAfterSeconds: 31 }, [
      "rate_limited",
    ]),
    { outcome: "rate_limited", retryAfterSeconds: 31 },
  );
  assert.throws(
    () =>
      decodeOwnerPlayOutcome({ outcome: "created", play: state(), hash: "x" }, [
        "created",
      ]),
    /Invalid owner play session/,
  );
  assert.throws(
    () => decodeOwnerPlayOutcome({ outcome: "not_found" }, ["created"]),
    /Invalid owner play session/,
  );
  assert.throws(
    () =>
      decodeOwnerPlayOutcome(
        { outcome: "rate_limited", retryAfterSeconds: 0 },
        ["rate_limited"],
      ),
    /Invalid owner play session/,
  );
});
