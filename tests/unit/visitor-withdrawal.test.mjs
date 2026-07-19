import assert from "node:assert/strict";
import test from "node:test";

import {
  VisitorWithdrawalHttpError,
  withdrawVisitorResponse,
} from "../../lib/visitor-management/visitor-withdrawal-client.ts";

const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

test("withdrawal client accepts only an empty private 204", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  try {
    globalThis.fetch = async (url, init) => {
      request = { url, init };
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "private, no-store" },
      });
    };
    assert.equal(await withdrawVisitorResponse(secret), undefined);
    assert.deepEqual(
      [request.url, request.init.method, request.init.body],
      ["/api/responses/withdraw", "POST", JSON.stringify({ token: secret })],
    );
    assert.equal(request.init.credentials, "same-origin");
    assert.equal(request.init.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("withdrawal client preserves terminal and retry-safe error contracts", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json(
        {
          code: "RESPONSE_MANAGEMENT_UNAVAILABLE",
          message: "이 관리 링크는 사용할 수 없어요.",
        },
        {
          status: 404,
          headers: { "cache-control": "private, no-store" },
        },
      );
    await assert.rejects(
      () => withdrawVisitorResponse(secret),
      (error) =>
        error instanceof VisitorWithdrawalHttpError &&
        error.status === 404 &&
        error.code === "RESPONSE_MANAGEMENT_UNAVAILABLE" &&
        error.retryAfterSeconds === null,
    );

    globalThis.fetch = async () =>
      Response.json(
        { code: "RATE_LIMITED", message: "잠시 후 다시 시도해 주세요." },
        {
          status: 429,
          headers: {
            "cache-control": "private, no-store",
            "retry-after": "37",
          },
        },
      );
    await assert.rejects(
      () => withdrawVisitorResponse(secret),
      (error) =>
        error instanceof VisitorWithdrawalHttpError &&
        error.status === 429 &&
        error.retryAfterSeconds === 37,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("withdrawal client rejects malformed capability and response shapes", async () => {
  await assert.rejects(
    () => withdrawVisitorResponse("bad"),
    (error) =>
      error instanceof VisitorWithdrawalHttpError && error.status === 400,
  );

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("unexpected", {
        status: 200,
        headers: { "cache-control": "private, no-store" },
      });
    await assert.rejects(
      () => withdrawVisitorResponse(secret),
      (error) =>
        error instanceof VisitorWithdrawalHttpError &&
        error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
