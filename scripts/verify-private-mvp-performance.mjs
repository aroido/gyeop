import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

export const LOCAL_PERFORMANCE_TARGET = "http://127.0.0.1:3120";
export const RENDER_PERFORMANCE_TARGET =
  "https://gyeop-private-mvp.onrender.com";

export const PERFORMANCE_BUDGETS = Object.freeze({
  coldStartMs: 35_000,
  homeLcpMedianMs: 2_500,
  warmHomeMedianMs: 2_500,
  packReadP95Ms: 1_000,
  errorRate: 0,
});

export const PERFORMANCE_PROFILE = Object.freeze({
  viewport: Object.freeze({ width: 390, height: 844 }),
  reducedMotion: "reduce",
  network: Object.freeze({
    name: "fast-4g",
    latencyMs: 150,
    downloadBitsPerSecond: 1_600_000,
    uploadBitsPerSecond: 750_000,
  }),
  cpuSlowdown: 4,
});

export const READ_ONLY_HTTP_PLAN = Object.freeze([
  Object.freeze({ metric: "coldStart", method: "HEAD", path: "/" }),
  ...Array.from({ length: 3 }, () =>
    Object.freeze({ metric: "warmHome", method: "GET", path: "/" }),
  ),
  ...Array.from({ length: 20 }, () =>
    Object.freeze({
      metric: "packRead",
      method: "GET",
      path: "/api/packs/old-friend",
    }),
  ),
]);

const SAFE_TOP_LEVEL_KEYS = Object.freeze([
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

export function parsePerformanceTarget(value) {
  if (
    value !== LOCAL_PERFORMANCE_TARGET &&
    value !== RENDER_PERFORMANCE_TARGET
  ) {
    throw new Error(
      `target must be ${LOCAL_PERFORMANCE_TARGET} or ${RENDER_PERFORMANCE_TARGET}`,
    );
  }

  const target = new URL(value);
  if (
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error("target must be an exact approved origin");
  }

  return target.origin;
}

function sortedFiniteSamples(values) {
  return values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .toSorted((left, right) => left - right);
}

export function median(values) {
  const samples = sortedFiniteSamples(values);
  if (samples.length === 0) {
    return null;
  }

  const middle = Math.floor(samples.length / 2);
  if (samples.length % 2 === 1) {
    return samples[middle];
  }

  return (samples[middle - 1] + samples[middle]) / 2;
}

export function nearestRankPercentile(values, percentile) {
  if (!(percentile > 0 && percentile <= 1)) {
    throw new Error("percentile must be greater than zero and at most one");
  }

  const samples = sortedFiniteSamples(values);
  if (samples.length === 0) {
    return null;
  }

  return samples[Math.ceil(samples.length * percentile) - 1];
}

function roundDuration(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function errorRate(results) {
  if (results.length === 0) {
    return 1;
  }

  return results.filter((result) => !result.ok).length / results.length;
}

function sampleDurations(results) {
  return results.map((result) => roundDuration(result.durationMs));
}

export function summarizeLcpSamples(
  samples,
  budgetMs = PERFORMANCE_BUDGETS.homeLcpMedianMs,
) {
  const normalized = samples.map((sample) =>
    Number.isFinite(sample) && sample > 0 ? roundDuration(sample) : null,
  );
  const valid = normalized.filter((sample) => sample !== null);
  const medianMs = roundDuration(median(valid));
  const missingRate = (normalized.length - valid.length) / normalized.length;

  return {
    samplesMs: normalized,
    medianMs,
    errorRate: missingRate,
    passed:
      normalized.length === 3 &&
      missingRate === 0 &&
      medianMs !== null &&
      medianMs <= budgetMs,
  };
}

function summarizeHttpSamples(results, aggregate, budgetMs) {
  const durations = results.map((result) => result.durationMs);
  const aggregateMs =
    aggregate === "median"
      ? median(durations)
      : nearestRankPercentile(durations, 0.95);
  const failures = errorRate(results);

  return {
    samplesMs: sampleDurations(results),
    [`${aggregate}Ms`]: roundDuration(aggregateMs),
    errorRate: failures,
    passed:
      results.length > 0 &&
      failures === PERFORMANCE_BUDGETS.errorRate &&
      aggregateMs !== null &&
      aggregateMs <= budgetMs,
  };
}

export function buildPerformanceResult({
  target,
  coldStartResults,
  lcpSamples,
  warmHomeResults,
  packReadResults,
}) {
  const coldDuration = coldStartResults[0]?.durationMs ?? null;
  const coldFailures = errorRate(coldStartResults);
  const coldStart = {
    samplesMs: sampleDurations(coldStartResults),
    errorRate: coldFailures,
    passed:
      coldStartResults.length === 1 &&
      coldFailures === PERFORMANCE_BUDGETS.errorRate &&
      coldDuration !== null &&
      coldDuration <= PERFORMANCE_BUDGETS.coldStartMs,
  };
  const homeLcp = summarizeLcpSamples(lcpSamples);
  const warmHome = summarizeHttpSamples(
    warmHomeResults,
    "median",
    PERFORMANCE_BUDGETS.warmHomeMedianMs,
  );
  const packRead = summarizeHttpSamples(
    packReadResults,
    "p95",
    PERFORMANCE_BUDGETS.packReadP95Ms,
  );
  const passed = [coldStart, homeLcp, warmHome, packRead].every(
    (metric) => metric.passed,
  );

  const result = {
    schemaVersion: 1,
    target,
    profile: PERFORMANCE_PROFILE,
    budgets: PERFORMANCE_BUDGETS,
    coldStart,
    homeLcp,
    warmHome,
    packRead,
    outcome: passed ? "pass" : "fail",
  };

  if (Object.keys(result).join("\0") !== SAFE_TOP_LEVEL_KEYS.join("\0")) {
    throw new Error("performance result shape changed");
  }

  return result;
}

function safeRequestFailure(error) {
  return error instanceof Error && error.name === "TimeoutError"
    ? "timeout"
    : "network_error";
}

export async function measureReadOnlyRequest(
  target,
  entry,
  { fetchImpl = fetch, timeoutMs = 5_000 } = {},
) {
  if (
    !READ_ONLY_HTTP_PLAN.some(
      (candidate) =>
        candidate.metric === entry.metric &&
        candidate.method === entry.method &&
        candidate.path === entry.path,
    )
  ) {
    throw new Error("request is not in the reviewed read-only plan");
  }

  const startedAt = performance.now();
  try {
    const response = await fetchImpl(new URL(entry.path, target), {
      method: entry.method,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: {
        accept: entry.method === "HEAD" ? "*/*" : "application/json, text/html",
        "cache-control": "no-cache",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (entry.method === "GET") {
      await response.arrayBuffer();
    }

    return {
      durationMs: performance.now() - startedAt,
      ok: response.ok,
      errorCode: response.ok ? null : "http_error",
    };
  } catch (error) {
    return {
      durationMs: performance.now() - startedAt,
      ok: false,
      errorCode: safeRequestFailure(error),
    };
  }
}

export async function measureHttpEntries(target, entries, options = {}) {
  const results = [];
  for (const entry of entries) {
    results.push(await measureReadOnlyRequest(target, entry, options));
  }
  return results;
}

async function measureHomeLcp(browser, target) {
  const context = await browser.newContext({
    viewport: PERFORMANCE_PROFILE.viewport,
    reducedMotion: PERFORMANCE_PROFILE.reducedMotion,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  try {
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: PERFORMANCE_PROFILE.network.latencyMs,
      downloadThroughput: PERFORMANCE_PROFILE.network.downloadBitsPerSecond / 8,
      uploadThroughput: PERFORMANCE_PROFILE.network.uploadBitsPerSecond / 8,
      connectionType: "cellular4g",
    });
    await client.send("Emulation.setCPUThrottlingRate", {
      rate: PERFORMANCE_PROFILE.cpuSlowdown,
    });
    await page.addInitScript(() => {
      window.__gyeopLcpSamples = [];
      try {
        new PerformanceObserver((list) => {
          window.__gyeopLcpSamples.push(
            ...list.getEntries().map((entry) => entry.startTime),
          );
        }).observe({ type: "largest-contentful-paint", buffered: true });
      } catch {
        window.__gyeopLcpSamples = [];
      }
    });
    await page.goto(target, {
      waitUntil: "load",
      timeout: 15_000,
    });
    await page.waitForTimeout(1_500);
    return await page.evaluate(() => {
      const samples = window.__gyeopLcpSamples ?? [];
      return samples.length > 0 ? Math.max(...samples) : null;
    });
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

export async function measureLcpSamples(
  target,
  launch = (options) => chromium.launch(options),
) {
  let browser;
  try {
    browser = await launch({ headless: true });
    const samples = [];
    for (let index = 0; index < 3; index += 1) {
      samples.push(await measureHomeLcp(browser, target));
    }
    return samples;
  } catch {
    return [null, null, null];
  } finally {
    await browser?.close();
  }
}

export async function runPerformanceGate(targetValue) {
  const target = parsePerformanceTarget(targetValue);
  const [coldEntry, ...warmEntries] = READ_ONLY_HTTP_PLAN;
  const coldStartResults = await measureHttpEntries(target, [coldEntry], {
    timeoutMs: PERFORMANCE_BUDGETS.coldStartMs + 1_000,
  });
  const lcpSamples = await measureLcpSamples(target);
  const warmResults = await measureHttpEntries(target, warmEntries);
  const warmHomeResults = warmResults.slice(0, 3);
  const packReadResults = warmResults.slice(3);

  return buildPerformanceResult({
    target,
    coldStartResults,
    lcpSamples,
    warmHomeResults,
    packReadResults,
  });
}

function readTargetArgument(argv) {
  if (argv.length !== 2 || argv[0] !== "--base-url") {
    throw new Error(
      "usage: node scripts/verify-private-mvp-performance.mjs --base-url <approved-origin>",
    );
  }
  return argv[1];
}

async function main() {
  try {
    const target = readTargetArgument(process.argv.slice(2));
    const result = await runPerformanceGate(target);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.outcome !== "pass") {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "performance gate failed"}\n`,
    );
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
