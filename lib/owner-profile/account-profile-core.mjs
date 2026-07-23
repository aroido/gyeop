import { normalizeOwnerNickname } from "../auth/owner-public-profile-core.mjs";
import { isOwnerPlayId } from "../owner-play/owner-play-state-core.mjs";
import { decodeOwnerProfile } from "./owner-profile-core.mjs";

const ROOT_KEYS = [
  "availableLayers",
  "collectingLayers",
  "completedPlayCount",
  "ctaPlayId",
  "nickname",
  "plays",
  "relationshipCount",
  "selfLayers",
  "sightCount",
];
const PLAY_KEYS = ["answeredCount", "id", "packTitle", "status"];
const SELF_KEYS = [
  "cardId",
  "kind",
  "optionA",
  "optionB",
  "packTitle",
  "playId",
  "position",
  "prompt",
  "selfChoice",
];
const AVAILABLE_KEYS = [
  ...SELF_KEYS,
  "counts",
  "relationshipCode",
  "sampleCount",
].sort();
const COLLECTING_KEYS = [
  "kind",
  "packTitle",
  "playId",
  "relationshipCode",
  "sightCount",
  "status",
];
const COUNT_KEYS = ["a", "b"];

function invalid() {
  throw new Error("Invalid account owner profile");
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

function nonEmptyString(value, maximum = 200) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim()
  );
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function decodePlay(value) {
  if (
    !hasExactKeys(value, PLAY_KEYS) ||
    !isOwnerPlayId(value.id) ||
    !nonEmptyString(value.packTitle, 80) ||
    (value.status !== "draft" && value.status !== "completed") ||
    !Number.isInteger(value.answeredCount) ||
    value.answeredCount < 0 ||
    value.answeredCount > 10 ||
    (value.status === "completed" && value.answeredCount !== 10)
  ) {
    invalid();
  }
  return Object.freeze({ ...value });
}

function decodeSelfLayer(value, expectedKind = "self") {
  if (
    !hasExactKeys(value, SELF_KEYS) ||
    value.kind !== expectedKind ||
    !isOwnerPlayId(value.playId) ||
    !nonEmptyString(value.packTitle, 80) ||
    !nonEmptyString(value.cardId, 100) ||
    !Number.isInteger(value.position) ||
    value.position < 1 ||
    value.position > 10 ||
    !nonEmptyString(value.prompt) ||
    !nonEmptyString(value.optionA, 120) ||
    !nonEmptyString(value.optionB, 120) ||
    value.optionA === value.optionB ||
    (value.selfChoice !== "a" && value.selfChoice !== "b")
  ) {
    invalid();
  }
  return Object.freeze({ ...value });
}

function decodeAvailableLayer(value) {
  if (
    !hasExactKeys(value, AVAILABLE_KEYS) ||
    value.kind !== "available" ||
    !nonEmptyString(value.relationshipCode, 80) ||
    !count(value.sampleCount) ||
    value.sampleCount < 3 ||
    !hasExactKeys(value.counts, COUNT_KEYS) ||
    !count(value.counts.a) ||
    !count(value.counts.b) ||
    value.counts.a + value.counts.b !== value.sampleCount
  ) {
    invalid();
  }
  const self = decodeSelfLayer(
    Object.fromEntries(SELF_KEYS.map((key) => [key, value[key]])),
    "available",
  );
  return Object.freeze({
    ...self,
    relationshipCode: value.relationshipCode,
    sampleCount: value.sampleCount,
    counts: Object.freeze({ a: value.counts.a, b: value.counts.b }),
  });
}

function decodeCollectingLayer(value) {
  if (
    !hasExactKeys(value, COLLECTING_KEYS) ||
    value.kind !== "collecting" ||
    value.status !== "collecting" ||
    !isOwnerPlayId(value.playId) ||
    !nonEmptyString(value.packTitle, 80) ||
    !nonEmptyString(value.relationshipCode, 80) ||
    (value.sightCount !== 1 && value.sightCount !== 2)
  ) {
    invalid();
  }
  return Object.freeze({ ...value });
}

export function decodeAccountOwnerProfile(value) {
  if (
    !hasExactKeys(value, ROOT_KEYS) ||
    normalizeOwnerNickname(value.nickname) !== value.nickname ||
    !Array.isArray(value.plays) ||
    !Array.isArray(value.selfLayers) ||
    !Array.isArray(value.availableLayers) ||
    !Array.isArray(value.collectingLayers) ||
    !count(value.completedPlayCount) ||
    !count(value.sightCount) ||
    !count(value.relationshipCount) ||
    (value.ctaPlayId !== null && !isOwnerPlayId(value.ctaPlayId))
  ) {
    invalid();
  }

  const plays = value.plays.map(decodePlay);
  if (new Set(plays.map(({ id }) => id)).size !== plays.length) invalid();
  const completed = plays.filter(({ status }) => status === "completed");
  if (
    completed.length !== value.completedPlayCount ||
    value.ctaPlayId !== (completed[0]?.id ?? null)
  ) {
    invalid();
  }
  const completedIds = new Set(completed.map(({ id }) => id));
  const selfLayers = value.selfLayers.map((layer) => {
    const decoded = decodeSelfLayer(layer);
    if (!completedIds.has(decoded.playId)) invalid();
    return decoded;
  });
  if (
    selfLayers.length !== completed.length ||
    selfLayers.some((layer, index) => layer.playId !== completed[index].id)
  ) {
    invalid();
  }
  const availableLayers = value.availableLayers.map((layer) => {
    const decoded = decodeAvailableLayer(layer);
    if (!completedIds.has(decoded.playId)) invalid();
    return decoded;
  });
  const collectingLayers = value.collectingLayers.map((layer) => {
    const decoded = decodeCollectingLayer(layer);
    if (!completedIds.has(decoded.playId)) invalid();
    return decoded;
  });
  const relationships = new Set(
    [...availableLayers, ...collectingLayers].map(
      ({ relationshipCode }) => relationshipCode,
    ),
  );
  if (
    relationships.size > value.relationshipCount ||
    value.relationshipCount > value.sightCount
  ) {
    invalid();
  }

  return Object.freeze({
    nickname: value.nickname,
    plays: Object.freeze(plays),
    completedPlayCount: value.completedPlayCount,
    sightCount: value.sightCount,
    relationshipCount: value.relationshipCount,
    selfLayers: Object.freeze(selfLayers),
    availableLayers: Object.freeze(availableLayers),
    collectingLayers: Object.freeze(collectingLayers),
    ctaPlayId: value.ctaPlayId,
  });
}

export function buildAccountOwnerProfile({ nickname, plays, profiles }) {
  if (
    normalizeOwnerNickname(nickname) !== nickname ||
    !Array.isArray(plays) ||
    !Array.isArray(profiles)
  ) {
    invalid();
  }
  const completed = plays.filter(({ status }) => status === "completed");
  if (completed.length !== profiles.length) invalid();

  let sightCount = 0;
  const relationships = new Set();
  const selfLayers = [];
  const availableLayers = [];
  const collectingLayers = [];

  profiles.forEach((inputProfile, index) => {
    const summary = completed[index];
    const profile = decodeOwnerProfile(inputProfile);
    if (
      profile.playId !== summary.id ||
      profile.packSlug !== summary.packSlug ||
      profile.packVersion !== summary.packVersion ||
      profile.packTitle !== summary.packTitle
    ) {
      invalid();
    }
    sightCount += profile.sightCount;
    if (!Number.isSafeInteger(sightCount)) invalid();
    const representative = profile.cards[0];
    if (!representative) invalid();
    const base = {
      playId: profile.playId,
      packTitle: profile.packTitle,
      cardId: representative.cardId,
      position: representative.position,
      prompt: representative.ownerPrompt,
      optionA: representative.optionA,
      optionB: representative.optionB,
      selfChoice: representative.selfChoice,
    };
    selfLayers.push({ kind: "self", ...base });

    for (const relationship of profile.relationshipLayers) {
      relationships.add(relationship.relationshipCode);
      if (relationship.status === "collecting") {
        collectingLayers.push({
          kind: "collecting",
          playId: profile.playId,
          packTitle: profile.packTitle,
          relationshipCode: relationship.relationshipCode,
          sightCount: relationship.sightCount,
          status: "collecting",
        });
        continue;
      }
      relationship.cards.forEach((card, cardIndex) => {
        if (card.status !== "available") return;
        const ownerCard = profile.cards[cardIndex];
        availableLayers.push({
          kind: "available",
          playId: profile.playId,
          packTitle: profile.packTitle,
          cardId: ownerCard.cardId,
          position: ownerCard.position,
          prompt: ownerCard.ownerPrompt,
          optionA: ownerCard.optionA,
          optionB: ownerCard.optionB,
          selfChoice: ownerCard.selfChoice,
          relationshipCode: relationship.relationshipCode,
          sampleCount: card.sampleCount,
          counts: { a: card.counts.a, b: card.counts.b },
        });
      });
    }
  });

  return decodeAccountOwnerProfile({
    nickname,
    plays: plays.map(({ id, packTitle, status, answeredCount }) => ({
      id,
      packTitle,
      status,
      answeredCount,
    })),
    completedPlayCount: completed.length,
    sightCount,
    relationshipCount: relationships.size,
    selfLayers,
    availableLayers,
    collectingLayers,
    ctaPlayId: completed[0]?.id ?? null,
  });
}

export async function readOwnerProfilesBounded({
  actor,
  concurrency = 4,
  perProfileDeadlineMs = 8_000,
  playIds,
  readProfile,
  signal,
}) {
  if (
    !actor?.uid ||
    !Array.isArray(playIds) ||
    typeof readProfile !== "function" ||
    !(signal instanceof AbortSignal) ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 4 ||
    !Number.isInteger(perProfileDeadlineMs) ||
    perProfileDeadlineMs < 1
  ) {
    invalid();
  }
  if (playIds.length === 0) return Object.freeze([]);
  const output = new Array(playIds.length);
  const local = new AbortController();
  let nextIndex = 0;
  let failure;

  async function worker() {
    while (!failure && nextIndex < playIds.length) {
      if (signal.aborted) throw signal.reason;
      const index = nextIndex;
      nextIndex += 1;
      const playId = playIds[index];
      if (!isOwnerPlayId(playId)) invalid();
      const profileSignal = AbortSignal.any([
        signal,
        local.signal,
        AbortSignal.timeout(perProfileDeadlineMs),
      ]);
      try {
        output[index] = await readProfile({
          actor,
          playId,
          signal: profileSignal,
        });
      } catch (error) {
        failure = error;
        local.abort(error);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, playIds.length) }, worker),
  );
  if (failure) throw failure;
  if (signal.aborted) throw signal.reason;
  return Object.freeze(output);
}
