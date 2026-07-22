import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import {
  FORBIDDEN_DORMANT_FILES,
  LOCAL_SECURITY_TARGET,
  READ_ONLY_SECURITY_PLAN,
  RENDER_SECURITY_TARGET,
  REQUIRED_ACTIVE_SURFACES,
  measureReadOnlySecurity,
  parseSecurityTarget,
  readSecurityTargetArgument,
  runSecurityGate,
  verifyActiveSurfaces,
  verifyInactiveFeatures,
  verifyRepositorySecrets,
} from "../../scripts/verify-private-mvp-security.mjs";

const root = new URL("../../", import.meta.url);

test("accepts only the exact local and Render Free origins", () => {
  assert.equal(
    parseSecurityTarget(LOCAL_SECURITY_TARGET),
    LOCAL_SECURITY_TARGET,
  );
  assert.equal(
    parseSecurityTarget(RENDER_SECURITY_TARGET),
    RENDER_SECURITY_TARGET,
  );
  for (const target of [
    "http://localhost:3120",
    "http://127.0.0.1:3110",
    "http://127.0.0.1:3120/path",
    "http://user:pass@127.0.0.1:3120",
    "https://gyeop-private-mvp.onrender.com/?probe=1",
    "https://example.com",
  ]) {
    assert.throws(() => parseSecurityTarget(target));
  }
});

test("accepts only an empty CLI or one exact base URL argument", () => {
  assert.equal(readSecurityTargetArgument([]), null);
  assert.equal(
    readSecurityTargetArgument(["--base-url", RENDER_SECURITY_TARGET]),
    RENDER_SECURITY_TARGET,
  );
  for (const argv of [
    ["--base-url"],
    [RENDER_SECURITY_TARGET],
    ["--target", RENDER_SECURITY_TARGET],
    ["--base-url", RENDER_SECURITY_TARGET, "extra"],
  ]) {
    assert.throws(() => readSecurityTargetArgument(argv), /usage:/);
  }
});

test("requires the exact active and dormant inventories", () => {
  const active = new Set(REQUIRED_ACTIVE_SURFACES);
  assert.equal(verifyActiveSurfaces((file) => active.has(file)).passed, true);
  active.delete(REQUIRED_ACTIVE_SURFACES[0]);
  assert.deepEqual(
    verifyActiveSurfaces((file) => active.has(file)),
    {
      passed: false,
      findingCount: 1,
      codes: [`missing_active_surface:${REQUIRED_ACTIVE_SURFACES[0]}`],
    },
  );

  assert.equal(verifyInactiveFeatures(() => false, {}).passed, true);
  const forbidden = FORBIDDEN_DORMANT_FILES[0];
  assert.deepEqual(
    verifyInactiveFeatures((file) => file === forbidden, {
      dependencies: { resend: "1.0.0" },
    }),
    {
      passed: false,
      findingCount: 2,
      codes: [
        `forbidden_dormant_file:${forbidden}`,
        "forbidden_email_dependency:resend",
      ],
    },
  );
});

test("rejects non-empty example secrets and CI secret injection", () => {
  const validExample = [
    "SUPABASE_SECRET_KEY=",
    "ORIGIN_PROXY_SECRET=",
    "RATE_LIMIT_SECRET=",
    "ACCOUNT_DELETE_REAUTH_KEYRING=",
    "ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION=",
  ].join("\n");
  assert.equal(verifyRepositorySecrets(validExample, "name: CI").passed, true);

  const result = verifyRepositorySecrets(
    validExample.replace("RATE_LIMIT_SECRET=", "RATE_LIMIT_SECRET=leaked"),
    "env:\n  SUPABASE_SECRET_KEY: placeholder",
  );
  assert.deepEqual(result, {
    passed: false,
    findingCount: 2,
    codes: [
      "ci_secret_injection:SUPABASE_SECRET_KEY",
      "nonempty_example_secret:RATE_LIMIT_SECRET",
    ],
  });
});

test("fails closed on status, header, and network errors", async () => {
  let call = 0;
  const result = await measureReadOnlySecurity(LOCAL_SECURITY_TARGET, {
    fetchImpl: async () => {
      call += 1;
      if (call === 2) throw new Error("network detail must stay private");
      return new Response(null, {
        status: 503,
        headers: {
          "content-security-policy": "default-src 'self'",
          "strict-transport-security": "max-age=31536000",
          "referrer-policy": "no-referrer",
        },
      });
    },
  });
  assert.equal(result.passed, false);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.codes, [
    "response_contract_failed:HEAD",
    "request_failed:GET",
  ]);
  assert.equal(JSON.stringify(result).includes("network detail"), false);
});

test("sends only the fixed body-free HEAD and GET plan", async (t) => {
  const requests = [];
  const server = http.createServer((request, response) => {
    let bodyBytes = 0;
    request.on("data", (chunk) => {
      bodyBytes += chunk.length;
    });
    request.on("end", () => {
      requests.push({
        method: request.method,
        path: request.url,
        bodyBytes,
        cacheControl: request.headers["cache-control"],
      });
      response.writeHead(200, {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : '{"ok":true}');
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(3120, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );

  const result = await measureReadOnlySecurity(LOCAL_SECURITY_TARGET);
  assert.equal(result.passed, true);
  assert.deepEqual(
    requests.map(({ method, path }) => ({ method, path })),
    READ_ONLY_SECURITY_PLAN,
  );
  assert.equal(
    requests.every(({ bodyBytes }) => bodyBytes === 0),
    true,
  );
  assert.equal(
    requests.every(({ cacheControl }) => cacheControl === "no-cache"),
    true,
  );
});

test("the current repository gate passes with a fixed result schema", async () => {
  const result = await runSecurityGate({ root: root.pathname });
  assert.equal(result.outcome, "pass");
  assert.deepEqual(Object.keys(result), [
    "schemaVersion",
    "target",
    "checks",
    "outcome",
  ]);
  assert.deepEqual(Object.keys(result.checks), [
    "dataAccess",
    "httpBoundary",
    "zeroCost",
    "activeSurfaces",
    "inactiveFeatures",
    "repositorySecrets",
    "renderReadOnly",
  ]);
  assert.deepEqual(result.checks.renderReadOnly, {
    passed: true,
    status: "not_run",
    requestCount: 0,
    codes: [],
    responses: [],
  });
});
