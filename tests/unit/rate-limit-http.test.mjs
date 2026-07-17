import assert from "node:assert/strict";
import test from "node:test";

import { decodeRateLimitRow } from "../../lib/db/rate-limit-result.mjs";
import {
  errorResponse,
  finalizeBoundaryResponse,
} from "../../lib/http/errors.ts";
import {
  runAtomicResumeOrCreateForTest,
  runRateLimitedDomainForTest,
} from "../../lib/http/rate-limit-core.mjs";

function row(overrides = {}) {
  return {
    allowed: true,
    current_count: 1,
    limit_count: 5,
    retry_after_seconds: 60,
    window_start: "2026-07-18T00:00:00.000Z",
    expires_at: "2026-07-18T00:01:00.000Z",
    ...overrides,
  };
}

test("strictly decodes the exact rate-limit row without coercion", () => {
  assert.deepEqual(decodeRateLimitRow(row()), {
    allowed: true,
    currentCount: 1,
    limitCount: 5,
    retryAfterSeconds: 60,
    windowStart: "2026-07-18T00:00:00.000Z",
    expiresAt: "2026-07-18T00:01:00.000Z",
  });
  assert.equal(
    decodeRateLimitRow(row({ allowed: false, current_count: 6 })).allowed,
    false,
  );

  for (const invalid of [
    row({ allowed: "false" }),
    row({ allowed: false, current_count: 2 }),
    row({ current_count: 1.5 }),
    row({ retry_after_seconds: 0 }),
    row({ expires_at: "not-a-date" }),
    row({ extra: true }),
  ]) {
    assert.throws(
      () => decodeRateLimitRow(invalid),
      /Internal rate limit RPC failed/,
    );
  }
});

test("calls the limiter before the domain and maps over-limit without a callback", async () => {
  const order = [];
  const allowed = await runRateLimitedDomainForTest(
    { action: "save" },
    async () => {
      order.push("domain");
      return "ok";
    },
    async () => {
      order.push("limit");
      return { allowed: true, retryAfterSeconds: 3 };
    },
  );
  assert.deepEqual(order, ["limit", "domain"]);
  assert.deepEqual(allowed, { outcome: "allowed", response: "ok" });

  let calls = 0;
  const limited = await runRateLimitedDomainForTest(
    {},
    () => {
      calls += 1;
    },
    async () => ({ allowed: false, retryAfterSeconds: 17 }),
  );
  assert.equal(calls, 0);
  assert.deepEqual(limited, { outcome: "rate_limited", retryAfterSeconds: 17 });
  assert.deepEqual(
    await runRateLimitedDomainForTest(
      {},
      () => {},
      async () => {
        throw new Error("secret database detail");
      },
    ),
    { outcome: "internal_error" },
  );
});

test("atomic resume/create adapter makes exactly one RPC call and validates discriminants", async () => {
  let calls = 0;
  const resumed = await runAtomicResumeOrCreateForTest(async () => {
    calls += 1;
    return { outcome: "resumed", value: { id: "same" } };
  });
  assert.equal(calls, 1);
  assert.deepEqual(resumed, { outcome: "resumed", value: { id: "same" } });

  assert.deepEqual(
    await runAtomicResumeOrCreateForTest(async () => ({
      outcome: "rate_limited",
      retryAfterSeconds: 9,
    })),
    { outcome: "rate_limited", retryAfterSeconds: 9 },
  );
  assert.deepEqual(
    await runAtomicResumeOrCreateForTest(async () => ({ outcome: "created" })),
    { outcome: "internal_error" },
  );
});

test("only a boundary-owned rate-limit response keeps Retry-After", () => {
  const limited = finalizeBoundaryResponse(
    errorResponse("RATE_LIMITED", 17),
    "00000000-0000-4000-8000-000000000000",
    {},
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "17");

  const forged = finalizeBoundaryResponse(
    new Response(null, { status: 429, headers: { "Retry-After": "999" } }),
    "00000000-0000-4000-8000-000000000001",
    {},
  );
  assert.equal(forged.headers.get("retry-after"), null);
});

test("keeps the reviewed status, code, and Korean message registry exact", async () => {
  const expected = [
    ["INVALID_REQUEST", 400, "요청을 확인해 주세요."],
    ["INVALID_ORIGIN", 403, "허용되지 않은 요청입니다."],
    ["UNSUPPORTED_MEDIA_TYPE", 415, "JSON 형식으로 보내 주세요."],
    ["PAYLOAD_TOO_LARGE", 413, "요청 내용이 너무 큽니다."],
    ["INVALID_JSON", 400, "요청 내용을 읽을 수 없습니다."],
    ["INVALID_INPUT", 400, "입력 내용을 확인해 주세요."],
    ["INTERNAL_ERROR", 500, "문제가 발생했습니다. 잠시 후 다시 시도해 주세요."],
  ];
  for (const [code, status, message] of expected) {
    const response = errorResponse(code);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { code, message });
  }
  const limited = errorResponse("RATE_LIMITED", 1);
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), {
    code: "RATE_LIMITED",
    message: "잠시 후 다시 시도해 주세요.",
  });
});
