import { Buffer } from "node:buffer";
import { createHash, randomBytes, randomUUID } from "node:crypto";

export const OWNER_COOKIE_NAME = "__Host-gyeop-owner";
export const OWNER_MANAGEMENT_TTL_SECONDS = 7 * 24 * 60 * 60;

const COOKIE_VERSION = "v1";
const DOMAIN_SEPARATOR = Buffer.from("gyeop-owner-play-v1\0", "utf8");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOWER_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const OWNER_CARD_ORDER = Object.freeze({
  "old-friend\0old-friend-v1": Object.freeze([
    "conflict",
    "reunion",
    "plans",
    "comfort",
    "gathering",
    "reconnect",
    "memory",
    "travel",
    "celebration",
    "hard-day",
  ]),
});
const STATE_KEYS = [
  "answers",
  "currentPosition",
  "id",
  "managementExpiresAt",
  "managementTtlSeconds",
  "packSlug",
  "packVersion",
  "status",
];
const ANSWER_KEYS = ["cardId", "choice"];

function invalid(message = "Invalid owner play session") {
  throw new Error(message);
}

function hasExactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(value).sort().join("\0") === keys.join("\0")
  );
}

function boundedKebab(value, maximum) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    LOWER_KEBAB.test(value)
  );
}

function isStrictIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return false;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction = "",
    zone,
    sign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.padEnd(3, "0").slice(0, 3));
  const offsetHour = zone === "Z" ? 0 : Number(offsetHourText);
  const offsetMinute = zone === "Z" ? 0 : Number(offsetMinuteText);
  if (
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return false;
  }
  const localEpoch = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  const local = new Date(localEpoch);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    return false;
  }
  const offset =
    zone === "Z"
      ? 0
      : (sign === "+" ? 1 : -1) * (offsetHour * 60 + offsetMinute) * 60_000;
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.valueOf()) && parsed.valueOf() === localEpoch - offset
  );
}

function decodeSecret(encoded) {
  if (typeof encoded !== "string" || !SECRET.test(encoded)) invalid();
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== encoded) {
    invalid();
  }
  return bytes;
}

export function hashOwnerSecret(secretBytes) {
  const bytes = Buffer.from(secretBytes);
  if (bytes.byteLength !== 32) invalid();
  return createHash("sha256").update(DOMAIN_SEPARATOR).update(bytes).digest();
}

export function createOwnerCredential() {
  const playId = randomUUID();
  const secretBytes = randomBytes(32);
  const secret = secretBytes.toString("base64url");
  const value = `${COOKIE_VERSION}.${playId}.${secret}`;
  return Object.freeze({
    playId,
    value,
    managementSecretHash: hashOwnerSecret(secretBytes),
  });
}

export function parseOwnerCookieHeader(header) {
  if (header === null || header === undefined || header === "") {
    return Object.freeze({ outcome: "absent" });
  }
  if (typeof header !== "string")
    return Object.freeze({ outcome: "malformed" });

  const matches = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name === OWNER_COOKIE_NAME)
      matches.push(part.slice(separator + 1).trim());
  }
  if (matches.length === 0) return Object.freeze({ outcome: "absent" });
  if (matches.length !== 1) return Object.freeze({ outcome: "malformed" });

  const pieces = matches[0].split(".");
  if (
    pieces.length !== 3 ||
    pieces[0] !== COOKIE_VERSION ||
    !UUID.test(pieces[1])
  ) {
    return Object.freeze({ outcome: "malformed" });
  }
  try {
    return Object.freeze({
      outcome: "valid",
      playId: pieces[1],
      managementSecretHash: hashOwnerSecret(decodeSecret(pieces[2])),
      value: matches[0],
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

export function serializeOwnerCookie(value, ttlSeconds, expiresAt) {
  if (
    typeof value !== "string" ||
    parseOwnerCookieHeader(`${OWNER_COOKIE_NAME}=${value}`).outcome !==
      "valid" ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > OWNER_MANAGEMENT_TTL_SECONDS
  ) {
    invalid();
  }
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.valueOf())) invalid();
  return `${OWNER_COOKIE_NAME}=${value}; ${cookieAttributes(ttlSeconds, expires)}`;
}

export function serializeDeletedOwnerCookie() {
  return `${OWNER_COOKIE_NAME}=; ${cookieAttributes(0, new Date(0))}`;
}

export function decodeOwnerPlayState(value) {
  if (!hasExactKeys(value, STATE_KEYS)) invalid();
  if (!UUID.test(value.id)) invalid();
  if (
    !boundedKebab(value.packSlug, 64) ||
    !boundedKebab(value.packVersion, 80)
  ) {
    invalid();
  }
  if (value.status !== "draft" && value.status !== "completed") invalid();
  if (
    !Number.isSafeInteger(value.currentPosition) ||
    value.currentPosition < 1 ||
    value.currentPosition > 10
  ) {
    invalid();
  }
  if (value.managementTtlSeconds !== OWNER_MANAGEMENT_TTL_SECONDS) invalid();
  if (
    !isStrictIsoTimestamp(value.managementExpiresAt) ||
    !Array.isArray(value.answers) ||
    value.answers.length > 10
  ) {
    invalid();
  }

  const expectedOrder =
    OWNER_CARD_ORDER[`${value.packSlug}\0${value.packVersion}`];
  if (!expectedOrder) invalid();
  const ids = new Set();
  let previousPosition = -1;
  const answers = value.answers.map((answer) => {
    if (!hasExactKeys(answer, ANSWER_KEYS)) invalid();
    if (!boundedKebab(answer.cardId, 64) || ids.has(answer.cardId)) invalid();
    if (answer.choice !== "a" && answer.choice !== "b") invalid();
    const position = expectedOrder.indexOf(answer.cardId);
    if (position <= previousPosition) invalid();
    ids.add(answer.cardId);
    previousPosition = position;
    return Object.freeze({ cardId: answer.cardId, choice: answer.choice });
  });

  if (value.status === "completed" && answers.length !== 10) invalid();
  return Object.freeze({
    id: value.id,
    packSlug: value.packSlug,
    packVersion: value.packVersion,
    status: value.status,
    currentPosition: value.currentPosition,
    answers: Object.freeze(answers),
    managementExpiresAt: value.managementExpiresAt,
    managementTtlSeconds: value.managementTtlSeconds,
  });
}

const OUTCOME_KEYS = Object.freeze({
  created: ["outcome", "play"],
  resumed: ["outcome", "play"],
  authorized: ["outcome", "play"],
  saved: ["outcome", "play"],
  completed: ["outcome", "play"],
  incomplete: ["outcome", "play"],
  rate_limited: ["outcome", "retryAfterSeconds"],
  pack_not_found: ["outcome"],
  expired: ["outcome"],
  not_found: ["outcome"],
  wrong_pack: ["outcome"],
  invalid_card: ["outcome"],
});

export function decodeOwnerPlayOutcome(value, allowedOutcomes) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.outcome !== "string" ||
    !allowedOutcomes.includes(value.outcome)
  ) {
    invalid();
  }
  const keys = OUTCOME_KEYS[value.outcome];
  if (!keys || !hasExactKeys(value, keys)) invalid();
  if (keys.includes("play")) {
    return Object.freeze({
      outcome: value.outcome,
      play: decodeOwnerPlayState(value.play),
    });
  }
  if (value.outcome === "rate_limited") {
    if (
      !Number.isSafeInteger(value.retryAfterSeconds) ||
      value.retryAfterSeconds < 1
    ) {
      invalid();
    }
    return Object.freeze({
      outcome: value.outcome,
      retryAfterSeconds: value.retryAfterSeconds,
    });
  }
  return Object.freeze({ outcome: value.outcome });
}
