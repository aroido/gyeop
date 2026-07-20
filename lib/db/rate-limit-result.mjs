const EXPECTED_KEYS = [
  "allowed",
  "current_count",
  "expires_at",
  "limit_count",
  "retry_after_seconds",
  "window_start",
];

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function decodeRateLimitRow(row) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    Object.keys(row).sort().join("\0") !== EXPECTED_KEYS.join("\0") ||
    typeof row.allowed !== "boolean" ||
    !positiveInteger(row.current_count) ||
    !positiveInteger(row.limit_count) ||
    !positiveInteger(row.retry_after_seconds) ||
    row.allowed !== row.current_count <= row.limit_count ||
    typeof row.window_start !== "string" ||
    typeof row.expires_at !== "string"
  ) {
    throw new Error("Internal rate limit RPC failed");
  }
  const windowStart = Date.parse(row.window_start);
  const expiresAt = Date.parse(row.expires_at);
  if (
    !Number.isFinite(windowStart) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= windowStart
  ) {
    throw new Error("Internal rate limit RPC failed");
  }
  return Object.freeze({
    allowed: row.allowed,
    currentCount: row.current_count,
    limitCount: row.limit_count,
    retryAfterSeconds: row.retry_after_seconds,
    windowStart: row.window_start,
    expiresAt: row.expires_at,
  });
}
