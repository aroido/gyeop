import {
  isKnownSinceCode,
  isRelationshipCode,
  isVisitorResponseId,
} from "../visitor-response/visitor-context-core.mjs";
import { isShareLinkId } from "../share-links/share-link-state-core.mjs";

const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LIST_KEYS = ["responses"];
const ROW_KEYS = [
  "id",
  "knownSinceCode",
  "relationshipCode",
  "shareLinkId",
  "status",
  "submittedAt",
  "withdrawnAt",
];
const COMPARISON_KEYS = [
  "allMatched",
  "assignments",
  "id",
  "knownSinceCode",
  "packTitle",
  "relationshipCode",
  "submittedAt",
];
const ASSIGNMENT_KEYS = [
  "cardId",
  "isHighlight",
  "isSignature",
  "matches",
  "optionA",
  "optionB",
  "ownerChoice",
  "packPosition",
  "position",
  "stage",
  "visitorChoice",
  "visitorPrompt",
];

function invalid() {
  throw new Error("Invalid private one-to-one response");
}

function exact(value, keys) {
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
  const [, y, m, d, hh, mm, ss, fraction = "", zone] = match;
  const parts = [y, m, d, hh, mm, ss].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const localEpoch = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    Number(fraction.padEnd(3, "0").slice(0, 3)),
  );
  const local = new Date(localEpoch);
  if (
    year < 1000 ||
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
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

function text(value, maximum) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value === value.trim()
  );
}

function decodeRow(value) {
  if (
    !exact(value, ROW_KEYS) ||
    !isVisitorResponseId(value.id) ||
    !isShareLinkId(value.shareLinkId) ||
    !isTimestamp(value.submittedAt)
  ) {
    invalid();
  }
  if (value.status === "submitted") {
    if (
      !isRelationshipCode(value.relationshipCode) ||
      !isKnownSinceCode(value.knownSinceCode) ||
      value.withdrawnAt !== null
    ) {
      invalid();
    }
  } else if (value.status === "withdrawn") {
    if (
      value.relationshipCode !== null ||
      value.knownSinceCode !== null ||
      !isTimestamp(value.withdrawnAt)
    ) {
      invalid();
    }
  } else {
    invalid();
  }
  return Object.freeze({ ...value });
}

export function decodePrivateOneToOneList(value) {
  if (!exact(value, LIST_KEYS) || !Array.isArray(value.responses)) invalid();
  const ids = new Set();
  let previous = Number.POSITIVE_INFINITY;
  let previousId = "";
  const responses = value.responses.map((item) => {
    const row = decodeRow(item);
    const submittedAt = new Date(row.submittedAt).valueOf();
    if (
      ids.has(row.id) ||
      submittedAt > previous ||
      (submittedAt === previous && row.id < previousId)
    ) {
      invalid();
    }
    ids.add(row.id);
    previous = submittedAt;
    previousId = row.id;
    return row;
  });
  return Object.freeze({ responses: Object.freeze(responses) });
}

export function decodePrivateOneToOneComparison(value) {
  if (
    !exact(value, COMPARISON_KEYS) ||
    !isVisitorResponseId(value.id) ||
    !text(value.packTitle, 80) ||
    !isRelationshipCode(value.relationshipCode) ||
    !isKnownSinceCode(value.knownSinceCode) ||
    !isTimestamp(value.submittedAt) ||
    typeof value.allMatched !== "boolean" ||
    !Array.isArray(value.assignments) ||
    value.assignments.length < 3 ||
    value.assignments.length > 5
  ) {
    invalid();
  }

  const cardIds = new Set();
  const packPositions = new Set();
  let optionalStarted = false;
  let requiredCount = 0;
  let optionalCount = 0;
  let mismatchCount = 0;
  let highlightCount = 0;
  const assignments = value.assignments.map((assignment) => {
    if (
      !exact(assignment, ASSIGNMENT_KEYS) ||
      typeof assignment.cardId !== "string" ||
      !CARD_ID.test(assignment.cardId) ||
      cardIds.has(assignment.cardId) ||
      !Number.isSafeInteger(assignment.packPosition) ||
      assignment.packPosition < 1 ||
      assignment.packPosition > 10 ||
      packPositions.has(assignment.packPosition) ||
      !text(assignment.visitorPrompt, 200) ||
      !text(assignment.optionA, 120) ||
      !text(assignment.optionB, 120) ||
      assignment.optionA === assignment.optionB ||
      typeof assignment.isSignature !== "boolean" ||
      !["a", "b"].includes(assignment.visitorChoice) ||
      !["a", "b"].includes(assignment.ownerChoice) ||
      typeof assignment.matches !== "boolean" ||
      assignment.matches !==
        (assignment.visitorChoice === assignment.ownerChoice) ||
      typeof assignment.isHighlight !== "boolean" ||
      (assignment.isHighlight && assignment.matches)
    ) {
      invalid();
    }
    if (assignment.stage === "required") {
      if (optionalStarted || assignment.position !== requiredCount + 1) {
        invalid();
      }
      requiredCount += 1;
      if (!assignment.matches) mismatchCount += 1;
      if (assignment.isHighlight) highlightCount += 1;
    } else if (assignment.stage === "optional") {
      optionalStarted = true;
      if (assignment.position !== optionalCount + 1 || assignment.isHighlight) {
        invalid();
      }
      optionalCount += 1;
    } else {
      invalid();
    }
    cardIds.add(assignment.cardId);
    packPositions.add(assignment.packPosition);
    return Object.freeze({ ...assignment });
  });
  if (
    requiredCount !== 3 ||
    optionalCount > 2 ||
    value.allMatched !== (mismatchCount === 0) ||
    highlightCount !== (mismatchCount === 0 ? 0 : 1)
  ) {
    invalid();
  }
  return Object.freeze({ ...value, assignments: Object.freeze(assignments) });
}

function management(value) {
  if (
    value.managementTtlSeconds !== 604800 ||
    !isTimestamp(value.managementExpiresAt)
  ) {
    invalid();
  }
  return Object.freeze({
    managementExpiresAt: value.managementExpiresAt,
    managementTtlSeconds: value.managementTtlSeconds,
  });
}

export function decodeOwnerOneToOneListOutcome(value) {
  if (
    exact(value, ["outcome"]) &&
    ["expired", "not_found"].includes(value.outcome)
  ) {
    return Object.freeze({ outcome: value.outcome });
  }
  if (
    exact(value, ["managementExpiresAt", "managementTtlSeconds", "outcome"]) &&
    value.outcome === "not_completed"
  ) {
    return Object.freeze({ outcome: "not_completed", ...management(value) });
  }
  if (
    exact(value, [
      "managementExpiresAt",
      "managementTtlSeconds",
      "outcome",
      "responses",
    ]) &&
    value.outcome === "listed"
  ) {
    return Object.freeze({
      outcome: "listed",
      ...management(value),
      responses: decodePrivateOneToOneList({ responses: value.responses })
        .responses,
    });
  }
  invalid();
}

export function decodeOwnerOneToOneComparisonOutcome(value) {
  if (
    exact(value, ["outcome"]) &&
    ["expired", "not_found", "response_not_found"].includes(value.outcome)
  ) {
    return Object.freeze({ outcome: value.outcome });
  }
  if (
    exact(value, ["managementExpiresAt", "managementTtlSeconds", "outcome"]) &&
    value.outcome === "not_completed"
  ) {
    return Object.freeze({ outcome: "not_completed", ...management(value) });
  }
  if (
    exact(value, [
      "comparison",
      "managementExpiresAt",
      "managementTtlSeconds",
      "outcome",
    ]) &&
    value.outcome === "authorized"
  ) {
    return Object.freeze({
      outcome: "authorized",
      ...management(value),
      comparison: decodePrivateOneToOneComparison(value.comparison),
    });
  }
  invalid();
}
