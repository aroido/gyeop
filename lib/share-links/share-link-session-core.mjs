import { Buffer } from "node:buffer";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const HASH_DOMAIN = Buffer.from("gyeop-share-link-v1\0", "utf8");
const PUBLIC_ID = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

function canonicalBytes(value, length, pattern) {
  if (typeof value !== "string" || !pattern.test(value))
    throw new Error("Invalid share credential");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength !== length || bytes.toString("base64url") !== value)
    throw new Error("Invalid share credential");
  return bytes;
}

export function hashShareSecret(secret) {
  return createHash("sha256")
    .update(HASH_DOMAIN)
    .update(canonicalBytes(secret, 32, SECRET))
    .digest();
}

export function createShareCredential() {
  const publicId = randomBytes(16).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  canonicalBytes(publicId, 16, PUBLIC_ID);
  return Object.freeze({
    linkId: randomUUID(),
    publicId,
    secret,
    secretHash: hashShareSecret(secret),
  });
}

export function canonicalInviteUrl(appUrl, publicId, secret) {
  canonicalBytes(publicId, 16, PUBLIC_ID);
  canonicalBytes(secret, 32, SECRET);
  const origin = new URL(appUrl);
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error("Invalid APP_URL");
  }
  return `${origin.origin}/i/${publicId}#k=${secret}`;
}
