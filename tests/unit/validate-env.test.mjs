import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import {
  validateAccountDeleteEnv,
  validateHttpBoundaryEnv,
} from "../../scripts/validate-env.mjs";

function fixture(overrides = {}) {
  const key = Buffer.alloc(32, 7).toString("base64url");
  return {
    ACCOUNT_DELETE_REAUTH_KEYRING: JSON.stringify({ v1: key }),
    ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION: "v1",
    ...overrides,
  };
}

test("accepts a retained 32-byte base64url key", () => {
  assert.deepEqual(validateAccountDeleteEnv(fixture()), {
    activeVersion: "v1",
    versions: ["v1"],
  });
});

test("rejects missing and malformed keyring values", () => {
  assert.throws(() => validateAccountDeleteEnv({}), /KEYRING is required/);
  assert.throws(
    () =>
      validateAccountDeleteEnv(fixture({ ACCOUNT_DELETE_REAUTH_KEYRING: "{" })),
    /must be a JSON object/,
  );
  assert.throws(
    () =>
      validateAccountDeleteEnv(
        fixture({
          ACCOUNT_DELETE_REAUTH_KEYRING: JSON.stringify({ v1: "short" }),
        }),
      ),
    /invalid key/,
  );
});

test("rejects an unknown active version without exposing key material", () => {
  const env = fixture({ ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION: "v2" });
  const rawKey = JSON.parse(env.ACCOUNT_DELETE_REAUTH_KEYRING).v1;

  assert.throws(
    () => validateAccountDeleteEnv(env),
    (error) => {
      assert.match(error.message, /ACTIVE_VERSION/);
      assert.doesNotMatch(error.message, new RegExp(rawKey));
      return true;
    },
  );
});

test("validates HTTP boundary origins and secrets without returning key material", () => {
  const proxy = Buffer.alloc(32, 8).toString("base64url");
  const rate = Buffer.alloc(32, 9).toString("base64url");
  assert.deepEqual(
    validateHttpBoundaryEnv({
      NODE_ENV: "test",
      APP_URL: "http://127.0.0.1:3000",
      ORIGIN_PROXY_SECRET: proxy,
      RATE_LIMIT_SECRET: rate,
    }),
    { appOrigin: "http://127.0.0.1:3000", proxyReaderCount: 1 },
  );
  assert.throws(
    () =>
      validateHttpBoundaryEnv({
        NODE_ENV: "production",
        APP_URL: "http://gyeop.example",
        ORIGIN_PROXY_SECRET: proxy,
        RATE_LIMIT_SECRET: rate,
      }),
    /HTTPS/,
  );
});
