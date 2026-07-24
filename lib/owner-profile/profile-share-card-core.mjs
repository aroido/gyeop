import {
  isRelationshipCode,
  relationshipLabel,
} from "../visitor-response/visitor-context-core.mjs";
import { CONCEPT_COPY_LIMITS } from "../concepts/catalog-core.mjs";

const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PROFILE_SHARE_FILENAME = "gyeop-insight.png";

const CONCEPT_SHARE_CARD_KEYS = Object.freeze([
  "conceptLabel",
  "observation",
  "stageText",
  "evidenceText",
  "question",
  "packTitle",
]);

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function boundedText(value, maximum) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value.length <= maximum
  );
}

export function decodeConceptProfileShareCardModel(value) {
  if (
    !exactKeys(value, CONCEPT_SHARE_CARD_KEYS) ||
    !boundedText(value.conceptLabel, CONCEPT_COPY_LIMITS.conceptLabel) ||
    !boundedText(value.observation, CONCEPT_COPY_LIMITS.observation) ||
    !boundedText(value.evidenceText, CONCEPT_COPY_LIMITS.evidenceText) ||
    !boundedText(value.question, CONCEPT_COPY_LIMITS.question) ||
    !boundedText(value.packTitle, CONCEPT_COPY_LIMITS.packTitle) ||
    (value.stageText !== "윤곽" && value.stageText !== "선명")
  ) {
    throw new Error("Invalid concept profile share card");
  }
  return Object.freeze({ ...value });
}

export function buildProfileShareCardPresentation(model) {
  const sampleCount = model.counts.a + model.counts.b;
  const dominantChoice =
    model.counts.a === model.counts.b
      ? null
      : model.counts.a > model.counts.b
        ? "a"
        : "b";
  const resultState =
    dominantChoice === null
      ? "tie"
      : dominantChoice === model.selfChoice
        ? "match"
        : "mismatch";
  const dominantOption =
    dominantChoice === "a"
      ? model.optionA
      : dominantChoice === "b"
        ? model.optionB
        : null;
  const selfOption = model.selfChoice === "a" ? model.optionA : model.optionB;

  return Object.freeze({
    sampleCount,
    dominantChoice,
    resultState,
    relationshipText: `${model.relationshipLabel} · ${sampleCount}명의 시선`,
    resultText:
      dominantOption === null
        ? "시선이 반으로 갈렸어요"
        : `친구들은 나를 “${dominantOption}”로 더 많이 봤어요`,
    agreementText:
      resultState === "match"
        ? "내 선택도 같아요"
        : resultState === "mismatch"
          ? "내 선택은 달라요"
          : null,
    selfText: `내 선택 · ${selfOption}`,
    questionText: model.prompt,
    distributionText: `A ${model.counts.a}명 · B ${model.counts.b}명`,
  });
}

export function isProfileShareRelationship(value) {
  return isRelationshipCode(value) && value !== "romantic";
}

export function parseProfileShareSelection(relationship, cardId) {
  if (relationship === undefined && cardId === undefined) return undefined;
  if (
    !isProfileShareRelationship(relationship) ||
    typeof cardId !== "string" ||
    cardId.length > 64 ||
    !CARD_ID.test(cardId)
  ) {
    return null;
  }
  return Object.freeze({ relationshipCode: relationship, cardId });
}

export function firstAccountProfileShareSelection(availableLayers) {
  const layer = availableLayers.find(({ relationshipCode }) =>
    isProfileShareRelationship(relationshipCode),
  );
  return layer
    ? Object.freeze({
        playId: layer.playId,
        relationshipCode: layer.relationshipCode,
        cardId: layer.cardId,
      })
    : null;
}

export function buildProfileShareCardModel(profile, selection) {
  if (!selection || !isProfileShareRelationship(selection.relationshipCode)) {
    return null;
  }
  const relationship = profile.relationshipLayers.find(
    (layer) =>
      layer.relationshipCode === selection.relationshipCode &&
      layer.status === "available" &&
      layer.sightCount >= 3,
  );
  const aggregate = relationship?.cards.find(
    (card) =>
      card.cardId === selection.cardId &&
      card.status === "available" &&
      card.sampleCount >= 3,
  );
  const card = profile.cards.find(
    (candidate) => candidate.cardId === selection.cardId,
  );
  if (!aggregate || aggregate.status !== "available" || !card) return null;
  const label = relationshipLabel(selection.relationshipCode);
  if (typeof label !== "string") return null;
  return Object.freeze({
    packTitle: profile.packTitle,
    relationshipLabel: label,
    prompt: card.ownerPrompt,
    optionA: card.optionA,
    optionB: card.optionB,
    selfChoice: card.selfChoice,
    counts: Object.freeze({
      a: aggregate.counts.a,
      b: aggregate.counts.b,
    }),
  });
}
