import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { z } from "zod";

import { withPublicRequest } from "../../lib/http/request-boundary.ts";
import { strictJsonObject } from "../../lib/http/strict-json-schema.ts";

const proxySecret = Buffer.alloc(32, 18).toString("base64url");
const rateLimitSecret = Buffer.alloc(32, 19).toString("base64url");
const runtimeEnv = {
  NODE_ENV: "test",
  APP_URL: "http://127.0.0.1:3000",
  ORIGIN_PROXY_SECRET: proxySecret,
  RATE_LIMIT_SECRET: rateLimitSecret,
};

function proxyHeaders(extra = {}) {
  return {
    origin: runtimeEnv.APP_URL,
    "content-type": "application/json",
    "x-forwarded-for": "2001:db8:1234:5678::7",
    "x-forwarded-host": "127.0.0.1",
    "x-forwarded-proto": "https",
    "x-forwarded-port": "443",
    "x-gyeop-origin-verify": proxySecret,
    ...extra,
  };
}

function chunkedRequest(chunks, extraHeaders = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("http://127.0.0.1:3000/api/integration", {
    method: "POST",
    headers: proxyHeaders(extraHeaders),
    body,
    duplex: "half",
  });
}

test("streams a valid proxied request through one boundary before the callback", async () => {
  const schema = strictJsonObject({ value: z.string() });
  let calls = 0;
  const response = await withPublicRequest(
    chunkedRequest(['{"val', 'ue":"겹"}']),
    {
      schema,
      maximumBodyBytes: 64,
      env: runtimeEnv,
      now: new Date("2026-07-18T00:00:00Z"),
    },
    ({ input, networkKey }) => {
      calls += 1;
      assert.deepEqual(input, { value: "겹" });
      assert.equal(networkKey.byteLength, 32);
      return new Response("ok", { status: 201 });
    },
  );

  assert.equal(calls, 1);
  assert.equal(response.status, 201);
  assert.equal(await response.text(), "ok");
  assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000",
  );
});

test("stops an oversized stream before any domain callback and returns the exact safe error", async () => {
  const schema = strictJsonObject({ value: z.string() });
  let calls = 0;
  const response = await withPublicRequest(
    chunkedRequest(['{"value":"', "x".repeat(80), '"}']),
    { schema, maximumBodyBytes: 32, env: runtimeEnv },
    () => {
      calls += 1;
      return new Response("must not run");
    },
  );

  assert.equal(calls, 0);
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    code: "PAYLOAD_TOO_LARGE",
    message: "요청 내용이 너무 큽니다.",
  });
});

test("rejects a spoofed proxy proof before reading a stream", async () => {
  let pulls = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new TextEncoder().encode('{"value":"겹"}'));
      controller.close();
    },
  });
  const spoofedRequest = new Request("http://127.0.0.1:3000/api/integration", {
    method: "POST",
    headers: proxyHeaders({
      "x-gyeop-origin-verify": Buffer.alloc(32, 20).toString("base64url"),
    }),
    body,
    duplex: "half",
  });
  const response = await withPublicRequest(
    spoofedRequest,
    {
      schema: strictJsonObject({ value: z.string() }),
      maximumBodyBytes: 64,
      env: runtimeEnv,
    },
    () => new Response("must not run"),
  );

  assert.equal(
    pulls,
    1,
    "the platform may prefill one chunk without locking the body",
  );
  assert.equal(spoofedRequest.body.locked, false);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "INVALID_REQUEST",
    message: "요청을 확인해 주세요.",
  });
});
