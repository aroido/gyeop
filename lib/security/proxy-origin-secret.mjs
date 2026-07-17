import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

const ENCODED_SECRET = /^[A-Za-z0-9_-]{43}$/;

function decodeSecret(value, name) {
  if (typeof value !== "string" || !ENCODED_SECRET.test(value)) {
    throw new Error(`${name} must contain an unpadded 32-byte base64url value`);
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32 || decoded.toString("base64url") !== value) {
    throw new Error(`${name} must contain an unpadded 32-byte base64url value`);
  }
  return decoded;
}

export function parseProxyOriginSecret(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("ORIGIN_PROXY_SECRET is required");
  }

  const encodedReaders = value.split(".");
  if (
    encodedReaders.length < 1 ||
    encodedReaders.length > 2 ||
    encodedReaders.some((reader) => reader.length === 0)
  ) {
    throw new Error("ORIGIN_PROXY_SECRET must contain current[.secondary]");
  }
  if (new Set(encodedReaders).size !== encodedReaders.length) {
    throw new Error("ORIGIN_PROXY_SECRET readers must be distinct");
  }

  return Object.freeze({
    writer: encodedReaders[0],
    readers: Object.freeze(
      encodedReaders.map((reader) =>
        decodeSecret(reader, "ORIGIN_PROXY_SECRET"),
      ),
    ),
  });
}

function decodeCandidate(value) {
  const fallback = Buffer.alloc(32);
  if (typeof value !== "string" || !ENCODED_SECRET.test(value)) {
    return { decoded: fallback, valid: false };
  }

  const decoded = Buffer.from(value, "base64url");
  const valid =
    decoded.byteLength === 32 && decoded.toString("base64url") === value;
  return { decoded: valid ? decoded : fallback, valid };
}

export function matchesProxyOriginSecret(value, readers) {
  if (!Array.isArray(readers) || readers.length < 1 || readers.length > 2) {
    throw new Error("Proxy origin readers are invalid");
  }

  const candidate = decodeCandidate(value);
  let matches = 0;
  for (const reader of readers) {
    if (!(reader instanceof Uint8Array) || reader.byteLength !== 32) {
      throw new Error("Proxy origin reader is invalid");
    }
    matches |= Number(timingSafeEqual(candidate.decoded, reader));
  }
  return candidate.valid && matches === 1;
}
