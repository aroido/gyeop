import {
  isRelationshipCode,
  relationshipLabel,
} from "../visitor-response/visitor-context-core.mjs";

const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PROFILE_SHARE_FILENAME = "gyeop-insight.png";

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
