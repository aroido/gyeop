import assert from "node:assert/strict";
import test from "node:test";

import { parseInviteFragment } from "../../lib/share-links/invite-fragment-core.mjs";
import {
  deriveInviteRateLimitKey,
  hashShareSecret,
} from "../../lib/share-links/share-link-session-core.mjs";
import {
  decodeInviteMetadataOutcome,
  decodeShareLinkList,
} from "../../lib/share-links/share-link-state-core.mjs";

const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

test("uses the domain-separated share secret hash vector", () => {
  assert.equal(
    hashShareSecret(secret).toString("hex"),
    "60da3ea5e671bc19c6357f6c65a6a886fcc25608891c153b2c90685d2cce2cff",
  );
});

test("scopes invite rate limits by network and public link", () => {
  assert.equal(
    deriveInviteRateLimitKey(
      Uint8Array.from({ length: 32 }, (_, index) => index),
      "AAAAAAAAAAAAAAAAAAAAAA",
    ).toString("hex"),
    "d50621b4e90346d46a2d186846c5d7190e7eea4f4e2a742b28ee11dc85696b00",
  );
});

test("accepts only one exact unencoded invite fragment key", () => {
  assert.deepEqual(parseInviteFragment(`#k=${secret}`), {
    outcome: "valid",
    secret,
  });
  for (const fragment of [
    "",
    `#${secret}`,
    `#k=${secret}&x=1`,
    `#x=1&k=${secret}`,
    `#k=${secret}%20`,
    `#k=${secret.slice(1)}`,
    `#k=${secret.slice(0, -1)}9`,
    `#k=${secret}&k=${secret}`,
  ]) {
    assert.deepEqual(parseInviteFragment(fragment), { outcome: "invalid" });
  }
});

const link = Object.freeze({
  id: "19100000-0000-4000-8000-000000000001",
  publicId: "AAAAAAAAAAAAAAAAAAAAAA",
  kind: "public",
  status: "active",
  expiresAt: null,
  consumedAt: null,
});

test("strictly decodes sanitized unique owner link rows", () => {
  assert.deepEqual(decodeShareLinkList([link]), [link]);
  assert.throws(() => decodeShareLinkList([link, link]));
  assert.throws(() => decodeShareLinkList([{ ...link, secretHash: "no" }]));
  assert.throws(() =>
    decodeShareLinkList([{ ...link, consumedAt: "2026-07-18T00:00:00Z" }]),
  );
  assert.throws(() =>
    decodeShareLinkList([{ ...link, expiresAt: "2026-02-30T00:00:00Z" }]),
  );
});

test("strictly decodes only public invite metadata", () => {
  const value = {
    outcome: "active",
    metadata: {
      packSlug: "old-friend",
      packVersion: "old-friend-v1",
      packTitle: "오래된 친구팩",
      kind: "one_to_one",
    },
  };
  assert.deepEqual(decodeInviteMetadataOutcome(value), value);
  assert.throws(() =>
    decodeInviteMetadataOutcome({
      ...value,
      metadata: { ...value.metadata, ownerName: "hidden" },
    }),
  );
});
