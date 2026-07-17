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
    else if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

const HTTP_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);
const PUBLIC_BOUNDARY_FILE = "lib/http/request-boundary.ts";

function parseSource(file, source) {
  let scriptKind = ts.ScriptKind.TS;
  if (file.endsWith(".tsx")) scriptKind = ts.ScriptKind.TSX;
  else if (file.endsWith(".jsx")) scriptKind = ts.ScriptKind.JSX;
  else if (/\.(?:js|mjs|cjs)$/.test(file)) scriptKind = ts.ScriptKind.JS;
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
}

function importsOf(file, source) {
  const specifiers = new Set();
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text);
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.add(node.moduleReference.expression.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(parseSource(file, source));
  return [...specifiers];
}

function resolveImport(from, specifier, files) {
  let base;
  if (specifier.startsWith("@/")) {
    base = path.posix.normalize(specifier.slice(2));
    if (base === ".." || base.startsWith("../")) return undefined;
  } else if (specifier.startsWith(".")) {
    base = path.posix.normalize(
      path.posix.join(path.posix.dirname(from), specifier),
    );
  } else {
    return undefined;
  }
  const extension = path.posix.extname(base);
  const stem = extension ? base.slice(0, -extension.length) : base;
  let candidates;
  if (extension === ".js") candidates = [`${stem}.ts`, `${stem}.tsx`, base];
  else if (extension === ".jsx") candidates = [`${stem}.tsx`, base];
  else if (extension === ".mjs") candidates = [`${stem}.mts`, base];
  else if (extension === ".cjs") candidates = [`${stem}.cts`, base];
  else if (!extension) {
    candidates = [
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mjs`,
      `${base}.js`,
      `${base}.jsx`,
      `${base}.cjs`,
      `${base}.mts`,
      `${base}.cts`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
      `${base}/index.mjs`,
      `${base}/index.js`,
      `${base}/index.jsx`,
      `${base}/index.cjs`,
      `${base}/index.mts`,
      `${base}/index.cts`,
    ];
  } else candidates = [base];
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }
  return undefined;
}

function hasNonLiteralModuleLoad(file, source) {
  let finding = false;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      (node.arguments.length === 0 || !ts.isStringLiteral(node.arguments[0]))
    ) {
      finding = true;
    }
    if (!finding) ts.forEachChild(node, visit);
  }
  visit(parseSource(file, source));
  return finding;
}

function hasExportModifier(node) {
  return node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAwaitExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function reviewedBoundaryCall(expression, aliases) {
  const unwrapped = unwrapExpression(expression);
  return ts.isCallExpression(unwrapped) &&
    ts.isIdentifier(unwrapped.expression) &&
    aliases.has(unwrapped.expression.text)
    ? unwrapped
    : undefined;
}

function bindingShadowsAlias(name, aliases) {
  if (ts.isIdentifier(name)) return aliases.has(name.text);
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.some(
      (element) =>
        ts.isBindingElement(element) &&
        bindingShadowsAlias(element.name, aliases),
    );
  }
  return false;
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function isSafeBoundaryOptionValue(expression) {
  const value = unwrapExpression(expression);
  return (
    ts.isIdentifier(value) ||
    ts.isStringLiteral(value) ||
    ts.isNumericLiteral(value) ||
    value.kind === ts.SyntaxKind.TrueKeyword ||
    value.kind === ts.SyntaxKind.FalseKeyword ||
    value.kind === ts.SyntaxKind.NullKeyword
  );
}

function isSafeBoundaryOptions(expression) {
  const options = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(options)) return false;
  const allowed = new Set(["schema", "maximumBodyBytes"]);
  const seen = new Set();
  return options.properties.every((property) => {
    if (ts.isShorthandPropertyAssignment(property)) {
      const name = property.name.text;
      if (!allowed.has(name) || seen.has(name)) return false;
      seen.add(name);
      return !property.objectAssignmentInitializer;
    }
    if (!ts.isPropertyAssignment(property)) return false;
    const name = propertyNameText(property.name);
    if (!allowed.has(name) || seen.has(name)) return false;
    seen.add(name);
    return isSafeBoundaryOptionValue(property.initializer);
  });
}

function isDeferredBoundaryCallback(expression) {
  const callback = unwrapExpression(expression);
  return ts.isArrowFunction(callback) || ts.isFunctionExpression(callback);
}

function handlerReturnsReviewedBoundary(handler, aliases) {
  if (
    handler.parameters.length === 0 ||
    !ts.isIdentifier(handler.parameters[0].name) ||
    handler.parameters.some(
      (parameter) => parameter.initializer || parameter.dotDotDotToken,
    ) ||
    handler.parameters.some((parameter) =>
      bindingShadowsAlias(parameter.name, aliases),
    )
  ) {
    return false;
  }
  const body = handler.body;
  if (!body) return false;
  let expression;
  if (!ts.isBlock(body)) {
    expression = body;
  } else if (
    body.statements.length === 1 &&
    ts.isReturnStatement(body.statements[0]) &&
    body.statements[0].expression !== undefined
  ) {
    expression = body.statements[0].expression;
  } else {
    return false;
  }
  const call = reviewedBoundaryCall(expression, aliases);
  if (!call || call.arguments.length !== 3) return false;
  const requestArgument = unwrapExpression(call.arguments[0]);
  return (
    ts.isIdentifier(requestArgument) &&
    requestArgument.text === handler.parameters[0].name.text &&
    isSafeBoundaryOptions(call.arguments[1]) &&
    isDeferredBoundaryCallback(call.arguments[2])
  );
}

function routeBoundaryContract(route, source, files) {
  const parsed = parseSource(route, source);
  const aliases = new Set();
  let importsReviewedBoundary = false;
  for (const statement of parsed.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      resolveImport(route, statement.moduleSpecifier.text, files) !==
        PUBLIC_BOUNDARY_FILE
    ) {
      continue;
    }
    importsReviewedBoundary = true;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const binding of bindings.elements) {
      if ((binding.propertyName ?? binding.name).text === "withPublicRequest") {
        aliases.add(binding.name.text);
      }
    }
  }

  const handlers = [];
  for (const statement of parsed.statements) {
    if (!hasExportModifier(statement)) continue;
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      HTTP_METHODS.has(statement.name.text)
    ) {
      handlers.push({ name: statement.name.text, node: statement });
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          HTTP_METHODS.has(declaration.name.text) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          handlers.push({
            name: declaration.name.text,
            node: declaration.initializer,
          });
        }
      }
    }
  }
  return { aliases, handlers, importsReviewedBoundary };
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
    /(?:^|\/)app\/.*\/route\.(?:[cm]?[jt]s|[jt]sx)$/.test(file),
  );
  for (const route of routes) {
    const source = files.get(route);
    const contract = routeBoundaryContract(route, source, files);

    const reachable = new Set();
    const queue = [route];
    while (queue.length) {
      const current = queue.pop();
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const edge of graph.get(current) ?? []) queue.push(edge.target);
    }

    if (route.includes("app/api/internal/cron/")) {
      if (
        [...reachable].some((file) =>
          (graph.get(file) ?? []).some(
            (edge) => edge.target === PUBLIC_BOUNDARY_FILE,
          ),
        )
      ) {
        findings.push(
          `${route}: cron Route cannot use the public request boundary`,
        );
      }
      continue;
    }

    if (!contract.importsReviewedBoundary || contract.aliases.size === 0) {
      findings.push(
        `${route}: public Route must import the reviewed withPublicRequest boundary`,
      );
    }
    if (contract.handlers.length === 0) {
      findings.push(
        `${route}: public Route must export an HTTP method handler`,
      );
    }
    for (const handler of contract.handlers) {
      if (!handlerReturnsReviewedBoundary(handler.node, contract.aliases)) {
        findings.push(
          `${route}: exported ${handler.name} must directly return the reviewed withPublicRequest boundary`,
        );
      }
    }

    for (const file of reachable) {
      const reachableSource = files.get(file);
      if (hasNonLiteralModuleLoad(file, reachableSource)) {
        findings.push(
          `${file}: reachable helper cannot use a non-literal module load`,
        );
      }
      for (const edge of graph.get(file) ?? []) {
        const rawInternalBoundary =
          edge.target === "lib/db/internal-rpc.ts" ||
          edge.target === "lib/http/rate-limit-core.mjs";
        if (rawInternalBoundary && file !== "lib/http/rate-limit.ts") {
          findings.push(
            `${file}: reachable helper cannot import a raw internal boundary`,
          );
        }
      }
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
  if (!/timeout http-request 10s/.test(haproxy))
    findings.push("HAProxy: request header timeout is required");
  if (
    !/acl declared_body_too_large req\.hdr\(content-length\) -m int gt 65536/.test(
      haproxy,
    ) ||
    !/http-request return status 413[^\n]+if declared_body_too_large/.test(
      haproxy,
    )
  ) {
    findings.push("HAProxy: declared body size must fail early with 413");
  }
  for (const header of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "Referrer-Policy",
    "X-Content-Type-Options",
  ]) {
    if (!new RegExp(`return status 413[^\\n]+hdr ${header}\\b`).test(haproxy)) {
      findings.push(`HAProxy: 413 response misses ${header}`);
    }
  }

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
