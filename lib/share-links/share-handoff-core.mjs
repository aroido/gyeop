export const SHARE_TITLE = "겹 · 오래된 친구팩";
export const SHARE_TEXT =
  "내가 먼저 답한 오래된 친구팩이야. 너는 나를 어떻게 보는지 3장만 골라줘.";

export function buildShareData(inviteUrl) {
  if (typeof inviteUrl !== "string" || inviteUrl.length === 0) {
    throw new Error("Invalid invite URL");
  }
  return Object.freeze({
    title: SHARE_TITLE,
    text: SHARE_TEXT,
    url: inviteUrl,
  });
}

export function isShareCancellation(error) {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError"
  );
}
