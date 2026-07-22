import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  collectRepositoryPolicyFiles,
  verifyDataAccessFiles,
} from "./verify-data-access.mjs";
import { verifyRepository as verifyHttpBoundaryRepository } from "./verify-http-boundary.mjs";
import { verifyZeroCostMvp } from "./verify-zero-cost-mvp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const LOCAL_SECURITY_TARGET = "http://127.0.0.1:3120";
export const RENDER_SECURITY_TARGET = "https://gyeop-private-mvp.onrender.com";

export const READ_ONLY_SECURITY_PLAN = Object.freeze([
  Object.freeze({ method: "HEAD", path: "/" }),
  Object.freeze({ method: "GET", path: "/api/packs/old-friend" }),
]);

export const REQUIRED_ACTIVE_SURFACES = Object.freeze([
  "app/auth/google/route.ts",
  "app/auth/callback/route.ts",
  "app/api/auth/logout/route.ts",
  "app/api/packs/[slug]/route.ts",
  "app/api/plays/route.ts",
  "app/api/plays/[playId]/route.ts",
  "app/api/plays/[playId]/answers/[cardId]/route.ts",
  "app/api/plays/[playId]/complete/route.ts",
  "app/api/plays/[playId]/links/route.ts",
  "app/api/links/[linkId]/route.ts",
  "app/api/links/[linkId]/rotate/route.ts",
  "app/api/invites/[publicId]/metadata/route.ts",
  "app/api/invites/[publicId]/responses/route.ts",
  "app/api/responses/[id]/route.ts",
  "app/api/responses/[id]/answers/[cardId]/route.ts",
  "app/api/responses/[id]/continue/route.ts",
  "app/api/responses/[id]/submit/route.ts",
  "app/api/responses/withdraw/route.ts",
  "app/api/me/plays/route.ts",
  "app/api/me/profile/route.ts",
]);

export const FORBIDDEN_DORMANT_FILES = Object.freeze([
  "app/api/internal/cron/route.ts",
  "app/api/internal/cron/[task]/route.ts",
  "app/api/account/delete/route.ts",
  "app/api/me/account/delete/route.ts",
  "app/api/auth/account-delete/route.ts",
  "scripts/cron-dispatcher.mjs",
  "scripts/notification-worker.mjs",
  "scripts/account-delete-worker.mjs",
  "scripts/auth-deletion-worker.mjs",
]);

export const FORBIDDEN_EMAIL_DEPENDENCIES = Object.freeze([
  "resend",
  "nodemailer",
  "@sendgrid/mail",
]);

export const SERVER_ONLY_EXAMPLE_KEYS = Object.freeze([
  "SUPABASE_SECRET_KEY",
  "ORIGIN_PROXY_SECRET",
  "RATE_LIMIT_SECRET",
  "ACCOUNT_DELETE_REAUTH_KEYRING",
  "ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION",
]);

function checkResult(codes = []) {
  return {
    passed: codes.length === 0,
    findingCount: codes.length,
    codes,
  };
}

function policyResult(run) {
  try {
    const findings = run();
    if (findings.length > 0) {
      return {
        passed: false,
        findingCount: findings.length,
        codes: ["policy_findings"],
      };
    }
    return checkResult();
  } catch {
    return {
      passed: false,
      findingCount: 1,
      codes: ["verification_error"],
    };
  }
}

export function parseSecurityTarget(value) {
  if (value !== LOCAL_SECURITY_TARGET && value !== RENDER_SECURITY_TARGET) {
    throw new Error(
      `target must be ${LOCAL_SECURITY_TARGET} or ${RENDER_SECURITY_TARGET}`,
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

export function verifyActiveSurfaces(fileExists) {
  const codes = REQUIRED_ACTIVE_SURFACES.filter(
    (relativePath) => !fileExists(relativePath),
  ).map((relativePath) => `missing_active_surface:${relativePath}`);
  return checkResult(codes);
}

export function verifyInactiveFeatures(fileExists, packageJson) {
  const codes = FORBIDDEN_DORMANT_FILES.filter((relativePath) =>
    fileExists(relativePath),
  ).map((relativePath) => `forbidden_dormant_file:${relativePath}`);
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies,
    ...packageJson.peerDependencies,
  };
  for (const dependency of FORBIDDEN_EMAIL_DEPENDENCIES) {
    if (Object.hasOwn(dependencies, dependency)) {
      codes.push(`forbidden_email_dependency:${dependency}`);
    }
  }
  return checkResult(codes);
}

function readExampleAssignments(envExample) {
  const assignments = new Map();
  for (const rawLine of envExample.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) assignments.set(match[1], match[2]);
  }
  return assignments;
}

export function verifyRepositorySecrets(envExample, workflows) {
  const assignments = readExampleAssignments(envExample);
  const codes = [];
  for (const key of SERVER_ONLY_EXAMPLE_KEYS) {
    if (!assignments.has(key)) {
      codes.push(`missing_example_secret:${key}`);
    } else if (assignments.get(key) !== "") {
      codes.push(`nonempty_example_secret:${key}`);
    }
    if (new RegExp(`^\\s*${key}\\s*:`, "m").test(workflows)) {
      codes.push(`ci_secret_injection:${key}`);
    }
  }
  return checkResult(codes);
}

function responseHeaderState(response) {
  return {
    contentSecurityPolicy: Boolean(
      response.headers.get("content-security-policy"),
    ),
    strictTransportSecurity: Boolean(
      response.headers.get("strict-transport-security"),
    ),
    referrerPolicy: response.headers.get("referrer-policy") === "no-referrer",
    xContentTypeOptions:
      response.headers.get("x-content-type-options") === "nosniff",
  };
}

export async function measureReadOnlySecurity(
  target,
  { fetchImpl = fetch } = {},
) {
  const approvedTarget = parseSecurityTarget(target);
  const responses = [];
  const codes = [];

  for (const entry of READ_ONLY_SECURITY_PLAN) {
    try {
      const response = await fetchImpl(new URL(entry.path, approvedTarget), {
        method: entry.method,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(15_000),
      });
      const headers = responseHeaderState(response);
      const passed =
        response.status === 200 && Object.values(headers).every(Boolean);
      responses.push({
        method: entry.method,
        path: entry.path,
        status: response.status,
        headers,
        passed,
      });
      if (!passed) codes.push(`response_contract_failed:${entry.method}`);
      if (entry.method === "GET") await response.arrayBuffer();
    } catch {
      responses.push({
        method: entry.method,
        path: entry.path,
        status: null,
        headers: {
          contentSecurityPolicy: false,
          strictTransportSecurity: false,
          referrerPolicy: false,
          xContentTypeOptions: false,
        },
        passed: false,
      });
      codes.push(`request_failed:${entry.method}`);
    }
  }

  return {
    passed: codes.length === 0,
    status: codes.length === 0 ? "passed" : "failed",
    requestCount: responses.length,
    codes,
    responses,
  };
}

function notRunResult() {
  return {
    passed: true,
    status: "not_run",
    requestCount: 0,
    codes: [],
    responses: [],
  };
}

export async function runSecurityGate({
  root = ROOT,
  target = null,
  fetchImpl = fetch,
} = {}) {
  const fileExists = (relativePath) =>
    existsSync(path.join(root, relativePath));
  const packageJson = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const envExample = readFileSync(path.join(root, ".env.example"), "utf8");
  const workflows = [
    ".github/workflows/ci.yml",
    ".github/workflows/nightly.yml",
  ]
    .map((relativePath) => readFileSync(path.join(root, relativePath), "utf8"))
    .join("\n");

  let dataAccess;
  try {
    const policyFiles = await collectRepositoryPolicyFiles(root);
    dataAccess = policyResult(() => verifyDataAccessFiles(policyFiles));
  } catch {
    dataAccess = {
      passed: false,
      findingCount: 1,
      codes: ["verification_error"],
    };
  }

  const checks = {
    dataAccess,
    httpBoundary: policyResult(() => verifyHttpBoundaryRepository()),
    zeroCost: policyResult(() => {
      verifyZeroCostMvp(root);
      return [];
    }),
    activeSurfaces: verifyActiveSurfaces(fileExists),
    inactiveFeatures: verifyInactiveFeatures(fileExists, packageJson),
    repositorySecrets: verifyRepositorySecrets(envExample, workflows),
    renderReadOnly:
      target === null
        ? notRunResult()
        : await measureReadOnlySecurity(target, { fetchImpl }),
  };
  const outcome = Object.values(checks).every((check) => check.passed)
    ? "pass"
    : "fail";

  return {
    schemaVersion: 1,
    target,
    checks,
    outcome,
  };
}

export function readSecurityTargetArgument(argv) {
  if (argv.length === 0) return null;
  if (argv.length !== 2 || argv[0] !== "--base-url") {
    throw new Error(
      "usage: node scripts/verify-private-mvp-security.mjs [--base-url <approved-origin>]",
    );
  }
  return parseSecurityTarget(argv[1]);
}

async function main() {
  try {
    const target = readSecurityTargetArgument(process.argv.slice(2));
    const result = await runSecurityGate({ target });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.outcome !== "pass") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "security gate failed"}\n`,
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
