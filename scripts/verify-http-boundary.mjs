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
  "lib/http/published-pack.ts",
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
  "supabase/tests/owner_play_session.test.sql",
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
const REVIEWED_INTERNAL_ADAPTERS = new Set([
  "lib/http/rate-limit.ts",
  "lib/http/owner-play.ts",
  "lib/http/published-pack.ts",
  "lib/http/share-links.ts",
  "lib/share-links/share-links.ts",
]);

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
  const virtualRoot = "/__gyeop_http_boundary__";
  const relativeName = (fileName) => {
    const normalized = path.posix.normalize(fileName);
    const prefix = `${virtualRoot}/`;
    return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : "";
  };
  const directories = new Set([virtualRoot]);
  for (const file of files.keys()) {
    let directory = path.posix.dirname(`${virtualRoot}/${file}`);
    while (directory.startsWith(virtualRoot)) {
      directories.add(directory);
      if (directory === virtualRoot) break;
      directory = path.posix.dirname(directory);
    }
  }
  const host = {
    fileExists(fileName) {
      const relative = relativeName(fileName);
      return relative.length > 0 && files.has(relative);
    },
    readFile(fileName) {
      const relative = relativeName(fileName);
      return relative.length > 0 ? files.get(relative) : undefined;
    },
    directoryExists(directoryName) {
      return directories.has(path.posix.normalize(directoryName));
    },
    getCurrentDirectory() {
      return virtualRoot;
    },
    realpath(fileName) {
      return path.posix.normalize(fileName);
    },
    useCaseSensitiveFileNames: true,
  };
  const result = ts.resolveModuleName(
    specifier,
    `${virtualRoot}/${from}`,
    {
      allowJs: true,
      allowImportingTsExtensions: true,
      baseUrl: virtualRoot,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: { "@/*": ["./*"] },
    },
    host,
  ).resolvedModule;
  if (!result) return undefined;
  const relative = relativeName(result.resolvedFileName);
  return relative.length > 0 && files.has(relative) ? relative : undefined;
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
  const allowed = new Set(["schema", "maximumBodyBytes", "privateNoStore"]);
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

function hasPrivateNoStoreOption(expression) {
  const options = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(options)) return false;
  const matches = options.properties.filter(
    (property) =>
      ts.isPropertyAssignment(property) &&
      propertyNameText(property.name) === "privateNoStore",
  );
  return (
    matches.length === 1 &&
    unwrapExpression(matches[0].initializer).kind === ts.SyntaxKind.TrueKeyword
  );
}

function isDeferredBoundaryCallback(expression) {
  const callback = unwrapExpression(expression);
  return ts.isArrowFunction(callback) || ts.isFunctionExpression(callback);
}

function returnedExpression(handler) {
  const body = handler.body;
  if (!body) return undefined;
  if (!ts.isBlock(body)) return body;
  if (
    body.statements.length === 1 &&
    ts.isReturnStatement(body.statements[0]) &&
    body.statements[0].expression !== undefined
  ) {
    return body.statements[0].expression;
  }
  return undefined;
}

function reviewedBoundaryCallFromHandler(handler, aliases) {
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
    return undefined;
  }
  const expression = returnedExpression(handler);
  if (!expression) return undefined;
  const call = reviewedBoundaryCall(expression, aliases);
  if (!call || call.arguments.length !== 3) return undefined;
  const requestArgument = unwrapExpression(call.arguments[0]);
  if (
    ts.isIdentifier(requestArgument) &&
    requestArgument.text === handler.parameters[0].name.text &&
    isSafeBoundaryOptions(call.arguments[1]) &&
    isDeferredBoundaryCallback(call.arguments[2])
  ) {
    return call;
  }
  return undefined;
}

function handlerReturnsReviewedBoundary(handler, aliases) {
  return reviewedBoundaryCallFromHandler(handler, aliases) !== undefined;
}

function moduleLoadsTarget(parsed, route, files, target) {
  const loads = [];
  function record(node, specifier) {
    if (resolveImport(route, specifier, files) === target) loads.push(node);
  }
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      record(node, node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      record(node, node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      record(node, node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return loads;
}

function exactNamedImportAliases(parsed, route, files, target, importedName) {
  const aliases = new Set();
  const loads = moduleLoadsTarget(parsed, route, files, target);
  if (loads.length !== 1 || !ts.isImportDeclaration(loads[0])) {
    return undefined;
  }
  const importClause = loads[0].importClause;
  if (
    !importClause ||
    importClause.isTypeOnly ||
    importClause.name ||
    !importClause.namedBindings ||
    !ts.isNamedImports(importClause.namedBindings) ||
    importClause.namedBindings.elements.length !== 1
  ) {
    return undefined;
  }
  const [binding] = importClause.namedBindings.elements;
  if (
    binding.isTypeOnly ||
    (binding.propertyName ?? binding.name).text !== importedName
  ) {
    return undefined;
  }
  aliases.add(binding.name.text);
  return aliases;
}

function namedImportAliases(parsed, route, files, target, importedName) {
  const loads = moduleLoadsTarget(parsed, route, files, target);
  if (loads.length !== 1 || !ts.isImportDeclaration(loads[0])) return undefined;
  const clause = loads[0].importClause;
  if (
    !clause ||
    clause.isTypeOnly ||
    clause.name ||
    !clause.namedBindings ||
    !ts.isNamedImports(clause.namedBindings)
  ) {
    return undefined;
  }
  const bindings = clause.namedBindings.elements.filter(
    (binding) =>
      !binding.isTypeOnly &&
      (binding.propertyName ?? binding.name).text === importedName,
  );
  return bindings.length === 1 ? new Set([bindings[0].name.text]) : undefined;
}

function identifierUses(node, aliases) {
  const uses = [];
  function visit(current) {
    if (ts.isImportDeclaration(current)) return;
    if (ts.isIdentifier(current) && aliases.has(current.text)) {
      const parent = current.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === current) ||
        (ts.isPropertyAssignment(parent) && parent.name === current) ||
        (ts.isMethodDeclaration(parent) && parent.name === current) ||
        (ts.isPropertyDeclaration(parent) && parent.name === current);
      if (!isPropertyName) uses.push(current);
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return uses;
}

function singleDirectImportedCall(parsed, aliases) {
  const uses = identifierUses(parsed, aliases);
  if (uses.length !== 1) return undefined;
  const [use] = uses;
  const parent = use.parent;
  return ts.isCallExpression(parent) &&
    parent.expression === use &&
    !parent.questionDotToken
    ? parent
    : undefined;
}

function isDescendantOf(node, ancestor) {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function isInsideLoop(node, boundary) {
  let current = node.parent;
  while (current && current !== boundary) {
    if (
      ts.isForStatement(current) ||
      ts.isForInStatement(current) ||
      ts.isForOfStatement(current) ||
      ts.isWhileStatement(current) ||
      ts.isDoStatement(current)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function directlyReturnedCall(handler, aliases) {
  const expression = returnedExpression(handler);
  if (!expression) return undefined;
  const call = reviewedBoundaryCall(expression, aliases);
  return call;
}

function isExactIdentifier(expression, expected) {
  const value = unwrapExpression(expression);
  return ts.isIdentifier(value) && value.text === expected;
}

function isFixedPackCatalogPolicy(expression) {
  const policy = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(policy)) return false;
  const values = new Map();
  for (const property of policy.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      if (
        values.has(property.name.text) ||
        property.objectAssignmentInitializer
      ) {
        return false;
      }
      values.set(property.name.text, property.name);
      continue;
    }
    if (!ts.isPropertyAssignment(property)) return false;
    const name = propertyNameText(property.name);
    if (!name || values.has(name)) return false;
    values.set(name, property.initializer);
  }
  if (
    values.size !== 5 ||
    !["keyHash", "action", "windowSeconds", "limit", "signal"].every((name) =>
      values.has(name),
    )
  ) {
    return false;
  }
  const action = unwrapExpression(values.get("action"));
  const windowSeconds = unwrapExpression(values.get("windowSeconds"));
  const limit = unwrapExpression(values.get("limit"));
  return (
    isExactIdentifier(values.get("keyHash"), "networkKey") &&
    ts.isStringLiteral(action) &&
    action.text === "pack_catalog_read" &&
    ts.isNumericLiteral(windowSeconds) &&
    windowSeconds.text === "60" &&
    ts.isNumericLiteral(limit) &&
    limit.text === "60" &&
    isExactIdentifier(values.get("signal"), "signal")
  );
}

function isFixedOwnerAccessPolicy(expression) {
  const policy = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(policy)) return false;
  const values = new Map();
  for (const property of policy.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      if (
        values.has(property.name.text) ||
        property.objectAssignmentInitializer
      ) {
        return false;
      }
      values.set(property.name.text, property.name);
      continue;
    }
    if (!ts.isPropertyAssignment(property)) return false;
    const name = propertyNameText(property.name);
    if (!name || values.has(name)) return false;
    values.set(name, property.initializer);
  }
  if (
    values.size !== 5 ||
    !["keyHash", "action", "windowSeconds", "limit", "signal"].every((name) =>
      values.has(name),
    )
  ) {
    return false;
  }
  const action = unwrapExpression(values.get("action"));
  const windowSeconds = unwrapExpression(values.get("windowSeconds"));
  const limit = unwrapExpression(values.get("limit"));
  return (
    isExactIdentifier(values.get("keyHash"), "networkKey") &&
    ts.isStringLiteral(action) &&
    action.text === "owner_play_access" &&
    ts.isNumericLiteral(windowSeconds) &&
    windowSeconds.text === "600" &&
    ts.isNumericLiteral(limit) &&
    limit.text === "120" &&
    isExactIdentifier(values.get("signal"), "signal")
  );
}

const OWNER_ROUTE_CONTRACTS = new Map([
  [
    "app/api/plays/route.ts",
    {
      method: "POST",
      sequence: [
        [
          "lib/owner-play/owner-play-session-core.mjs",
          "parseOwnerCookieHeader",
        ],
        ["lib/http/owner-play.ts", "createOwnerPlayResponse"],
        ["lib/http/rate-limit.ts", "runRateLimitedDomain"],
        ["lib/http/owner-play.ts", "resumeOwnerPlayResponse"],
      ],
      limited: true,
    },
  ],
  [
    "app/api/plays/[playId]/route.ts",
    {
      method: "GET",
      sequence: [
        ["lib/http/rate-limit.ts", "runRateLimitedDomain"],
        [
          "lib/owner-play/owner-play-session-core.mjs",
          "parseOwnerCookieHeader",
        ],
        ["lib/http/owner-play.ts", "readOwnerPlayResponse"],
      ],
      limited: true,
    },
  ],
  [
    "app/api/plays/[playId]/answers/[cardId]/route.ts",
    {
      method: "PUT",
      sequence: [
        ["lib/http/rate-limit.ts", "runRateLimitedDomain"],
        [
          "lib/owner-play/owner-play-session-core.mjs",
          "parseOwnerCookieHeader",
        ],
        ["lib/http/owner-play.ts", "saveOwnerAnswerResponse"],
      ],
      limited: true,
    },
  ],
  [
    "app/api/plays/[playId]/complete/route.ts",
    {
      method: "POST",
      sequence: [
        ["lib/http/rate-limit.ts", "runRateLimitedDomain"],
        [
          "lib/owner-play/owner-play-session-core.mjs",
          "parseOwnerCookieHeader",
        ],
        ["lib/http/owner-play.ts", "completeOwnerPlayResponse"],
      ],
      limited: true,
    },
  ],
  [
    "app/api/me/session/route.ts",
    {
      method: "DELETE",
      sequence: [
        [
          "lib/owner-play/owner-play-session-core.mjs",
          "parseOwnerCookieHeader",
        ],
        ["lib/http/owner-play.ts", "revokeOwnerPlayResponse"],
      ],
      limited: false,
    },
  ],
  [
    "app/api/me/plays/[playId]/share-events/route.ts",
    {
      method: "POST",
      sequence: [
        ["lib/http/rate-limit.ts", "runRateLimitedDomain"],
        [
          "lib/owner-play/owner-play-session-core.mjs",
          "parseOwnerCookieHeader",
        ],
        ["lib/owner-play/owner-play-state-core.mjs", "isOwnerPlayId"],
        ["lib/http/share-links.ts", "recordShareActionResponse"],
      ],
      limited: true,
    },
  ],
]);

function hasSafeOwnerRouteOrder(route, files, contract) {
  const expected = OWNER_ROUTE_CONTRACTS.get(route);
  if (!expected) return true;
  const handlers = contract.handlers.filter(
    ({ name }) => name === expected.method,
  );
  if (handlers.length !== 1) return false;
  const boundaryCall = reviewedBoundaryCallFromHandler(
    handlers[0].node,
    contract.aliases,
  );
  if (!boundaryCall || !hasPrivateNoStoreOption(boundaryCall.arguments[1])) {
    return false;
  }
  const callback = unwrapExpression(boundaryCall.arguments[2]);
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
    return false;
  }

  const calls = [];
  for (const [target, importedName] of expected.sequence) {
    const aliases = namedImportAliases(
      contract.parsed,
      route,
      files,
      target,
      importedName,
    );
    const call = aliases && singleDirectImportedCall(contract.parsed, aliases);
    if (
      !call ||
      !isDescendantOf(call, callback.body) ||
      isInsideLoop(call, callback.body)
    ) {
      return false;
    }
    calls.push(call);
  }
  for (let index = 1; index < calls.length; index += 1) {
    if (calls[index - 1].getStart() >= calls[index].getStart()) return false;
  }

  const rateIndex = expected.sequence.findIndex(
    ([, importedName]) => importedName === "runRateLimitedDomain",
  );
  if (expected.limited) {
    const rateCall = calls[rateIndex];
    if (!rateCall || !isFixedOwnerAccessPolicy(rateCall.arguments[0]))
      return false;
  } else if (
    moduleLoadsTarget(contract.parsed, route, files, "lib/http/rate-limit.ts")
      .length > 0
  ) {
    return false;
  }
  return true;
}

function isNonRepeatedCallbackCall(call, callback) {
  let current = call.parent;
  while (current && current !== callback) {
    if (
      ts.isFunctionLike(current) ||
      ts.isForStatement(current) ||
      ts.isForInStatement(current) ||
      ts.isForOfStatement(current) ||
      ts.isWhileStatement(current) ||
      ts.isDoStatement(current) ||
      ts.isIfStatement(current) ||
      ts.isConditionalExpression(current) ||
      ts.isSwitchStatement(current) ||
      ts.isCaseClause(current) ||
      ts.isDefaultClause(current) ||
      ts.isCatchClause(current)
    ) {
      return false;
    }
    if (
      ts.isBinaryExpression(current) &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(current.operatorToken.kind)
    ) {
      return false;
    }
    current = current.parent;
  }
  return current === callback;
}

function hasSafePackCatalogOrder(route, files, contract, graph, reachable) {
  const rateAliases = exactNamedImportAliases(
    contract.parsed,
    route,
    files,
    "lib/http/rate-limit.ts",
    "runRateLimitedDomain",
  );
  const catalogAliases = exactNamedImportAliases(
    contract.parsed,
    route,
    files,
    "lib/http/published-pack.ts",
    "readPublishedPack",
  );
  if (!rateAliases || !catalogAliases) return false;

  if (
    [...reachable].some(
      (file) =>
        file !== route &&
        (graph.get(file) ?? []).some(
          (edge) =>
            edge.target === "lib/http/published-pack.ts" ||
            edge.target === "lib/http/rate-limit.ts",
        ),
    )
  ) {
    return false;
  }

  const rateCall = singleDirectImportedCall(contract.parsed, rateAliases);
  const catalogCall = singleDirectImportedCall(contract.parsed, catalogAliases);
  const getHandlers = contract.handlers.filter(({ name }) => name === "GET");
  if (!rateCall || !catalogCall || getHandlers.length !== 1) {
    return false;
  }

  const boundaryCall = reviewedBoundaryCallFromHandler(
    getHandlers[0].node,
    contract.aliases,
  );
  if (!boundaryCall) return false;
  const boundaryCallback = unwrapExpression(boundaryCall.arguments[2]);
  if (
    directlyReturnedCall(boundaryCallback, rateAliases) !== rateCall ||
    rateCall.arguments.length !== 2 ||
    !isFixedPackCatalogPolicy(rateCall.arguments[0])
  ) {
    return false;
  }

  const catalogCallback = unwrapExpression(rateCall.arguments[1]);
  if (
    !ts.isArrowFunction(catalogCallback) ||
    catalogCallback.parameters.length !== 0
  ) {
    return false;
  }
  return isNonRepeatedCallbackCall(catalogCall, catalogCallback);
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
  return { aliases, handlers, importsReviewedBoundary, parsed };
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
          hasNonLiteralModuleLoad(file, files.get(file)),
        )
      ) {
        findings.push(
          `${route}: cron Route cannot use a non-literal module load`,
        );
      }
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

    if (route === "app/api/packs/[slug]/route.ts") {
      if (!hasSafePackCatalogOrder(route, files, contract, graph, reachable)) {
        findings.push(
          `${route}: published pack read must run once behind the fixed pack_catalog_read rate limit`,
        );
      }
    }
    if (
      OWNER_ROUTE_CONTRACTS.has(route) &&
      !hasSafeOwnerRouteOrder(route, files, contract)
    ) {
      findings.push(
        `${route}: owner capability branch order or fixed access limiter is invalid`,
      );
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
        if (rawInternalBoundary && !REVIEWED_INTERNAL_ADAPTERS.has(file)) {
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
  const atomicTest = [
    "supabase/tests/http_boundary_atomic_contract.test.sql",
    "supabase/tests/owner_play_session.test.sql",
  ]
    .map((file) => readFileSync(path.join(ROOT, file), "utf8"))
    .join("\n");
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
