import {
  consumeRateLimit,
  type ConsumeRateLimitInput,
} from "../db/internal-rpc.ts";
import { errorResponse } from "./errors.ts";
import {
  runAtomicResumeOrCreateForTest,
  runRateLimitedDomainForTest,
} from "./rate-limit-core.mjs";

export async function runRateLimitedDomain(
  input: ConsumeRateLimitInput,
  callback: () => Response | Promise<Response>,
) {
  const result = await runRateLimitedDomainForTest(
    input,
    callback,
    consumeRateLimit,
  );
  if (result.outcome === "allowed") return result.response;
  if (result.outcome === "rate_limited") {
    return errorResponse("RATE_LIMITED", result.retryAfterSeconds);
  }
  return errorResponse("INTERNAL_ERROR");
}

export async function runAtomicResumeOrCreate<Value>(
  callRpc: () => Promise<
    | { outcome: "resumed"; value: Value }
    | { outcome: "created"; value: Value }
    | { outcome: "rate_limited"; retryAfterSeconds: number }
  >,
) {
  return runAtomicResumeOrCreateForTest(callRpc);
}
