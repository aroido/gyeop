import assert from "node:assert/strict";
import test from "node:test";

import {
  OWNER_CLAIM_COOKIE_NAME,
  OWNER_CLAIM_TTL_SECONDS,
  createOwnerClaimContext,
  deriveMagicLinkRateLimitKey,
  parseNamedCookie,
  parseOwnerClaimContext,
  parseOwnerReturnTo,
  serializeDeletedOwnerClaimCookie,
  serializeOwnerClaimCookie,
} from "../../lib/auth/owner-claim-context-core.mjs";

const ownerId = "31000000-0000-4000-8000-000000000001";
const playId = "31000000-0000-4000-8000-000000000002";
const key = Buffer.alloc(32, 7);
const now = new Date("2030-01-02T00:00:00.000Z");

test("signs a short-lived same-browser owner claim context", () => {
  const value = createOwnerClaimContext({
    ownerId,
    playId,
    returnTo: `/me/plays/${playId}`,
    key,
    now,
  });
  assert.deepEqual(parseOwnerClaimContext(value, key, now), {
    ownerId,
    playId,
    returnTo: `/me/plays/${playId}`,
  });
  assert.throws(() =>
    parseOwnerClaimContext(
      value,
      key,
      new Date(now.valueOf() + OWNER_CLAIM_TTL_SECONDS * 1000),
    ),
  );
  assert.throws(() =>
    parseOwnerClaimContext(`${value.slice(0, -1)}x`, key, now),
  );
});

test("allows only the private owner destinations", () => {
  assert.equal(parseOwnerReturnTo("/me"), "/me");
  assert.equal(
    parseOwnerReturnTo(`/me/plays/${playId}`),
    `/me/plays/${playId}`,
  );
  for (const value of [
    "/",
    "https://example.com/me",
    "//example.com/me",
    "/me?next=/",
    "/me/plays/bad-id",
  ]) {
    assert.throws(() => parseOwnerReturnTo(value));
  }
});

test("uses exact secure callback cookie attributes and rejects ambiguity", () => {
  const value = createOwnerClaimContext({
    ownerId: null,
    playId: null,
    returnTo: "/me",
    key,
    now,
  });
  const serialized = serializeOwnerClaimCookie(value);
  assert.equal(
    serialized,
    `${OWNER_CLAIM_COOKIE_NAME}=${value}; Path=/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  );
  assert.equal(
    parseNamedCookie(
      `a=1; ${OWNER_CLAIM_COOKIE_NAME}=${value}`,
      OWNER_CLAIM_COOKIE_NAME,
    ),
    value,
  );
  assert.equal(
    parseNamedCookie(
      `${OWNER_CLAIM_COOKIE_NAME}=${value}; ${OWNER_CLAIM_COOKIE_NAME}=${value}`,
      OWNER_CLAIM_COOKIE_NAME,
    ),
    null,
  );
  assert.match(serializeDeletedOwnerClaimCookie(), /Max-Age=0/);
});

test("domain-separates account and owner magic-link rate keys", () => {
  const networkKey = Buffer.alloc(32, 9);
  const account = deriveMagicLinkRateLimitKey(networkKey, null);
  const owner = deriveMagicLinkRateLimitKey(networkKey, ownerId);
  assert.equal(account.byteLength, 32);
  assert.equal(owner.byteLength, 32);
  assert.notDeepEqual(account, owner);
  assert.deepEqual(owner, deriveMagicLinkRateLimitKey(networkKey, ownerId));
});
