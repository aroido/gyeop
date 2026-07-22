const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9]+(?: [가-힣A-Za-z0-9]+)*$/u;

function hasExactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0")
  );
}

export function normalizeOwnerNickname(value) {
  if (typeof value !== "string") return null;
  const nickname = value.normalize("NFKC");
  const length = [...nickname].length;
  if (length < 2 || length > 12 || !NICKNAME_PATTERN.test(nickname)) {
    return null;
  }
  return nickname;
}

export function decodeOwnerPublicProfileOutcome(value) {
  if (hasExactKeys(value, ["outcome"]) && value.outcome === "incomplete") {
    return Object.freeze({ outcome: "incomplete" });
  }
  if (
    !hasExactKeys(value, ["nickname", "outcome"]) ||
    (value.outcome !== "complete" && value.outcome !== "saved") ||
    normalizeOwnerNickname(value.nickname) !== value.nickname
  ) {
    throw new Error("Invalid owner public profile response");
  }
  return Object.freeze({ outcome: value.outcome, nickname: value.nickname });
}
