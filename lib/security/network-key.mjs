import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const RATE_LIMIT_DOMAIN = Buffer.from(
  "gyeop:rate-limit-network-key:v1",
  "utf8",
);
const ENCODED_SECRET = /^[A-Za-z0-9_-]{43}$/;

export function parseRateLimitSecret(value) {
  if (typeof value !== "string" || !ENCODED_SECRET.test(value)) {
    throw new Error(
      "RATE_LIMIT_SECRET must be an unpadded 32-byte base64url value",
    );
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32 || decoded.toString("base64url") !== value) {
    throw new Error(
      "RATE_LIMIT_SECRET must be an unpadded 32-byte base64url value",
    );
  }
  return decoded;
}

function parseIpv4(value) {
  const parts = value.split(".");
  if (parts.length !== 4) throw new Error("Invalid IPv4 address");
  return Buffer.from(
    parts.map((part) => {
      if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) {
        throw new Error("Invalid IPv4 address");
      }
      const octet = Number(part);
      if (octet > 255) throw new Error("Invalid IPv4 address");
      return octet;
    }),
  );
}

function ipv4TailToHextets(value) {
  const bytes = parseIpv4(value);
  return [
    bytes.readUInt16BE(0).toString(16),
    bytes.readUInt16BE(2).toString(16),
  ];
}

function parseIpv6(value) {
  let source = value.toLowerCase();
  if (source.includes("%")) throw new Error("Scoped IPv6 is not accepted");

  const pieces = source.split(":");
  const last = pieces.at(-1);
  if (last?.includes(".")) {
    pieces.splice(-1, 1, ...ipv4TailToHextets(last));
    source = pieces.join(":");
  }

  const halves = source.split("::");
  if (halves.length > 2) throw new Error("Invalid IPv6 address");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    throw new Error("Invalid IPv6 address");
  }

  const missing = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    throw new Error("Invalid IPv6 address");
  }
  const words = [...left, ...Array(missing).fill("0"), ...right];
  if (words.length !== 8) throw new Error("Invalid IPv6 address");

  const bytes = Buffer.alloc(16);
  words.forEach((word, index) =>
    bytes.writeUInt16BE(Number.parseInt(word, 16), index * 2),
  );
  return bytes;
}

export function canonicalNetwork(ip) {
  const family = isIP(ip);
  if (family === 4) {
    return Object.freeze({ family: 4, bytes: parseIpv4(ip) });
  }
  if (family !== 6) throw new Error("Forwarded IP is invalid");

  const bytes = parseIpv6(ip);
  const isMapped =
    bytes.subarray(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  if (isMapped) {
    return Object.freeze({ family: 4, bytes: Buffer.from(bytes.subarray(12)) });
  }
  return Object.freeze({ family: 6, bytes: Buffer.from(bytes.subarray(0, 8)) });
}

function frame(value) {
  if (value.byteLength > 0xffff)
    throw new Error("Rate limit frame is too large");
  const length = Buffer.alloc(2);
  length.writeUInt16BE(value.byteLength);
  return Buffer.concat([length, value]);
}

function utcDay(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("Rate limit date is invalid");
  }
  return Buffer.from(date.toISOString().slice(0, 10), "ascii");
}

export function deriveNetworkKey({ ip, secret, now = new Date() }) {
  if (!(secret instanceof Uint8Array) || secret.byteLength !== 32) {
    throw new Error("Rate limit secret is invalid");
  }
  const network = canonicalNetwork(ip);
  const payload = Buffer.concat([
    frame(RATE_LIMIT_DOMAIN),
    frame(utcDay(now)),
    frame(Buffer.from([network.family])),
    frame(network.bytes),
  ]);
  return createHmac("sha256", secret).update(payload).digest();
}
