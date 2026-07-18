const RESPONSE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

export const RELATIONSHIP_OPTIONS = Object.freeze([
  Object.freeze({ code: "old_friend", label: "오래된 친구" }),
  Object.freeze({ code: "school_friend", label: "학교 친구" }),
  Object.freeze({ code: "coworker", label: "직장 동료" }),
  Object.freeze({ code: "romantic", label: "썸·연인" }),
  Object.freeze({ code: "family", label: "가족" }),
  Object.freeze({ code: "online_friend", label: "온라인 친구" }),
  Object.freeze({
    code: "social_follower",
    label: "SNS 팔로워·온라인에서만 봄",
  }),
  Object.freeze({ code: "other", label: "기타" }),
]);

export const KNOWN_SINCE_OPTIONS = Object.freeze([
  Object.freeze({ code: "under_one_year", label: "1년 미만이에요" }),
  Object.freeze({
    code: "one_to_three_years",
    label: "1년 이상 · 3년 미만",
  }),
  Object.freeze({
    code: "three_to_five_years",
    label: "3년 이상 · 5년 미만",
  }),
  Object.freeze({
    code: "five_to_ten_years",
    label: "5년 이상 · 10년 미만",
  }),
  Object.freeze({ code: "ten_years_or_more", label: "10년 이상이에요" }),
  Object.freeze({ code: "not_sure", label: "잘 모르겠어요" }),
]);

const relationshipLabels = new Map(
  RELATIONSHIP_OPTIONS.map(({ code, label }) => [code, label]),
);
const knownSinceLabels = new Map(
  KNOWN_SINCE_OPTIONS.map(({ code, label }) => [code, label]),
);

const STATE_KEYS = [
  "assignments",
  "id",
  "knownSinceCode",
  "relationshipCode",
  "sessionExpiresAt",
  "sessionTtlSeconds",
  "status",
];
const HTTP_KEYS = [...STATE_KEYS, "knownSinceLabel", "relationshipLabel"];
const ASSIGNMENT_KEYS = [
  "cardId",
  "isSignature",
  "optionA",
  "optionB",
  "position",
  "stage",
  "visitorPrompt",
];

function invalid() {
  throw new Error("Invalid visitor response state");
}

function hasExactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0")
  );
}

function isTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, fraction = "", zone] = match;
  const [yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue] =
    [year, month, day, hour, minute, second].map(Number);
  const localEpoch = Date.UTC(
    yearValue,
    monthValue - 1,
    dayValue,
    hourValue,
    minuteValue,
    secondValue,
    Number(fraction.padEnd(3, "0").slice(0, 3)),
  );
  const local = new Date(localEpoch);
  if (
    yearValue < 1000 ||
    local.getUTCFullYear() !== yearValue ||
    local.getUTCMonth() !== monthValue - 1 ||
    local.getUTCDate() !== dayValue ||
    local.getUTCHours() !== hourValue ||
    local.getUTCMinutes() !== minuteValue ||
    local.getUTCSeconds() !== secondValue
  ) {
    return false;
  }
  let offset = 0;
  if (zone !== "Z") {
    const sign = zone[0] === "+" ? 1 : -1;
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
    offset = sign * (offsetHour * 60 + offsetMinute) * 60_000;
  }
  return new Date(value).valueOf() === localEpoch - offset;
}

export function isVisitorResponseId(value) {
  return typeof value === "string" && RESPONSE_ID.test(value);
}

export function isRelationshipCode(value) {
  return typeof value === "string" && relationshipLabels.has(value);
}

export function isKnownSinceCode(value) {
  return typeof value === "string" && knownSinceLabels.has(value);
}

export function relationshipLabel(value) {
  if (!isRelationshipCode(value)) invalid();
  return relationshipLabels.get(value);
}

export function knownSinceLabel(value) {
  if (!isKnownSinceCode(value)) invalid();
  return knownSinceLabels.get(value);
}

function reviewedText(value, maximumLength) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximumLength &&
    value === value.trim()
  );
}

export function decodeVisitorAssignment(value) {
  if (
    !hasExactKeys(value, ASSIGNMENT_KEYS) ||
    typeof value.cardId !== "string" ||
    value.cardId.length > 64 ||
    !CARD_ID.test(value.cardId) ||
    value.stage !== "required" ||
    !Number.isSafeInteger(value.position) ||
    value.position < 1 ||
    value.position > 3 ||
    !reviewedText(value.visitorPrompt, 200) ||
    !reviewedText(value.optionA, 120) ||
    !reviewedText(value.optionB, 120) ||
    value.optionA === value.optionB ||
    typeof value.isSignature !== "boolean"
  ) {
    invalid();
  }
  return Object.freeze({
    cardId: value.cardId,
    stage: "required",
    position: value.position,
    visitorPrompt: value.visitorPrompt,
    optionA: value.optionA,
    optionB: value.optionB,
    isSignature: value.isSignature,
  });
}

export function decodeVisitorResponseState(value) {
  if (
    !hasExactKeys(value, STATE_KEYS) ||
    !isVisitorResponseId(value.id) ||
    value.status !== "draft" ||
    !isRelationshipCode(value.relationshipCode) ||
    !isKnownSinceCode(value.knownSinceCode) ||
    !isTimestamp(value.sessionExpiresAt) ||
    !Number.isSafeInteger(value.sessionTtlSeconds) ||
    value.sessionTtlSeconds < 1 ||
    value.sessionTtlSeconds > 86_400
  ) {
    invalid();
  }
  if (!Array.isArray(value.assignments) || value.assignments.length !== 3) {
    invalid();
  }
  const assignments = value.assignments.map(decodeVisitorAssignment);
  if (
    assignments.some(
      (assignment, index) => assignment.position !== index + 1,
    ) ||
    new Set(assignments.map(({ cardId }) => cardId)).size !== 3 ||
    assignments.filter(({ isSignature }) => isSignature).length !== 1 ||
    !assignments[0].isSignature ||
    assignments.slice(1).some(({ isSignature }) => isSignature)
  ) {
    invalid();
  }
  return Object.freeze({
    id: value.id,
    status: "draft",
    relationshipCode: value.relationshipCode,
    knownSinceCode: value.knownSinceCode,
    sessionExpiresAt: value.sessionExpiresAt,
    sessionTtlSeconds: value.sessionTtlSeconds,
    assignments: Object.freeze(assignments),
  });
}

export function visitorResponseHttpState(value) {
  const state = decodeVisitorResponseState(value);
  return Object.freeze({
    ...state,
    relationshipLabel: relationshipLabel(state.relationshipCode),
    knownSinceLabel: knownSinceLabel(state.knownSinceCode),
  });
}

export function decodeVisitorResponseHttpState(value, now = Date.now()) {
  if (!hasExactKeys(value, HTTP_KEYS)) invalid();
  const state = decodeVisitorResponseState({
    id: value.id,
    status: value.status,
    relationshipCode: value.relationshipCode,
    knownSinceCode: value.knownSinceCode,
    sessionExpiresAt: value.sessionExpiresAt,
    sessionTtlSeconds: value.sessionTtlSeconds,
    assignments: value.assignments,
  });
  if (
    value.relationshipLabel !== relationshipLabel(state.relationshipCode) ||
    value.knownSinceLabel !== knownSinceLabel(state.knownSinceCode) ||
    !Number.isFinite(now) ||
    Date.parse(state.sessionExpiresAt) <= now
  ) {
    invalid();
  }
  return Object.freeze({
    ...state,
    relationshipLabel: value.relationshipLabel,
    knownSinceLabel: value.knownSinceLabel,
  });
}
