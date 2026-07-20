import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { z } from "zod";

import {
  readBoundedJson,
  validateAppUrl,
  validateProxyRequest,
} from "../../lib/http/http-boundary-core.mjs";
import { errorResponse } from "../../lib/http/errors.ts";
import { withPublicRequest } from "../../lib/http/request-boundary.ts";
import {
  parseStrictJson,
  strictJsonObject,
} from "../../lib/http/strict-json-schema.ts";
import {
  canonicalNetwork,
  deriveNetworkKey,
  parseRateLimitSecret,
} from "../../lib/security/network-key.mjs";
import {
  matchesProxyOriginSecret,
  parseProxyOriginSecret,
} from "../../lib/security/proxy-origin-secret.mjs";

const current = Buffer.alloc(32, 7).toString("base64url");
const secondary = Buffer.alloc(32, 8).toString("base64url");
const rateSecret = Buffer.alloc(32, 9).toString("base64url");

function env(overrides = {}) {
  return {
    NODE_ENV: "test",
    APP_URL: "http://127.0.0.1:3000",
    ORIGIN_PROXY_SECRET: `${current}.${secondary}`,
    RATE_LIMIT_SECRET: rateSecret,
    ...overrides,
  };
}

function headers(overrides = {}) {
  return {
    "content-type": "application/json; charset=utf-8",
    origin: "http://127.0.0.1:3000",
    "x-forwarded-for": "203.0.113.9",
    "x-forwarded-host": "127.0.0.1",
    "x-forwarded-proto": "https",
    "x-forwarded-port": "443",
    "x-gyeop-origin-verify": current,
    ...overrides,
  };
}

function request(body = { name: "겹" }, headerOverrides = {}) {
  return new Request("http://127.0.0.1:3000/api/example", {
    method: "POST",
    headers: headers(headerOverrides),
    body: JSON.stringify(body),
  });
}

test("validates current/secondary proxy credentials without accepting malformed readers", () => {
  const parsed = parseProxyOriginSecret(`${current}.${secondary}`);
  assert.equal(parsed.writer, current);
  assert.equal(matchesProxyOriginSecret(current, parsed.readers), true);
  assert.equal(matchesProxyOriginSecret(secondary, parsed.readers), true);
  assert.equal(
    matchesProxyOriginSecret(
      Buffer.alloc(32, 6).toString("base64url"),
      parsed.readers,
    ),
    false,
  );
  assert.equal(matchesProxyOriginSecret("not-a-secret", parsed.readers), false);

  assert.throws(() => parseProxyOriginSecret(""), /required/);
  assert.throws(
    () => parseProxyOriginSecret(`${current}.${current}`),
    /distinct/,
  );
  assert.throws(
    () => parseProxyOriginSecret(`${current}..${secondary}`),
    /current/,
  );
  assert.throws(() => parseProxyOriginSecret(`${current}=`), /unpadded/);
});

test("rejects spoofed, missing, duplicate-list, and unexpected forwarding headers", () => {
  const valid = new Headers(headers());
  assert.equal(validateProxyRequest(valid, env()).forwardedFor, "203.0.113.9");

  for (const [name, value] of [
    ["x-forwarded-for", "203.0.113.9, 10.0.0.1"],
    ["x-forwarded-host", "evil.example"],
    ["x-forwarded-proto", "http"],
    ["x-forwarded-port", "80"],
    ["x-gyeop-origin-verify", secondary.slice(1)],
    ["forwarded", "for=198.51.100.1"],
    ["x-real-ip", "198.51.100.1"],
    ["x-forwarded-prefix", "/spoofed"],
  ]) {
    const candidate = new Headers(headers({ [name]: value }));
    assert.throws(
      () => validateProxyRequest(candidate, env()),
      /INVALID_REQUEST/,
    );
  }
  const missing = new Headers(headers());
  missing.delete("x-forwarded-host");
  assert.throws(() => validateProxyRequest(missing, env()), /INVALID_REQUEST/);
});

test("accepts only opt-in direct loopback development requests", () => {
  const direct = new Headers({ origin: "http://127.0.0.1:3000" });
  assert.equal(
    validateProxyRequest(
      direct,
      env({ NODE_ENV: "development", GYEOP_LOCAL_DEV_DIRECT: "1" }),
    ).forwardedFor,
    "127.0.0.1",
  );
  assert.equal(
    validateProxyRequest(
      new Headers({
        origin: "http://127.0.0.1:3000",
        "x-forwarded-for": "127.0.0.1",
        "x-forwarded-host": "127.0.0.1:3000",
        "x-forwarded-proto": "http",
        "x-forwarded-port": "3000",
      }),
      env({ NODE_ENV: "development", GYEOP_LOCAL_DEV_DIRECT: "1" }),
    ).forwardedFor,
    "127.0.0.1",
  );
  assert.throws(() => validateProxyRequest(direct, env()), /INVALID_REQUEST/);
  assert.throws(
    () =>
      validateProxyRequest(
        new Headers({
          origin: "http://127.0.0.1:3000",
          "x-forwarded-for": "198.51.100.1",
        }),
        env({ NODE_ENV: "development", GYEOP_LOCAL_DEV_DIRECT: "1" }),
      ),
    /INVALID_REQUEST/,
  );
});

test("validates production and local APP_URL origins", () => {
  assert.equal(
    validateAppUrl("https://gyeop.example", "production").origin,
    "https://gyeop.example",
  );
  assert.equal(
    validateAppUrl("https://gyeop.example:443", "production").origin,
    "https://gyeop.example",
  );
  assert.throws(
    () => validateAppUrl("https://gyeop.example/", "production"),
    /origin only/,
  );
  assert.throws(
    () => validateAppUrl("http://gyeop.example", "production"),
    /HTTPS/,
  );
  assert.throws(
    () => validateAppUrl("http://localhost", "test"),
    /explicit port/,
  );
  assert.throws(
    () => validateAppUrl("http://example.test:3000", "test"),
    /loopback/,
  );
});

test("canonicalizes IPv4, mapped IPv6, IPv6 /64, UTC day, and secret boundaries", () => {
  assert.deepEqual([...canonicalNetwork("192.0.2.10").bytes], [192, 0, 2, 10]);
  assert.deepEqual(
    canonicalNetwork("::ffff:192.0.2.10"),
    canonicalNetwork("192.0.2.10"),
  );
  assert.deepEqual(
    canonicalNetwork("2001:db8:1234:5678::1").bytes,
    canonicalNetwork("2001:db8:1234:5678:ffff::2").bytes,
  );

  const secret = parseRateLimitSecret(rateSecret);
  const first = deriveNetworkKey({
    ip: "2001:db8:1234:5678::1",
    secret,
    now: new Date("2026-07-18T23:59:59Z"),
  });
  const samePrefix = deriveNetworkKey({
    ip: "2001:db8:1234:5678::abcd",
    secret,
    now: new Date("2026-07-18T00:00:00Z"),
  });
  const nextDay = deriveNetworkKey({
    ip: "2001:db8:1234:5678::1",
    secret,
    now: new Date("2026-07-19T00:00:00Z"),
  });
  assert.equal(first.byteLength, 32);
  assert.deepEqual(first, samePrefix);
  assert.notDeepEqual(first, nextDay);
  assert.throws(() => parseRateLimitSecret("short"), /32-byte/);
});

test("only accepts registered strict schemas and rejects unknown keys", () => {
  const schema = strictJsonObject({ name: z.string().min(1) });
  assert.equal(parseStrictJson(schema, { name: "겹" }).success, true);
  assert.equal(
    parseStrictJson(schema, { name: "겹", admin: true }).success,
    false,
  );

  const clone = Object.assign(Object.create(null), schema);
  Object.freeze(clone);
  assert.throws(() => parseStrictJson(clone, { name: "겹" }), /Unregistered/);
  assert.throws(
    () => parseStrictJson(new Proxy(schema, {}), { name: "겹" }),
    /Unregistered/,
  );
});

test("runs the callback only after proxy, Origin, body, UTF-8, JSON, and strict schema checks", async () => {
  const schema = strictJsonObject({ name: z.string().min(1) });
  let calls = 0;
  const response = await withPublicRequest(
    request(),
    {
      schema,
      maximumBodyBytes: 1024,
      env: env(),
      now: new Date("2026-07-18T12:00:00Z"),
    },
    ({ input, networkKey }) => {
      calls += 1;
      assert.deepEqual(input, { name: "겹" });
      assert.equal(networkKey.byteLength, 32);
      return Response.json(
        { ok: true },
        { headers: { "X-Request-ID": "spoof", "Retry-After": "999" } },
      );
    },
  );
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.notEqual(response.headers.get("x-request-id"), "spoof");
  assert.equal(response.headers.get("retry-after"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  for (const invalidRequest of [
    request({ name: "겹" }, { origin: "https://evil.example" }),
    request({ name: "겹" }, { "content-type": "application/problem+json" }),
    request({ name: "겹", extra: true }),
    request({ name: "겹" }, { "x-forwarded-for": "203.0.113.9, 1.1.1.1" }),
  ]) {
    const rejected = await withPublicRequest(
      invalidRequest,
      { schema, maximumBodyBytes: 1024, env: env() },
      () => {
        calls += 1;
        return Response.json({ ok: true });
      },
    );
    assert.ok([400, 403, 415].includes(rejected.status));
  }
  assert.equal(calls, 1);
});

test("enforces declared and streamed byte limits with fatal UTF-8", async () => {
  await assert.rejects(
    readBoundedJson(
      new Request("http://local.test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "too large" }),
      }),
      4,
    ),
    /PAYLOAD_TOO_LARGE/,
  );

  await assert.rejects(
    readBoundedJson(
      new Request("http://local.test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new Uint8Array([0xff]),
      }),
      10,
    ),
    /INVALID_JSON/,
  );
});

test("redacts callback errors, request values, and secrets from the public response", async () => {
  const rawSecret = "private-token-that-must-not-escape";
  const response = await withPublicRequest(
    request({ name: rawSecret }),
    {
      schema: strictJsonObject({ name: z.string() }),
      maximumBodyBytes: 1024,
      env: env(),
    },
    () => {
      throw new Error(`database failed for ${rawSecret}`);
    },
  );
  const body = await response.text();
  assert.equal(response.status, 500);
  assert.doesNotMatch(body, new RegExp(rawSecret));
  assert.doesNotMatch(body, new RegExp(current));
  assert.deepEqual(JSON.parse(body), {
    code: "INTERNAL_ERROR",
    message: "문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  });
});

test("applies private no-store to boundary, input, and domain failures", async () => {
  const schema = strictJsonObject({ name: z.string().min(1) });
  const options = {
    schema,
    maximumBodyBytes: 1024,
    privateNoStore: true,
    env: env(),
  };
  const responses = [
    await withPublicRequest(
      request({ name: "겹" }, { origin: "https://evil.example" }),
      options,
      () => Response.json({ ok: true }),
    ),
    await withPublicRequest(request({ name: "겹", extra: true }), options, () =>
      Response.json({ ok: true }),
    ),
    await withPublicRequest(request(), options, () => {
      throw new Error("rate limiter transport failed");
    }),
    await withPublicRequest(request(), options, () =>
      errorResponse("INTERNAL_ERROR"),
    ),
  ];

  assert.deepEqual(
    responses.map((response) => response.status),
    [403, 400, 500, 500],
  );
  for (const response of responses) {
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});
