import { Buffer } from "node:buffer";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  decodeVisitorResponseState,
  isVisitorResponseId,
} from "./visitor-context-core.mjs";

export const VISITOR_RESPONSE_COOKIE_NAME = "__Host-gyeop-response";
export const VISITOR_RESPONSE_TTL_SECONDS = 86_400;

const COOKIE_VERSION = "v1";
const PUBLIC_ID = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const SECRET = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const SESSION_DOMAIN = Buffer.from("gyeop-visitor-response-v1", "utf8");
const RATE_DOMAIN = Buffer.from("gyeop-response-start-v1", "utf8");
const NUL = Buffer.from([0]);

function invalid() {
  throw new Error("Invalid visitor response session");
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0")
  );
}

function decodeSecret(value) {
  if (typeof value !== "string" || !SECRET.test(value)) invalid();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== value) {
    invalid();
  }
  return bytes;
}

export function hashVisitorResponseSecret(secretBytes) {
  const bytes = Buffer.from(secretBytes);
  if (bytes.byteLength !== 32) invalid();
  return createHash("sha256")
    .update(SESSION_DOMAIN)
    .update(NUL)
    .update(bytes)
    .digest();
}

export function createVisitorResponseCredential() {
  const responseId = randomUUID();
  const secretBytes = randomBytes(32);
  const secret = secretBytes.toString("base64url");
  decodeSecret(secret);
  return Object.freeze({
    responseId,
    value: `${COOKIE_VERSION}.${responseId}.${secret}`,
    sessionTokenHash: hashVisitorResponseSecret(secretBytes),
  });
}

export function deriveResponseStartRateLimitKey(networkKey, publicId) {
  const network = Buffer.from(networkKey);
  if (
    network.byteLength !== 32 ||
    typeof publicId !== "string" ||
    !PUBLIC_ID.test(publicId)
  ) {
    invalid();
  }
  return createHash("sha256")
    .update(RATE_DOMAIN)
    .update(NUL)
    .update(network)
    .update(NUL)
    .update(Buffer.from(publicId, "utf8"))
    .digest();
}

export function parseVisitorResponseCookie(header) {
  if (header === null || header === undefined || header === "") {
    return Object.freeze({ outcome: "absent" });
  }
  if (typeof header !== "string") {
    return Object.freeze({ outcome: "malformed" });
  }
  const values = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === VISITOR_RESPONSE_COOKIE_NAME) {
      values.push(part.slice(separator + 1).trim());
    }
  }
  if (values.length === 0) return Object.freeze({ outcome: "absent" });
  if (values.length !== 1) return Object.freeze({ outcome: "malformed" });
  const parts = values[0].split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== COOKIE_VERSION ||
    !isVisitorResponseId(parts[1])
  ) {
    return Object.freeze({ outcome: "malformed" });
  }
  try {
    return Object.freeze({
      outcome: "valid",
      responseId: parts[1],
      sessionTokenHash: hashVisitorResponseSecret(decodeSecret(parts[2])),
      value: values[0],
    });
  } catch {
    return Object.freeze({ outcome: "malformed" });
  }
}

function cookieAttributes(maxAge, expires) {
  return [
    "Path=/",
    `Expires=${expires.toUTCString()}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function serializeVisitorResponseCookie(
  value,
  ttlSeconds,
  expiresAt,
  now = new Date(),
) {
  if (
    typeof value !== "string" ||
    parseVisitorResponseCookie(`${VISITOR_RESPONSE_COOKIE_NAME}=${value}`)
      .outcome !== "valid" ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > VISITOR_RESPONSE_TTL_SECONDS ||
    !(now instanceof Date) ||
    !Number.isFinite(now.valueOf())
  ) {
    invalid();
  }
  const expires = new Date(expiresAt);
  if (!Number.isFinite(expires.valueOf())) invalid();
  const maxAge = Math.min(
    ttlSeconds,
    Math.floor((expires.valueOf() - now.valueOf()) / 1000),
  );
  if (maxAge < 1) return null;
  return `${VISITOR_RESPONSE_COOKIE_NAME}=${value}; ${cookieAttributes(maxAge, expires)}`;
}

export function serializeDeletedVisitorResponseCookie() {
  return `${VISITOR_RESPONSE_COOKIE_NAME}=; ${cookieAttributes(0, new Date(0))}`;
}

export function decodeStartResponseOutcome(value) {
  if (
    (value?.outcome === "created" || value?.outcome === "resumed") &&
    exactKeys(value, ["outcome", "response"])
  ) {
    return Object.freeze({
      outcome: value.outcome,
      response: decodeVisitorResponseState(value.response),
    });
  }
  if (
    value?.outcome === "rate_limited" &&
    exactKeys(value, ["outcome", "retryAfterSeconds"]) &&
    Number.isSafeInteger(value.retryAfterSeconds) &&
    value.retryAfterSeconds > 0
  ) {
    return Object.freeze({
      outcome: "rate_limited",
      retryAfterSeconds: value.retryAfterSeconds,
    });
  }
  if (
    exactKeys(value, ["outcome"]) &&
    ["collision", "no_session", "session_invalid", "unavailable"].includes(
      value.outcome,
    )
  ) {
    return Object.freeze({ outcome: value.outcome });
  }
  invalid();
}
