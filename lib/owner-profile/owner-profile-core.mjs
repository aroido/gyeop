import {
  isOwnerPlayId,
  OWNER_MANAGEMENT_TTL_SECONDS,
} from "../owner-play/owner-play-state-core.mjs";
import { OFFICIAL_PACK_CARD_IDS } from "../packs/official-pack-registry.mjs";
import {
  isRelationshipCode,
  RELATIONSHIP_OPTIONS,
} from "../visitor-response/visitor-context-core.mjs";

export const OWNER_PROFILE_WATERMARK_KEY = "gyeop-owner-profile-seen-v1";

const LOWER_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const PROFILE_KEYS = [
  "cards",
  "packSlug",
  "packTitle",
  "packVersion",
  "playId",
  "relationshipLayers",
  "sightCount",
  "sightStatus",
];
const CARD_KEYS = [
  "cardId",
  "counts",
  "optionA",
  "optionB",
  "ownerPrompt",
  "position",
  "sampleCount",
  "selfChoice",
];
const COUNT_KEYS = ["a", "b"];
const RELATIONSHIP_LAYER_KEYS = [
  "cards",
  "relationshipCode",
  "sightCount",
  "status",
];
const COLLECTING_RELATIONSHIP_CARD_KEYS = ["cardId", "sampleCount", "status"];
const AVAILABLE_RELATIONSHIP_CARD_KEYS = [
  "cardId",
  "counts",
  "sampleCount",
  "status",
];
const RELATIONSHIP_ORDER = new Map(
  RELATIONSHIP_OPTIONS.map(({ code }, index) => [code, index]),
);
const WATERMARK_KEYS = ["playId", "sightCount", "version"];

function invalid() {
  throw new Error("Invalid owner profile");
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

function boundedString(value, maximum) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value === value.trim()
  );
}

function boundedKebab(value, maximum) {
  return boundedString(value, maximum) && LOWER_KEBAB.test(value);
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isStrictIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return false;
  const [, y, m, d, hh, mm, ss, fraction = "", zone, sign, oh, om] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mm);
  const second = Number(ss);
  const millisecond = Number(fraction.padEnd(3, "0").slice(0, 3));
  const offsetHour = zone === "Z" ? 0 : Number(oh);
  const offsetMinute = zone === "Z" ? 0 : Number(om);
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

function decodeManagement(value) {
  if (
    !isStrictIsoTimestamp(value.managementExpiresAt) ||
    value.managementTtlSeconds !== OWNER_MANAGEMENT_TTL_SECONDS
  ) {
    invalid();
  }
  return Object.freeze({
    managementExpiresAt: value.managementExpiresAt,
    managementTtlSeconds: value.managementTtlSeconds,
  });
}

export function decodeOwnerProfile(value) {
  if (!hasExactKeys(value, PROFILE_KEYS)) invalid();
  const cardIds =
    OFFICIAL_PACK_CARD_IDS[`${value.packSlug}\0${value.packVersion}`];
  if (
    !isOwnerPlayId(value.playId) ||
    !boundedKebab(value.packSlug, 64) ||
    !boundedKebab(value.packVersion, 80) ||
    !cardIds ||
    !boundedString(value.packTitle, 80) ||
    !count(value.sightCount) ||
    !Array.isArray(value.cards) ||
    value.cards.length !== 10
  ) {
    invalid();
  }
  if (
    (value.sightCount === 0 && value.sightStatus !== "empty") ||
    (value.sightCount > 0 && value.sightStatus !== "has_sight")
  ) {
    invalid();
  }

  const cards = value.cards.map((card, index) => {
    if (!hasExactKeys(card, CARD_KEYS)) invalid();
    if (
      card.cardId !== cardIds[index] ||
      card.position !== index + 1 ||
      !boundedString(card.ownerPrompt, 200) ||
      !boundedString(card.optionA, 120) ||
      !boundedString(card.optionB, 120) ||
      card.optionA === card.optionB ||
      (card.selfChoice !== "a" && card.selfChoice !== "b") ||
      !count(card.sampleCount) ||
      (card.sampleCount > 0 && card.sampleCount < 3)
    ) {
      invalid();
    }

    if (card.sampleCount === 0) {
      if (card.counts !== null) invalid();
      return Object.freeze({ ...card, counts: null });
    }
    if (
      !hasExactKeys(card.counts, COUNT_KEYS) ||
      !count(card.counts.a) ||
      !count(card.counts.b) ||
      card.counts.a + card.counts.b !== card.sampleCount
    ) {
      invalid();
    }
    return Object.freeze({
      ...card,
      counts: Object.freeze({ a: card.counts.a, b: card.counts.b }),
    });
  });

  if (!Array.isArray(value.relationshipLayers)) invalid();
  const relationshipCodes = new Set();
  let priorRelationshipIndex = -1;
  let relationshipSightCount = 0;
  const relationshipLayers = value.relationshipLayers.map((layer) => {
    if (
      !hasExactKeys(layer, RELATIONSHIP_LAYER_KEYS) ||
      !isRelationshipCode(layer.relationshipCode) ||
      relationshipCodes.has(layer.relationshipCode) ||
      !count(layer.sightCount) ||
      layer.sightCount === 0 ||
      !Array.isArray(layer.cards)
    ) {
      invalid();
    }
    const relationshipIndex = RELATIONSHIP_ORDER.get(layer.relationshipCode);
    if (
      relationshipIndex === undefined ||
      relationshipIndex <= priorRelationshipIndex
    ) {
      invalid();
    }
    priorRelationshipIndex = relationshipIndex;
    relationshipCodes.add(layer.relationshipCode);
    relationshipSightCount += layer.sightCount;
    if (!Number.isSafeInteger(relationshipSightCount)) invalid();

    if (layer.sightCount < 3) {
      if (layer.status !== "collecting" || layer.cards.length !== 0) invalid();
      return Object.freeze({
        relationshipCode: layer.relationshipCode,
        sightCount: layer.sightCount,
        status: "collecting",
        cards: Object.freeze([]),
      });
    }
    if (layer.status !== "available" || layer.cards.length !== cardIds.length) {
      invalid();
    }
    const relationshipCards = layer.cards.map((card, index) => {
      if (
        card === null ||
        typeof card !== "object" ||
        Array.isArray(card) ||
        card.cardId !== cardIds[index] ||
        !count(card.sampleCount) ||
        card.sampleCount > layer.sightCount
      ) {
        invalid();
      }
      if (card.sampleCount < 3) {
        if (
          !hasExactKeys(card, COLLECTING_RELATIONSHIP_CARD_KEYS) ||
          card.status !== "collecting"
        ) {
          invalid();
        }
        return Object.freeze({
          cardId: card.cardId,
          sampleCount: card.sampleCount,
          status: "collecting",
        });
      }
      if (
        !hasExactKeys(card, AVAILABLE_RELATIONSHIP_CARD_KEYS) ||
        card.status !== "available" ||
        !hasExactKeys(card.counts, COUNT_KEYS) ||
        !count(card.counts.a) ||
        !count(card.counts.b) ||
        card.counts.a + card.counts.b !== card.sampleCount
      ) {
        invalid();
      }
      return Object.freeze({
        cardId: card.cardId,
        sampleCount: card.sampleCount,
        status: "available",
        counts: Object.freeze({ a: card.counts.a, b: card.counts.b }),
      });
    });
    return Object.freeze({
      relationshipCode: layer.relationshipCode,
      sightCount: layer.sightCount,
      status: "available",
      cards: Object.freeze(relationshipCards),
    });
  });

  if (
    relationshipSightCount !== value.sightCount ||
    (value.sightCount === 0) !== (relationshipLayers.length === 0)
  ) {
    invalid();
  }
  for (const [index, card] of cards.entries()) {
    let sampleCount = 0;
    let a = 0;
    let b = 0;
    for (const layer of relationshipLayers) {
      if (layer.status !== "available") continue;
      const relationshipCard = layer.cards[index];
      if (relationshipCard.status !== "available") continue;
      sampleCount += relationshipCard.sampleCount;
      a += relationshipCard.counts.a;
      b += relationshipCard.counts.b;
    }
    if (
      card.sampleCount !== sampleCount ||
      (sampleCount === 0
        ? card.counts !== null
        : card.counts === null || card.counts.a !== a || card.counts.b !== b)
    ) {
      invalid();
    }
  }

  return Object.freeze({
    playId: value.playId,
    packSlug: value.packSlug,
    packVersion: value.packVersion,
    packTitle: value.packTitle,
    sightCount: value.sightCount,
    sightStatus: value.sightStatus,
    cards: Object.freeze(cards),
    relationshipLayers: Object.freeze(relationshipLayers),
  });
}

export function initialOwnerProfileRelationshipCode(relationshipLayers) {
  return (
    relationshipLayers.find((layer) => layer.status === "available")
      ?.relationshipCode ??
    relationshipLayers[0]?.relationshipCode ??
    null
  );
}

export function decodeOwnerProfileOutcome(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.outcome !== "string"
  ) {
    invalid();
  }
  if (value.outcome === "expired" || value.outcome === "not_found") {
    if (!hasExactKeys(value, ["outcome"])) invalid();
    return Object.freeze({ outcome: value.outcome });
  }
  if (value.outcome === "not_completed") {
    if (
      !hasExactKeys(value, [
        "managementExpiresAt",
        "managementTtlSeconds",
        "outcome",
      ])
    ) {
      invalid();
    }
    return Object.freeze({
      outcome: "not_completed",
      ...decodeManagement(value),
    });
  }
  if (value.outcome === "authorized") {
    if (
      !hasExactKeys(value, [
        "managementExpiresAt",
        "managementTtlSeconds",
        "outcome",
        "profile",
      ])
    ) {
      invalid();
    }
    return Object.freeze({
      outcome: "authorized",
      ...decodeManagement(value),
      profile: decodeOwnerProfile(value.profile),
    });
  }
  invalid();
}

export function decodeOwnerProfileEventOutcome(value) {
  if (
    !hasExactKeys(value, ["outcome"]) ||
    ![
      "recorded",
      "expired",
      "not_found",
      "not_completed",
      "not_eligible",
    ].includes(value.outcome)
  ) {
    invalid();
  }
  return Object.freeze({ outcome: value.outcome });
}

export function parseOwnerProfileWatermark(raw) {
  if (raw === null) return Object.freeze({ outcome: "absent" });
  if (typeof raw !== "string") return Object.freeze({ outcome: "invalid" });
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return Object.freeze({ outcome: "invalid" });
  }
  if (
    !hasExactKeys(value, WATERMARK_KEYS) ||
    value.version !== 1 ||
    !isOwnerPlayId(value.playId) ||
    !count(value.sightCount)
  ) {
    return Object.freeze({ outcome: "invalid" });
  }
  return Object.freeze({
    outcome: "valid",
    playId: value.playId,
    sightCount: value.sightCount,
  });
}

export function serializeOwnerProfileWatermark(profile) {
  const decoded = decodeOwnerProfile(profile);
  return JSON.stringify({
    version: 1,
    playId: decoded.playId,
    sightCount: decoded.sightCount,
  });
}

export function deriveOwnerSightNotice(profile, watermark, storageAvailable) {
  const decoded = decodeOwnerProfile(profile);
  if (decoded.sightCount === 0) return "empty";
  if (!storageAvailable || watermark.outcome === "invalid") return "existing";
  if (watermark.outcome === "absent") return "new";
  if (
    watermark.playId === decoded.playId &&
    watermark.sightCount < decoded.sightCount
  ) {
    return "new";
  }
  return "existing";
}
