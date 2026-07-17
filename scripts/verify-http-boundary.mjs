import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

import { securityHeaders } from "../lib/http/security-headers.mjs";
import {
  renderHaproxyBackend,
  renderNftables,
} from "./render-http-boundary-ops.mjs";

const ROOT = path.resolve(new URL("../", import.meta.url).pathname);
const REQUIRED_FILES = [
  "lib/http/errors.ts",
  "lib/http/http-boundary-core.mjs",
  "lib/http/request-boundary.ts",
  "lib/http/rate-limit.ts",
  "lib/http/strict-json-schema.ts",
  "lib/security/network-key.mjs",
  "lib/security/proxy-origin-secret.mjs",
  "ops/http-boundary/gyeop-http-boundary@.target",
  "ops/http-boundary/gyeop-loopback-firewall.service",
  "ops/http-boundary/gyeop-loopback-firewall-probe@.service",
  "ops/http-boundary/gyeop-loopback-firewall-probe",
  "ops/http-boundary/haproxy-origin-wrapper",
  "scripts/render-http-boundary-ops.mjs",
  "supabase/tests/http_boundary_atomic_contract.test.sql",
  "tests/integration/http-boundary-host.test.sh",
];

function sourceFiles(directory) {
  const absolute = path.join(ROOT, directory);
  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(relative));
    else if (/\.(?:ts|tsx|mjs)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

function importsOf(file, source) {
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return parsed.statements
    .filter(ts.isImportDeclaration)
    .map((statement) =>
      ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined,
    )
    .filter(Boolean);
}

function resolveImport(from, specifier, files) {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(from), specifier),
  );
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.mjs`,
  ]) {
    if (files.has(candidate)) return candidate;
  }
  return undefined;
}

export function verifyHttpBoundarySources(inputFiles) {
  const files = new Map(Object.entries(inputFiles));
  const findings = [];
  const graph = new Map();
  for (const [file, source] of files) {
    graph.set(
      file,
      importsOf(file, source)
        .map((specifier) => ({
          specifier,
          target: resolveImport(file, specifier, files),
        }))
        .filter(({ target }) => target),
    );
  }

  const routes = [...files.keys()].filter((file) =>
    /(?:^|\/)app\/.*\/route\.ts$/.test(file),
  );
  for (const route of routes) {
    if (route.includes("app/api/internal/cron/")) continue;
    const source = files.get(route);
    if (!/\bwithPublicRequest\s*\(/.test(source)) {
      findings.push(`${route}: public Route must call withPublicRequest`);
    }
    if (/internal-rpc|rate-limit-core/.test(source)) {
      findings.push(
        `${route}: public Route cannot import a raw internal boundary`,
      );
    }

    const reachable = new Set();
    const queue = [route];
    while (queue.length) {
      const current = queue.pop();
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const edge of graph.get(current) ?? []) queue.push(edge.target);
    }
    for (const file of reachable) {
      const reachableSource = files.get(file);
      if (file !== "lib/http/strict-json-schema.ts") {
        if (
          /\bz\.object\s*\(|\.passthrough\s*\(|\.catchall\s*\(/.test(
            reachableSource,
          )
        ) {
          findings.push(
            `${file}: reachable schema must use strictJsonObject only`,
          );
        }
        if (/\bas\s+(?:any|StrictJsonSchema)\b/.test(reachableSource)) {
          findings.push(`${file}: strict schema casts are forbidden`);
        }
      }
      if (
        ![
          "lib/http/request-boundary.ts",
          "lib/http/http-boundary-core.mjs",
        ].includes(file) &&
        /\b(?:request|req)\.(?:json|text|arrayBuffer|formData)\s*\(|\.get\(\s*["'](?:origin|forwarded|x-forwarded-|x-real-ip|x-gyeop-origin-verify)/i.test(
          reachableSource,
        )
      ) {
        findings.push(
          `${file}: raw HTTP parsing must stay inside the boundary`,
        );
      }
    }
  }
  return findings;
}

function actualSources() {
  return Object.fromEntries(
    [...sourceFiles("app"), ...sourceFiles("lib")].map((file) => [
      file,
      readFileSync(path.join(ROOT, file), "utf8"),
    ]),
  );
}

function count(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

export function verifyRepository() {
  const findings = [];
  for (const file of REQUIRED_FILES) {
    try {
      readFileSync(path.join(ROOT, file));
    } catch {
      findings.push(`${file}: required HTTP boundary artifact is missing`);
    }
  }
  if (findings.length) return findings;

  findings.push(...verifyHttpBoundarySources(actualSources()));

  const packageJson = JSON.parse(
    readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  if (
    !/next start\s+--hostname\s+127\.0\.0\.1/.test(
      packageJson.scripts?.start ?? "",
    )
  ) {
    findings.push("package.json: production Next start must bind 127.0.0.1");
  }
  for (const name of ["APP_URL", "ORIGIN_PROXY_SECRET", "RATE_LIMIT_SECRET"]) {
    if (
      !new RegExp(`^${name}=`, "m").test(
        readFileSync(path.join(ROOT, ".env.example"), "utf8"),
      )
    ) {
      findings.push(`.env.example: ${name} is required`);
    }
  }

  const headers = Object.fromEntries(
    securityHeaders({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://db.example",
    }).map(({ key, value }) => [key.toLowerCase(), value]),
  );
  const csp = headers["content-security-policy"] ?? "";
  for (const directive of [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "connect-src 'self' https://db.example wss://db.example",
  ]) {
    if (!csp.includes(directive))
      findings.push(`security headers: CSP misses ${directive}`);
  }
  if (csp.includes("*") || csp.includes("unsafe-eval"))
    findings.push("security headers: unsafe CSP expansion");
  if (headers["strict-transport-security"] !== "max-age=31536000")
    findings.push("security headers: HSTS must match the reviewed value");
  if (headers["referrer-policy"] !== "no-referrer")
    findings.push("security headers: Referrer-Policy must be no-referrer");
  if (headers["x-content-type-options"] !== "nosniff")
    findings.push("security headers: nosniff is required");

  const inventory = {
    proxyUid: 2000,
    environments: [
      {
        name: "staging",
        hostname: "staging.gyeop.example",
        appUid: 2001,
        port: 3100,
      },
      {
        name: "production",
        hostname: "gyeop.example",
        appUid: 2002,
        port: 3200,
      },
    ],
  };
  const haproxy = renderHaproxyBackend(inventory, "staging");
  const firstSet = haproxy.indexOf("http-request set-header");
  for (const deletion of [
    "del-header x-forwarded- -m beg",
    "del-header Forwarded",
    "del-header X-Real-IP",
    "del-header X-Gyeop-Origin-Verify",
  ]) {
    const position = haproxy.indexOf(deletion);
    if (position < 0 || position > firstSet)
      findings.push(`HAProxy: ${deletion} must precede canonical writes`);
  }
  for (const name of [
    "X-Forwarded-For",
    "X-Forwarded-Host",
    "X-Forwarded-Proto",
    "X-Forwarded-Port",
    "X-Gyeop-Origin-Verify",
  ]) {
    if (count(haproxy, new RegExp(`set-header ${name}\\b`, "g")) !== 1)
      findings.push(`HAProxy: ${name} must be written exactly once`);
  }
  if (!/server app 127\.0\.0\.1:3100/.test(haproxy))
    findings.push("HAProxy: app upstream must be loopback");

  const nftables = renderNftables(inventory);
  for (const environment of inventory.environments) {
    if (
      count(
        nftables,
        new RegExp(`gyeop-deny-${environment.name}-ipv[46]`, "g"),
      ) !== 2
    )
      findings.push(
        `nftables: ${environment.name} needs IPv4 and IPv6 reject counters`,
      );
    if (
      !nftables.includes(
        `meta skuid { ${inventory.proxyUid}, ${environment.appUid} }`,
      )
    )
      findings.push(`nftables: ${environment.name} allowlist is incorrect`);
  }

  const firewallUnit = readFileSync(
    path.join(ROOT, "ops/http-boundary/gyeop-loopback-firewall.service"),
    "utf8",
  );
  const probeUnit = readFileSync(
    path.join(ROOT, "ops/http-boundary/gyeop-loopback-firewall-probe@.service"),
    "utf8",
  );
  const target = readFileSync(
    path.join(ROOT, "ops/http-boundary/gyeop-http-boundary@.target"),
    "utf8",
  );
  if (
    !firewallUnit.includes(
      "Before=network-pre.target gyeop-app@staging.service gyeop-app@production.service",
    )
  )
    findings.push("systemd: firewall restore must precede both apps");
  if (
    !probeUnit.includes(
      "After=gyeop-app@%i.service gyeop-loopback-firewall.service",
    )
  )
    findings.push("systemd: denial probe must run after app and firewall");
  if (
    !target.includes(
      "Requires=gyeop-app@%i.service gyeop-loopback-firewall-probe@%i.service",
    )
  )
    findings.push("systemd: verified target must require app and denial probe");

  const migrations = readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) =>
      readFileSync(path.join(ROOT, "supabase/migrations", file), "utf8"),
    )
    .join("\n");
  const atomicTest = readFileSync(
    path.join(ROOT, "supabase/tests/http_boundary_atomic_contract.test.sql"),
    "utf8",
  );
  for (const functionName of ["create_or_resume_play", "start_response"]) {
    if (
      new RegExp(
        `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${functionName}\\b`,
        "i",
      ).test(migrations)
    ) {
      for (const evidence of [
        functionName,
        "consume_rate_limit",
        "rate_limited",
        "resumed",
      ]) {
        if (!atomicTest.includes(evidence))
          findings.push(
            `atomic contract: ${functionName} runtime test misses ${evidence}`,
          );
      }
    }
  }
  return findings;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const findings = verifyRepository();
  if (findings.length) {
    for (const finding of findings) console.error(finding);
    process.exitCode = 1;
  } else {
    console.log("HTTP boundary policy verification passed.");
  }
}
