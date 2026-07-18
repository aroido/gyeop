const SECRET = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

export function parseInviteFragment(fragment) {
  if (typeof fragment !== "string" || !fragment.startsWith("#")) {
    return Object.freeze({ outcome: "invalid" });
  }
  const body = fragment.slice(1);
  if (!body.startsWith("k=") || body.includes("&") || body.includes("%")) {
    return Object.freeze({ outcome: "invalid" });
  }
  const secret = body.slice(2);
  if (!SECRET.test(secret)) return Object.freeze({ outcome: "invalid" });
  return Object.freeze({ outcome: "valid", secret });
}
