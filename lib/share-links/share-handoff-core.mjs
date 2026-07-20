export function buildShareData(inviteUrl, packTitle) {
  if (
    typeof inviteUrl !== "string" ||
    inviteUrl.length === 0 ||
    typeof packTitle !== "string" ||
    packTitle !== packTitle.trim() ||
    packTitle.length < 1 ||
    packTitle.length > 80
  ) {
    throw new Error("Invalid invite URL");
  }
  return Object.freeze({
    title: `겹 · ${packTitle}`,
    text: `내가 먼저 답한 \"${packTitle}\" 질문이야. 너는 나를 어떻게 보는지 3장만 골라줘.`,
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
