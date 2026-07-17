export async function runRateLimitedDomainForTest(input, callback, consume) {
  let result;
  try {
    result = await consume(input);
  } catch {
    return { outcome: "internal_error" };
  }
  if (!result.allowed) {
    return {
      outcome: "rate_limited",
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }
  return { outcome: "allowed", response: await callback() };
}

export async function runAtomicResumeOrCreateForTest(callRpc) {
  let result;
  try {
    result = await callRpc();
  } catch {
    return { outcome: "internal_error" };
  }
  if (!result || typeof result !== "object")
    return { outcome: "internal_error" };
  if (result.outcome === "resumed" || result.outcome === "created") {
    if (!("value" in result)) return { outcome: "internal_error" };
    return Object.freeze({ outcome: result.outcome, value: result.value });
  }
  if (
    result.outcome === "rate_limited" &&
    Number.isSafeInteger(result.retryAfterSeconds) &&
    result.retryAfterSeconds > 0
  ) {
    return Object.freeze({
      outcome: "rate_limited",
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
  return { outcome: "internal_error" };
}
