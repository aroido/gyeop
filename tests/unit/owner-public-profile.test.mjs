import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeOwnerPublicProfileOutcome,
  normalizeOwnerNickname,
} from "../../lib/auth/owner-public-profile-core.mjs";

test("normalizes and accepts the exact private MVP nickname alphabet", () => {
  assert.equal(normalizeOwnerNickname("ＡＢ 09"), "AB 09");
  assert.equal(normalizeOwnerNickname("가힣AZaz09"), "가힣AZaz09");
  assert.equal(normalizeOwnerNickname("겹 친구"), "겹 친구");
});

test("rejects length, whitespace, jamo, punctuation, and emoji", () => {
  for (const value of [
    "가",
    "1234567890123",
    " 겹친구",
    "겹친구 ",
    "겹  친구",
    "ㄱㅏ",
    "겹_친구",
    "겹😀",
    null,
  ]) {
    assert.equal(normalizeOwnerNickname(value), null);
  }
});

test("strictly decodes profile outcomes", () => {
  assert.deepEqual(decodeOwnerPublicProfileOutcome({ outcome: "incomplete" }), {
    outcome: "incomplete",
  });
  assert.deepEqual(
    decodeOwnerPublicProfileOutcome({
      outcome: "complete",
      nickname: "겹친구",
    }),
    { outcome: "complete", nickname: "겹친구" },
  );
  assert.deepEqual(
    decodeOwnerPublicProfileOutcome({ outcome: "saved", nickname: "AB 09" }),
    { outcome: "saved", nickname: "AB 09" },
  );
  assert.throws(() =>
    decodeOwnerPublicProfileOutcome({
      outcome: "complete",
      nickname: "겹친구",
      email: "hidden@example.com",
    }),
  );
});
