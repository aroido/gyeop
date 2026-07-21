import { Buffer } from "node:buffer";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { isOwnerPlayId } from "../owner-play/owner-play-state-core.mjs";

export const OWNER_CLAIM_COOKIE_NAME = "__Secure-gyeop-owner-claim";
export const OWNER_CLAIM_TTL_SECONDS = 10 * 60;

const VERSION = "v1";
const SIGNING_DOMAIN = Buffer.from("gyeop:owner-claim-context:v1\0", "utf8");
const RATE_DOMAIN = Buffer.from("gyeop:magic-link-rate-limit:v1\0", "utf8");
const ENCODED = /^[A-Za-z0-9_-]+$/;

function invalid() {
  throw new Error("Invalid owner claim context");
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === keys.join("\0")
  );
}

export function parseOwnerReturnTo(value) {
  if (value === "/me") return value;
  if (typeof value !== "string") invalid();
  const match = /^\/me\/plays\/([0-9a-f-]+)$/.exec(value);
  if (!match || !isOwnerPlayId(match[1])) invalid();
  return value;
}

export function parseOwnerSignInTarget(value) {
  if (!exactKeys(value, ["playId", "returnTo"])) invalid();
  const returnTo = parseOwnerReturnTo(value.returnTo);
  if (value.playId === null) {
    if (returnTo !== "/me") invalid();
    return Object.freeze({ playId: null, returnTo });
  }
  if (
    !isOwnerPlayId(value.playId) ||
    returnTo !== `/me/plays/${value.playId}`
  ) {
    invalid();
  }
  return Object.freeze({ playId: value.playId, returnTo });
}

function signingKey(value) {
  const key = Buffer.from(value);
  if (key.byteLength !== 32) invalid();
  return key;
}

function mac(payload, key) {
  return createHmac("sha256", signingKey(key))
    .update(SIGNING_DOMAIN)
    .update(payload)
    .digest();
}

export function deriveMagicLinkRateLimitKey(networkKey, ownerId) {
  const network = Buffer.from(networkKey);
  if (network.byteLength !== 32) invalid();
  if (ownerId !== null && !isOwnerPlayId(ownerId)) invalid();
  return createHmac("sha256", network)
    .update(RATE_DOMAIN)
    .update(ownerId ?? "account")
    .digest();
}

export function createOwnerClaimContext({
  ownerId,
  playId,
  returnTo,
  key,
  now = new Date(),
}) {
  if ((ownerId === null) !== (playId === null)) invalid();
  if (ownerId !== null && !isOwnerPlayId(ownerId)) invalid();
  if (playId !== null && !isOwnerPlayId(playId)) invalid();
  const safeReturnTo = parseOwnerReturnTo(returnTo);
  if (playId !== null && safeReturnTo !== `/me/plays/${playId}`) invalid();
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) invalid();

  const payload = Buffer.from(
    JSON.stringify({
      expiresAt: Math.floor(now.valueOf() / 1000) + OWNER_CLAIM_TTL_SECONDS,
      nonce: randomBytes(16).toString("base64url"),
      ownerId,
      playId,
      returnTo: safeReturnTo,
    }),
    "utf8",
  ).toString("base64url");
  return `${VERSION}.${payload}.${mac(payload, key).toString("base64url")}`;
}

export function parseOwnerClaimContext(value, key, now = new Date()) {
  if (typeof value !== "string" || value.length > 1024) invalid();
  const pieces = value.split(".");
  if (
    pieces.length !== 3 ||
    pieces[0] !== VERSION ||
    !ENCODED.test(pieces[1]) ||
    !ENCODED.test(pieces[2])
  ) {
    invalid();
  }
  const expected = mac(pieces[1], key);
  const actual = Buffer.from(pieces[2], "base64url");
  if (
    Buffer.from(pieces[1], "base64url").toString("base64url") !== pieces[1] ||
    actual.toString("base64url") !== pieces[2] ||
    actual.byteLength !== expected.byteLength ||
    !timingSafeEqual(actual, expected)
  ) {
    invalid();
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(pieces[1], "base64url").toString("utf8"));
  } catch {
    invalid();
  }
  if (
    !exactKeys(parsed, [
      "expiresAt",
      "nonce",
      "ownerId",
      "playId",
      "returnTo",
    ]) ||
    !Number.isSafeInteger(parsed.expiresAt) ||
    typeof parsed.nonce !== "string" ||
    !/^[A-Za-z0-9_-]{22}$/.test(parsed.nonce) ||
    (parsed.ownerId === null) !== (parsed.playId === null) ||
    (parsed.ownerId !== null && !isOwnerPlayId(parsed.ownerId)) ||
    (parsed.playId !== null && !isOwnerPlayId(parsed.playId))
  ) {
    invalid();
  }
  const returnTo = parseOwnerReturnTo(parsed.returnTo);
  if (parsed.playId !== null && returnTo !== `/me/plays/${parsed.playId}`) {
    invalid();
  }
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) invalid();
  const nowSeconds = Math.floor(now.valueOf() / 1000);
  if (
    parsed.expiresAt <= nowSeconds ||
    parsed.expiresAt > nowSeconds + OWNER_CLAIM_TTL_SECONDS
  ) {
    invalid();
  }
  return Object.freeze({
    ownerId: parsed.ownerId,
    playId: parsed.playId,
    returnTo,
  });
}

export function parseNamedCookie(header, name) {
  if (typeof header !== "string" || header.length === 0) return null;
  const values = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      values.push(part.slice(separator + 1).trim());
    }
  }
  if (values.length !== 1) return null;
  return values[0];
}

export function serializeOwnerClaimCookie(value) {
  if (typeof value !== "string" || value.length === 0) invalid();
  return [
    `${OWNER_CLAIM_COOKIE_NAME}=${value}`,
    "Path=/auth/callback",
    `Max-Age=${OWNER_CLAIM_TTL_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function serializeDeletedOwnerClaimCookie() {
  return [
    `${OWNER_CLAIM_COOKIE_NAME}=`,
    "Path=/auth/callback",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}
