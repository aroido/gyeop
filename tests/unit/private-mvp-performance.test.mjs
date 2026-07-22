import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import {
  LOCAL_PERFORMANCE_TARGET,
  READ_ONLY_HTTP_PLAN,
  RENDER_PERFORMANCE_TARGET,
  buildPerformanceResult,
  isApprovedBrowserRequest,
  measureHttpEntries,
  measureReadOnlyRequest,
  median,
  nearestRankPercentile,
  parsePerformanceTarget,
  summarizeLcpSamples,
} from "../../scripts/verify-private-mvp-performance.mjs";

test("allows only same-origin browser GET and HEAD requests", () => {
  assert.equal(
    isApprovedBrowserRequest(
      LOCAL_PERFORMANCE_TARGET,
      "GET",
      `${LOCAL_PERFORMANCE_TARGET}/_next/static/app.js`,
    ),
    true,
  );
  assert.equal(
    isApprovedBrowserRequest(
      RENDER_PERFORMANCE_TARGET,
      "HEAD",
      `${RENDER_PERFORMANCE_TARGET}/api/packs/old-friend`,
    ),
    true,
  );
  assert.equal(
    isApprovedBrowserRequest(
      RENDER_PERFORMANCE_TARGET,
      "POST",
      `${RENDER_PERFORMANCE_TARGET}/api/plays`,
    ),
    false,
  );
  assert.equal(
    isApprovedBrowserRequest(
      RENDER_PERFORMANCE_TARGET,
      "GET",
      "https://example.com/analytics.js",
    ),
    false,
  );
  assert.equal(
    isApprovedBrowserRequest(RENDER_PERFORMANCE_TARGET, "GET", "not-a-url"),
    false,
  );
});

test("accepts only the dedicated local port and exact Render Free origin", () => {
  assert.equal(
    parsePerformanceTarget(LOCAL_PERFORMANCE_TARGET),
    LOCAL_PERFORMANCE_TARGET,
  );
  assert.equal(
    parsePerformanceTarget(RENDER_PERFORMANCE_TARGET),
    RENDER_PERFORMANCE_TARGET,
  );

  for (const target of [
    "http://localhost:3120",
    "http://127.0.0.1:3110",
    "http://127.0.0.1:3120/path",
    "http://user:pass@127.0.0.1:3120",
    "http://[::1]:3120",
    "https://gyeop-private-mvp.onrender.com/?probe=1",
    "https://example.com",
  ]) {
    assert.throws(() => parsePerformanceTarget(target));
  }
});

test("uses deterministic median and nearest-rank p95 calculations", () => {
  assert.equal(median([30, 10, 20]), 20);
  assert.equal(median([40, 10, 30, 20]), 25);
  assert.equal(nearestRankPercentile([1, 2, 3, 4, 5], 0.95), 5);
  assert.equal(
    nearestRankPercentile(
      Array.from({ length: 20 }, (_, index) => index + 1),
      0.95,
    ),
    19,
  );
});

test("fails closed when any browser navigation has no positive LCP", () => {
  assert.deepEqual(summarizeLcpSamples([1_100, null, 1_300]), {
    samplesMs: [1_100, null, 1_300],
    medianMs: 1_200,
    errorRate: 1 / 3,
    passed: false,
  });
  assert.equal(summarizeLcpSamples([1_100, 1_200, 1_300]).passed, true);
  assert.equal(summarizeLcpSamples([2_600, 2_700, 2_800]).passed, false);
});

test("rejects any request outside the fixed read-only plan before fetch", async () => {
  let calls = 0;
  await assert.rejects(
    measureReadOnlyRequest(
      LOCAL_PERFORMANCE_TARGET,
      { metric: "write", method: "POST", path: "/api/plays" },
      {
        fetchImpl: async () => {
          calls += 1;
          throw new Error("must not run");
        },
      },
    ),
  );
  assert.equal(calls, 0);
});

test("runs the exact HEAD and GET sequence against a body-free local fixture", async (t) => {
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
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      response.end('{"ok":true}');
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

  const results = await measureHttpEntries(
    LOCAL_PERFORMANCE_TARGET,
    READ_ONLY_HTTP_PLAN,
  );
  assert.equal(results.length, 24);
  assert.equal(
    results.every((result) => result.ok),
    true,
  );
  assert.deepEqual(
    requests.map(({ method, path }) => ({ method, path })),
    READ_ONLY_HTTP_PLAN.map(({ method, path }) => ({ method, path })),
  );
  assert.equal(
    requests.every((request) => request.bodyBytes === 0),
    true,
  );
  assert.equal(
    requests.every((request) => request.cacheControl === "no-cache"),
    true,
  );

  const result = buildPerformanceResult({
    target: LOCAL_PERFORMANCE_TARGET,
    coldStartResults: results.slice(0, 1),
    lcpSamples: [1_100, 1_200, 1_300],
    warmHomeResults: results.slice(1, 4),
    packReadResults: results.slice(4),
  });
  assert.equal(result.outcome, "pass");
  assert.deepEqual(Object.keys(result), [
    "schemaVersion",
    "target",
    "profile",
    "budgets",
    "coldStart",
    "homeLcp",
    "warmHome",
    "packRead",
    "outcome",
  ]);
});
