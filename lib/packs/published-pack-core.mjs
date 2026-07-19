const ROOT_KEYS = [
  "cards",
  "sensitivity",
  "slug",
  "targetRelationship",
  "title",
  "version",
];
const CARD_KEYS = [
  "id",
  "isSignature",
  "optionA",
  "optionB",
  "ownerPrompt",
  "position",
  "visitorPrompt",
];
const LOWER_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TARGET_RELATIONSHIPS = new Set([
  "old_friend",
  "new_connection",
  "coworker",
  "close_relationship",
]);

function hasExactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(value).sort().join("\0") === keys.join("\0")
  );
}

function boundedString(value, maximum, pattern) {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= 1 &&
    value.length <= maximum &&
    (!pattern || pattern.test(value))
  );
}

function invalid() {
  throw new Error("Invalid published pack");
}

export function decodePublishedPack(value) {
  if (!hasExactKeys(value, ROOT_KEYS)) invalid();
  if (!boundedString(value.slug, 64, LOWER_KEBAB)) invalid();
  if (!boundedString(value.version, 80, LOWER_KEBAB)) invalid();
  if (!boundedString(value.title, 80)) invalid();
  if (!TARGET_RELATIONSHIPS.has(value.targetRelationship)) invalid();
  if (!["low", "medium", "high"].includes(value.sensitivity)) invalid();
  if (!Array.isArray(value.cards) || value.cards.length !== 10) invalid();

  const ids = new Set();
  let signatureCount = 0;
  const cards = value.cards.map((card, index) => {
    if (!hasExactKeys(card, CARD_KEYS)) invalid();
    if (!boundedString(card.id, 64, LOWER_KEBAB) || ids.has(card.id)) invalid();
    if (card.position !== index + 1) invalid();
    if (!boundedString(card.ownerPrompt, 200)) invalid();
    if (!boundedString(card.visitorPrompt, 200)) invalid();
    if (!boundedString(card.optionA, 120)) invalid();
    if (!boundedString(card.optionB, 120) || card.optionA === card.optionB) {
      invalid();
    }
    if (typeof card.isSignature !== "boolean") invalid();
    ids.add(card.id);
    if (card.isSignature) signatureCount += 1;
    return Object.freeze({ ...card });
  });
  if (signatureCount !== 1) invalid();

  return Object.freeze({
    slug: value.slug,
    title: value.title,
    version: value.version,
    targetRelationship: value.targetRelationship,
    sensitivity: value.sensitivity,
    cards: Object.freeze(cards),
  });
}
