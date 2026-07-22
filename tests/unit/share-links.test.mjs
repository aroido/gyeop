import assert from "node:assert/strict";
import test from "node:test";

import { parseInviteFragment } from "../../lib/share-links/invite-fragment-core.mjs";
import {
  buildShareData,
  isShareCancellation,
} from "../../lib/share-links/share-handoff-core.mjs";
import { hashShareSecret } from "../../lib/share-links/share-link-session-core.mjs";
import {
  decodeInviteMetadataOutcome,
  decodeInvitePreviewOutcome,
  decodeRecordShareActionOutcome,
  decodeShareLinkList,
  isSharePublicId,
  parseShareEntrySource,
} from "../../lib/share-links/share-link-state-core.mjs";

const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

test("uses the domain-separated share secret hash vector", () => {
  assert.equal(
    hashShareSecret(secret).toString("hex"),
    "60da3ea5e671bc19c6357f6c65a6a886fcc25608891c153b2c90685d2cce2cff",
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
  assert.equal(isSharePublicId("AAAAAAAAAAAAAAAAAAAAAA"), true);
  assert.equal(isSharePublicId("AAAAAAAAAAAAAAAAAAAAAB"), false);
  assert.throws(() =>
    decodeShareLinkList([{ ...link, publicId: "AAAAAAAAAAAAAAAAAAAAAB" }]),
  );
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
      packTitle: "우리는 아직도 통하는 편",
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

test("strictly decodes the nickname-only invite preview boundary", () => {
  const preview = {
    outcome: "available",
    previewNickname: "가힣AZaz09",
    kind: "public",
    packSlug: "old-friend",
    packVersion: "old-friend-v2",
    packTitle: "우리는 아직도 통하는 편",
    sensitivity: "low",
  };
  assert.deepEqual(decodeInvitePreviewOutcome(preview), preview);
  assert.deepEqual(decodeInvitePreviewOutcome({ outcome: "unavailable" }), {
    outcome: "unavailable",
  });
  assert.throws(() =>
    decodeInvitePreviewOutcome({
      ...preview,
      ownerEmail: "hidden@example.com",
    }),
  );
  assert.throws(() =>
    decodeInvitePreviewOutcome({ ...preview, previewNickname: "겹_친구" }),
  );
});

test("builds the exact native share payload without channel metadata", () => {
  const url = `http://127.0.0.1:3000/i/AAAAAAAAAAAAAAAAAAAAAA#k=${secret}`;
  assert.deepEqual(buildShareData(url, "우리는 아직도 통하는 편"), {
    title: "겹 · 우리는 아직도 통하는 편",
    text: '내가 먼저 답한 "우리는 아직도 통하는 편" 질문이야. 너는 나를 어떻게 보는지 3장만 골라줘.',
    url,
  });
  assert.throws(() => buildShareData("", "우리는 아직도 통하는 편"));
  assert.throws(() => buildShareData(url, ""));
});

test("classifies only AbortError as a native share cancellation", () => {
  assert.equal(isShareCancellation({ name: "AbortError" }), true);
  assert.equal(isShareCancellation({ name: "NotAllowedError" }), false);
  assert.equal(isShareCancellation(new Error("failed")), false);
  assert.equal(isShareCancellation(null), false);
});

test("strictly decodes record share action outcomes", () => {
  const recorded = {
    outcome: "recorded",
    managementExpiresAt: "2030-01-08T00:00:00Z",
    managementTtlSeconds: 604800,
  };
  assert.deepEqual(decodeRecordShareActionOutcome(recorded), recorded);
  assert.deepEqual(
    decodeRecordShareActionOutcome({ outcome: "not_completed" }),
    {
      outcome: "not_completed",
    },
  );
  assert.throws(() =>
    decodeRecordShareActionOutcome({ ...recorded, inviteUrl: "secret" }),
  );
  assert.throws(() => decodeRecordShareActionOutcome({ outcome: "recorded" }));
});

test("allowlists only the decoded single profile reshare source", () => {
  assert.equal(parseShareEntrySource("profile_reshare"), "profile_reshare");
  for (const value of [
    undefined,
    null,
    "",
    "PROFILE_RESHARE",
    ["profile_reshare"],
  ]) {
    assert.equal(parseShareEntrySource(value), null);
  }
});
