import { OFFICIAL_PACK_CARD_IDS } from "../packs/official-pack-registry.mjs";

export const OWNER_MANAGEMENT_TTL_SECONDS = 7 * 24 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOWER_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
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

function invalid() {
  throw new Error("Invalid owner play session");
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

export function isOwnerPlayId(value) {
  return typeof value === "string" && UUID.test(value);
}

export function decodeOwnerPlayState(value) {
  if (!hasExactKeys(value, STATE_KEYS)) invalid();
  if (!isOwnerPlayId(value.id)) invalid();
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
    OFFICIAL_PACK_CARD_IDS[`${value.packSlug}\0${value.packVersion}`];
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
