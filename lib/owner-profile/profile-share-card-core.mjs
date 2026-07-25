import {
  isRelationshipCode,
  relationshipLabel,
} from "../visitor-response/visitor-context-core.mjs";
import { CONCEPT_CATALOG_V1 } from "../concepts/catalog-core.mjs";
import { normalizeOwnerNickname } from "../auth/owner-public-profile-core.mjs";

const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PROFILE_SHARE_FILENAME = "gyeop-insight.png";

const CONCEPT_SHARE_CARD_KEYS = Object.freeze(["axes", "nickname"]);
const CONCEPT_SHARE_AXIS_KEYS = Object.freeze([
  "areaLabel",
  "cardCount",
  "conceptLabel",
  "directionA",
  "directionB",
  "others",
  "selfPosition",
]);
const SETTLED_OTHERS_KEYS = Object.freeze([
  "direction",
  "position",
  "range",
  "source",
  "stage",
]);
const CONTEXTUAL_OTHERS_KEYS = Object.freeze([
  "direction",
  "range",
  "source",
  "stage",
]);

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function finitePosition(value) {
  return Number.isFinite(value) && value >= -1 && value <= 1;
}

function conceptForAxis(axis) {
  const matches = CONCEPT_CATALOG_V1.concepts.filter((concept) => {
    const area = CONCEPT_CATALOG_V1.areas.find(
      ({ id }) => id === concept.areaId,
    );
    return (
      area?.label === axis.areaLabel &&
      concept.label === axis.conceptLabel &&
      concept.directionA === axis.directionA &&
      concept.directionB === axis.directionB
    );
  });
  return matches.length === 1 ? matches[0] : null;
}

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, freeze(item)]),
      ),
    );
  }
  return value;
}

export function decodeConceptProfileShareAxis(value) {
  if (
    !exactKeys(value, CONCEPT_SHARE_AXIS_KEYS) ||
    !conceptForAxis(value) ||
    !finitePosition(value.selfPosition) ||
    Math.abs(value.selfPosition) < 0.25 ||
    !Number.isSafeInteger(value.cardCount) ||
    value.cardCount < 1 ||
    value.cardCount > 240
  ) {
    throw new Error("Invalid concept profile share card");
  }
  const others = value.others;
  if (
    others?.direction === "contextual"
      ? !exactKeys(others, CONTEXTUAL_OTHERS_KEYS) ||
        others.source !== "shareSafeOthers" ||
        !["outline", "clear"].includes(others.stage) ||
        others.range !== "split"
      : !exactKeys(others, SETTLED_OTHERS_KEYS) ||
        others.source !== "shareSafeOthers" ||
        !["a", "b"].includes(others.direction) ||
        !["outline", "clear"].includes(others.stage) ||
        others.range !== (others.stage === "outline" ? "medium" : "narrow") ||
        !finitePosition(others.position) ||
        (others.direction === "a" && others.position > -0.25) ||
        (others.direction === "b" && others.position < 0.25)
  ) {
    throw new Error("Invalid concept profile share card");
  }
  return freeze(value);
}

export function decodeConceptProfileShareCardModel(value) {
  if (
    !exactKeys(value, CONCEPT_SHARE_CARD_KEYS) ||
    normalizeOwnerNickname(value.nickname) !== value.nickname ||
    !Array.isArray(value.axes) ||
    value.axes.length !== 3
  ) {
    throw new Error("Invalid concept profile share card");
  }
  const axes = value.axes.map(decodeConceptProfileShareAxis);
  const conceptIds = axes.map((axis) => conceptForAxis(axis)?.id);
  if (new Set(conceptIds).size !== 3) {
    throw new Error("Invalid concept profile share card");
  }
  return freeze({ nickname: value.nickname, axes });
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
