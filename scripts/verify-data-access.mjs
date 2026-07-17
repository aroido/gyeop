import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import ts from "typescript";

const INTERNAL_RPC_PATH = "lib/db/internal-rpc.ts";
const OWNER_ACTOR_PATH = "lib/db/owner-mutation-actor.ts";
const OWNER_ACTOR_CORE_PATH = "lib/db/owner-mutation-actor-core.mjs";

const ALLOWED_RPC_EXPORTS = new Map([
  ["consumeRateLimit", "consume_rate_limit"],
  ["deleteAuthUser", "prepare_auth_deletion_call"],
  ["resolveNotificationRecipient", "resolve_notification_recipient_identity"],
]);

const OWNER_MUTATION_EXPORTS = new Map([
  ["createOrResumePlay", "create_or_resume_play"],
  ["saveSelfAnswer", "save_self_answer"],
  ["completePlay", "complete_play"],
  ["claimPlay", "claim_play"],
  ["createShareLink", "create_share_link"],
  ["rotateShareLink", "rotate_share_link"],
  ["disableShareLink", "disable_share_link"],
]);

const OWNER_MUTATION_SQL = new Set([
  "create_or_resume_play",
  "save_self_answer",
  "complete_play",
  "claim_play",
  "create_share_link",
  "rotate_share_link",
  "disable_share_link",
]);

function sourceFile(filePath, source) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasDirectTableCall(filePath, source) {
  const file = sourceFile(filePath, source);
  let found = false;
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const access = node.expression;
      const propertyName = ts.isPropertyAccessExpression(access)
        ? access.name.text
        : ts.isElementAccessExpression(access) &&
            ts.isStringLiteral(access.argumentExpression)
          ? access.argumentExpression.text
          : undefined;
      const receiver =
        ts.isPropertyAccessExpression(access) ||
        ts.isElementAccessExpression(access)
          ? access.expression.getText()
          : "";
      if (
        propertyName === "from" &&
        !["Array", "Buffer", "Object"].includes(receiver)
      ) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}

function memberName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteral(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return undefined;
}

function isMemberAccess(node) {
  return (
    ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
  );
}

function isAuthAdminReference(node) {
  return (
    isMemberAccess(node) &&
    memberName(node) === "admin" &&
    isMemberAccess(node.expression) &&
    memberName(node.expression) === "auth"
  );
}

function unwrapAwait(expression) {
  let current = expression;
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  return undefined;
}

function enclosingFunction(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function bindingNames(parameter) {
  if (!ts.isObjectBindingPattern(parameter.name)) return [];
  return parameter.name.elements
    .filter((element) => !element.dotDotDotToken)
    .map((element) => element.name.getText())
    .sort();
}

function boundRpcResults(ownerFunction, rpcName, beforeNode) {
  const matches = [];

  function visit(node) {
    if (node !== ownerFunction && enclosingFunction(node) !== ownerFunction) {
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      node.end < beforeNode.pos
    ) {
      const initializer = unwrapAwait(node.initializer);
      if (
        ts.isCallExpression(initializer) &&
        ts.isPropertyAccessExpression(initializer.expression) &&
        initializer.expression.name.text === "rpc" &&
        ts.isStringLiteral(initializer.arguments[0]) &&
        initializer.arguments[0].text === rpcName &&
        ts.isVariableDeclarationList(node.parent) &&
        (node.parent.flags & ts.NodeFlags.Const) !== 0
      ) {
        const bindings = new Map();
        for (const element of node.name.elements) {
          const property =
            element.propertyName?.getText() ?? element.name.getText();
          bindings.set(property, element.name.getText());
        }
        const data = bindings.get("data");
        const error = bindings.get("error");
        if (data && error) matches.push({ data, error });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(ownerFunction);
  return matches;
}

function isDescendantOf(node, ancestor) {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function conjunctionTerms(expression) {
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    return [
      ...conjunctionTerms(expression.left),
      ...conjunctionTerms(expression.right),
    ];
  }
  if (ts.isParenthesizedExpression(expression)) {
    return conjunctionTerms(expression.expression);
  }
  return [expression];
}

function callIsInsideSafeGuard(call, requiredTerms) {
  let current = call.parent;
  while (current) {
    if (
      ts.isIfStatement(current) &&
      isDescendantOf(call, current.thenStatement) &&
      !isDescendantOf(call, current.elseStatement)
    ) {
      const terms = conjunctionTerms(current.expression).map((term) =>
        term.getText(),
      );
      if (
        requiredTerms.every((pattern) =>
          terms.some((term) => pattern.test(term)),
        )
      ) {
        return true;
      }
    }
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current)
    ) {
      break;
    }
    current = current.parent;
  }
  return false;
}

function verifyAdminCalls(filePath, source, findings) {
  const file = sourceFile(filePath, source);

  function visit(node) {
    if (isAuthAdminReference(node)) {
      const methodAccess = node.parent;
      const directCall =
        ts.isPropertyAccessExpression(methodAccess) &&
        methodAccess.expression === node &&
        ts.isCallExpression(methodAccess.parent) &&
        methodAccess.parent.expression === methodAccess;
      if (!directCall) {
        findings.push(
          `${filePath}: auth.admin references must be direct allowlisted calls`,
        );
      }
    }

    if (ts.isCallExpression(node)) {
      const access = node.expression;
      const adminAccess = isMemberAccess(access)
        ? access.expression
        : undefined;
      if (adminAccess && isAuthAdminReference(adminAccess)) {
        const method = memberName(access);
        if (!ts.isPropertyAccessExpression(access)) {
          findings.push(`${filePath}: dynamic auth.admin access is forbidden`);
        }
        const ownerFunction = enclosingFunction(node);
        const ownerName = ownerFunction
          ? functionName(ownerFunction)
          : undefined;

        if (filePath !== INTERNAL_RPC_PATH) {
          findings.push(
            `${filePath}: auth.admin calls belong in ${INTERNAL_RPC_PATH}`,
          );
        }

        const expectedName =
          method === "deleteUser"
            ? "deleteAuthUser"
            : method === "getUserById"
              ? "resolveNotificationRecipient"
              : undefined;
        if (!expectedName || ownerName !== expectedName) {
          findings.push(
            `${filePath}: auth.admin.${method} is outside its named wrapper`,
          );
        }

        if (ownerFunction) {
          const parameters = ownerFunction.parameters;
          const names =
            parameters.length === 1 ? bindingNames(parameters[0]) : [];
          if (names.join(",") !== "jobId,proof") {
            findings.push(
              `${filePath}: ${expectedName} must accept only { jobId, proof }`,
            );
          }
        }

        if (method === "deleteUser") {
          const bindings = ownerFunction
            ? boundRpcResults(ownerFunction, "prepare_auth_deletion_call", node)
            : [];
          if (bindings.length !== 1) {
            findings.push(
              `${filePath}: deleteAuthUser must bind one prepare RPC data/error result`,
            );
          }
          const prepared = bindings[0]?.data;
          const prepareError = bindings[0]?.error;
          if (
            node.arguments.length !== 2 ||
            node.arguments[1].kind !== ts.SyntaxKind.FalseKeyword
          ) {
            findings.push(
              `${filePath}: deleteUser requires literal false as its second argument`,
            );
          }
          if (
            !prepared ||
            ![`${prepared}.uid`, `${prepared}.user_id`].includes(
              node.arguments[0]?.getText() ?? "",
            )
          ) {
            findings.push(
              `${filePath}: deleteUser identity must come from the prepared job result`,
            );
          }
          if (
            !prepared ||
            !prepareError ||
            !callIsInsideSafeGuard(node, [
              new RegExp(`^!${escapeRegExp(prepareError)}$`),
              new RegExp(
                `^(?:${escapeRegExp(prepared)}\\.allowed|${escapeRegExp(prepared)}\\.status\\s*===\\s*["']prepared["'])$`,
              ),
              new RegExp(
                `^(?!.*\\|\\|).*${escapeRegExp(prepared)}\\.(?:callBefore|call_before).*?>.*?(?:Date\\.now|\\bnow\\b)`,
              ),
            ])
          ) {
            findings.push(
              `${filePath}: deleteUser must be dominated by prepare success and call_before`,
            );
          }
        } else if (method === "getUserById") {
          const bindings = ownerFunction
            ? boundRpcResults(
                ownerFunction,
                "resolve_notification_recipient_identity",
                node,
              )
            : [];
          if (bindings.length !== 1) {
            findings.push(
              `${filePath}: resolveNotificationRecipient must bind one identity RPC data/error result`,
            );
          }
          const identity = bindings[0]?.data;
          const identityError = bindings[0]?.error;
          if (
            !identity ||
            ![
              `${identity}.uid`,
              `${identity}.userId`,
              `${identity}.user_id`,
            ].includes(node.arguments[0]?.getText() ?? "")
          ) {
            findings.push(
              `${filePath}: getUserById identity must come from the resolved job result`,
            );
          }
          if (
            !identity ||
            !identityError ||
            !callIsInsideSafeGuard(node, [
              new RegExp(`^!${escapeRegExp(identityError)}$`),
              new RegExp(
                `^${escapeRegExp(identity)}(?:\\?\\.|\\.)(?:uid|userId|user_id)$`,
              ),
            ])
          ) {
            findings.push(
              `${filePath}: getUserById must be dominated by a non-empty job-bound identity`,
            );
          }
        } else {
          findings.push(`${filePath}: auth.admin.${method} is not allowlisted`);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(file);
}

function objectPropertyValue(objectLiteral, name) {
  if (!ts.isObjectLiteralExpression(objectLiteral)) return undefined;
  const property = objectLiteral.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) &&
      candidate.name.getText().replace(/["']/g, "") === name,
  );
  return property && ts.isPropertyAssignment(property)
    ? property.initializer.getText()
    : undefined;
}

function verifyOwnerMutationFunction(statement, name, findings) {
  const expectedRpc = OWNER_MUTATION_EXPORTS.get(name);
  const callbacks = [];
  const rpcCalls = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === "withOwnerMutationActor"
    ) {
      const candidate = node.arguments[0];
      if (
        candidate &&
        (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate))
      ) {
        callbacks.push(candidate);
      }
    }
    if (
      ts.isCallExpression(node) &&
      isMemberAccess(node.expression) &&
      memberName(node.expression) === "rpc"
    ) {
      rpcCalls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(statement);

  const callback = callbacks.length === 1 ? callbacks[0] : undefined;
  if (callbacks.length !== 1) {
    findings.push(
      `${INTERNAL_RPC_PATH}: ${name} must use exactly one fresh actor callback`,
    );
  }
  if (rpcCalls.length !== 1) {
    findings.push(`${INTERNAL_RPC_PATH}: ${name} must invoke exactly one RPC`);
  }
  const rpcCall = rpcCalls.length === 1 ? rpcCalls[0] : undefined;

  const callbackBindings =
    callback?.parameters.length === 1
      ? bindingNames(callback.parameters[0])
      : [];
  if (callbackBindings.join(",") !== "actor,signal") {
    findings.push(
      `${INTERNAL_RPC_PATH}: ${name} must receive actor and signal from withOwnerMutationActor`,
    );
  }
  if (
    !rpcCall ||
    !ts.isStringLiteral(rpcCall.arguments[0]) ||
    rpcCall.arguments[0].text !== expectedRpc ||
    !callback ||
    !isDescendantOf(rpcCall, callback.body)
  ) {
    findings.push(
      `${INTERNAL_RPC_PATH}: ${name} must invoke ${expectedRpc} inside the fresh actor callback`,
    );
    return;
  }

  const args = rpcCall.arguments[1];
  if (objectPropertyValue(args, "p_actor_id") !== "actor.uid") {
    findings.push(
      `${INTERNAL_RPC_PATH}: ${name} must pass actor.uid as p_actor_id`,
    );
  }
  if (
    objectPropertyValue(args, "p_recovery_actor_candidates") !==
    "actor.recoveryActorCandidates"
  ) {
    findings.push(
      `${INTERNAL_RPC_PATH}: ${name} must pass actor.recoveryActorCandidates`,
    );
  }

  const abortAccess = rpcCall.parent;
  const abortCall = abortAccess?.parent;
  if (
    !abortAccess ||
    !ts.isPropertyAccessExpression(abortAccess) ||
    abortAccess.name.text !== "abortSignal" ||
    !abortCall ||
    !ts.isCallExpression(abortCall) ||
    abortCall.arguments.length !== 1 ||
    abortCall.arguments[0].getText() !== "signal"
  ) {
    findings.push(
      `${INTERNAL_RPC_PATH}: ${name} must bind the owner deadline signal`,
    );
  }
}

function verifyInternalRpc(source, findings) {
  if (!/^import ["']server-only["'];/m.test(source)) {
    findings.push(`${INTERNAL_RPC_PATH}: must import server-only`);
  }
  if (hasDirectTableCall(INTERNAL_RPC_PATH, source)) {
    findings.push(`${INTERNAL_RPC_PATH}: direct table access is forbidden`);
  }

  const file = sourceFile(INTERNAL_RPC_PATH, source);
  const rpcCalls = [];
  function collectRpcAccess(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === "getInternalClient"
    ) {
      const parent = node.parent;
      if (
        !ts.isPropertyAccessExpression(parent) ||
        !["auth", "rpc"].includes(parent.name.text)
      ) {
        findings.push(
          `${INTERNAL_RPC_PATH}: internal clients cannot be aliased or dynamically accessed`,
        );
      }
    }
    if (isMemberAccess(node) && memberName(node) === "rpc") {
      const isDirectCall =
        ts.isCallExpression(node.parent) && node.parent.expression === node;
      if (!isDirectCall) {
        findings.push(
          `${INTERNAL_RPC_PATH}: RPC references must be direct calls`,
        );
      } else {
        rpcCalls.push(node.parent);
      }
      if (!ts.isPropertyAccessExpression(node)) {
        findings.push(`${INTERNAL_RPC_PATH}: dynamic RPC access is forbidden`);
      }
    }
    ts.forEachChild(node, collectRpcAccess);
  }
  collectRpcAccess(file);

  for (const statement of file.statements) {
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      findings.push(
        `${INTERNAL_RPC_PATH}: exported runtime variables are forbidden`,
      );
    }
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) continue;

    const name = statement.name.text;
    if (!ALLOWED_RPC_EXPORTS.has(name) && !OWNER_MUTATION_EXPORTS.has(name)) {
      findings.push(
        `${INTERNAL_RPC_PATH}: exported function ${name} is not allowlisted`,
      );
    }
    if (OWNER_MUTATION_EXPORTS.has(name)) {
      const body = statement.body?.getText() ?? "";
      verifyOwnerMutationFunction(statement, name, findings);
      if (
        /return\s+(?:actor\b|\{[^}]*\b(?:actor|uid|recoveryActorCandidates)\b)/s.test(
          body,
        )
      ) {
        findings.push(
          `${INTERNAL_RPC_PATH}: ${name} cannot return owner actor material`,
        );
      }
    }
  }

  const allowedRpcNames = new Set(ALLOWED_RPC_EXPORTS.values());
  for (const rpcCall of rpcCalls) {
    const rpcName = ts.isStringLiteral(rpcCall.arguments[0])
      ? rpcCall.arguments[0].text
      : undefined;
    if (!rpcName) {
      findings.push(`${INTERNAL_RPC_PATH}: RPC name must be a string literal`);
      continue;
    }
    if (!allowedRpcNames.has(rpcName) && !OWNER_MUTATION_SQL.has(rpcName)) {
      findings.push(`${INTERNAL_RPC_PATH}: RPC ${rpcName} is not allowlisted`);
    }
  }
}

function verifyOwnerActorModule(source, findings) {
  const file = sourceFile(OWNER_ACTOR_PATH, source);
  const wrapper = file.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "withOwnerMutationActor",
  );
  if (!wrapper || !ts.isFunctionDeclaration(wrapper)) {
    findings.push(`${OWNER_ACTOR_PATH}: withOwnerMutationActor is required`);
    return;
  }
  if (
    wrapper.parameters.length !== 1 ||
    wrapper.parameters[0].name.getText() !== "callback"
  ) {
    findings.push(`${OWNER_ACTOR_PATH}: wrapper accepts callback only`);
  }
  if (
    !source.includes("createFreshServerAuthClient") ||
    !source.includes("parseAccountDeleteKeyring") ||
    !source.includes("performance.now()")
  ) {
    findings.push(
      `${OWNER_ACTOR_PATH}: wrapper must own fresh auth, keyring, and deadline sources`,
    );
  }
  if (/export\s+(?:type|interface)\s+OwnerMutationActor\b/.test(source)) {
    findings.push(
      `${OWNER_ACTOR_PATH}: raw owner actor type cannot be exported`,
    );
  }
  if (/console\s*\./.test(source)) {
    findings.push(`${OWNER_ACTOR_PATH}: owner actor material cannot be logged`);
  }
}

function extractSqlFunctions(sql, name) {
  const startPattern = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`,
    "gi",
  );
  return [...sql.matchAll(startPattern)].map((match) => {
    const afterStart = sql.slice(match.index);
    const tagMatch = afterStart.match(/\bas\s+(\$[A-Za-z0-9_]*\$)/i);
    if (!tagMatch || tagMatch.index === undefined) {
      return { signature: afterStart, body: "" };
    }
    const tag = tagMatch[1];
    const bodyStart = tagMatch.index + tagMatch[0].length;
    const bodyEnd = afterStart.indexOf(tag, bodyStart);
    return {
      signature: afterStart.slice(0, tagMatch.index),
      body: bodyEnd < 0 ? "" : afterStart.slice(bodyStart, bodyEnd),
    };
  });
}

export function verifyOwnerMutationSql(sql, filePath = "migration.sql") {
  const findings = [];
  const present = [...OWNER_MUTATION_SQL].filter((name) =>
    new RegExp(`function\\s+public\\.${name}\\s*\\(`, "i").test(sql),
  );
  if (
    present.length > 0 &&
    !/function\s+private\.assert_owner_mutation_actor\s*\(/i.test(sql)
  ) {
    findings.push(
      `${filePath}: owner mutations require private.assert_owner_mutation_actor`,
    );
  }

  for (const name of present) {
    const parsed = extractSqlFunctions(sql, name).at(-1);
    if (!parsed) continue;
    if (
      !/p_actor_id\s+uuid/i.test(parsed.signature) ||
      !/p_recovery_actor_candidates\s+jsonb/i.test(parsed.signature)
    ) {
      findings.push(
        `${filePath}: ${name} is missing the exact owner actor inputs`,
      );
    }

    const body = parsed.body
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const executable = body.includes("begin")
      ? body.slice(body.toLowerCase().indexOf("begin") + 5).trimStart()
      : "";
    if (
      !/^perform\s+private\.assert_owner_mutation_actor\s*\(/i.test(executable)
    ) {
      findings.push(
        `${filePath}: ${name} must call the owner guard as its first statement`,
      );
    }
  }

  return findings;
}

export function verifySecurityDefinerSql(sql, filePath = "migration.sql") {
  const findings = [];
  const functionPattern =
    /create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(/gi;

  for (const match of sql.matchAll(functionPattern)) {
    const afterStart = sql.slice(match.index);
    const tagMatch = afterStart.match(/\bas\s+(\$[A-Za-z0-9_]*\$)/i);
    if (!tagMatch || tagMatch.index === undefined) continue;
    const header = afterStart.slice(0, tagMatch.index);
    if (!/\bsecurity\s+definer\b/i.test(header)) continue;

    const qualifiedName = `${match[1]}.${match[2]}`;
    if (!/\bset\s+search_path\s*=\s*''/i.test(header)) {
      findings.push(
        `${filePath}: ${qualifiedName} must set an empty search_path`,
      );
    }

    const tag = tagMatch[1];
    const bodyStart = tagMatch.index + tagMatch[0].length;
    const bodyEnd = afterStart.indexOf(tag, bodyStart);
    if (bodyEnd < 0) continue;
    const body = afterStart
      .slice(bodyStart, bodyEnd)
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const relationPattern =
      /(?:\bfrom|\bjoin|\bupdate(?!\s+set\b)|\binsert\s+into|\bdelete\s+from)\s+([a-z_][a-z0-9_$.]*)/gi;
    for (const relationMatch of body.matchAll(relationPattern)) {
      const relation = relationMatch[1];
      if (!/^(?:public|private|pg_catalog)\./i.test(relation)) {
        findings.push(
          `${filePath}: ${qualifiedName} uses unqualified relation ${relation}`,
        );
      }
    }
  }

  return findings;
}

export function verifyDataAccessFiles(files) {
  const findings = [];

  for (const [filePath, source] of Object.entries(files)) {
    if (/\.(?:c|m)?jsx?$|\.tsx?$/.test(filePath)) {
      if (
        filePath !== INTERNAL_RPC_PATH &&
        source.includes("SUPABASE_SECRET_KEY")
      ) {
        findings.push(
          `${filePath}: SUPABASE_SECRET_KEY is restricted to ${INTERNAL_RPC_PATH}`,
        );
      }
      if (hasDirectTableCall(filePath, source)) {
        findings.push(`${filePath}: direct table access is forbidden`);
      }
      if (
        filePath !== OWNER_ACTOR_PATH &&
        filePath !== INTERNAL_RPC_PATH &&
        /from\s+["'][^"']*owner-mutation-actor(?:-core)?/.test(source)
      ) {
        findings.push(
          `${filePath}: owner actor internals cannot be imported here`,
        );
      }
      if (
        filePath !== OWNER_ACTOR_PATH &&
        source.includes(OWNER_ACTOR_CORE_PATH)
      ) {
        findings.push(
          `${filePath}: owner actor core is a restricted test seam`,
        );
      }
      verifyAdminCalls(filePath, source, findings);
    }
  }

  const migrations = Object.entries(files)
    .filter(
      ([filePath]) =>
        filePath.startsWith("supabase/migrations/") &&
        filePath.endsWith(".sql"),
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, source]) => `\n-- ${filePath}\n${source}`)
    .join("\n");
  findings.push(...verifyOwnerMutationSql(migrations, "supabase/migrations"));
  findings.push(...verifySecurityDefinerSql(migrations, "supabase/migrations"));

  const internalRpc = files[INTERNAL_RPC_PATH];
  if (!internalRpc) {
    findings.push(
      `${INTERNAL_RPC_PATH}: required server-only module is missing`,
    );
  } else {
    verifyInternalRpc(internalRpc, findings);
  }

  const ownerActor = files[OWNER_ACTOR_PATH];
  if (!ownerActor) {
    findings.push(
      `${OWNER_ACTOR_PATH}: required fresh actor wrapper is missing`,
    );
  } else {
    verifyOwnerActorModule(ownerActor, findings);
  }

  return [...new Set(findings)].sort();
}

async function collectFiles(root, relativeDirectory, extensions, files) {
  const directory = path.join(root, relativeDirectory);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, relativePath, extensions, files);
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files[relativePath] = await readFile(
        path.join(root, relativePath),
        "utf8",
      );
    }
  }
}

export async function collectRepositoryPolicyFiles(root) {
  const files = {};
  const ignoredSourceDirectories = new Set([
    ".git",
    ".next",
    "coverage",
    "node_modules",
    "playwright-report",
    "test-results",
  ]);
  const ignoredTopLevelSourceDirectories = new Set([
    ".codex",
    ".omx",
    "docs",
    "scripts",
    "supabase",
    "tests",
  ]);
  async function collectSourceDirectory(relativeDirectory) {
    const directory = path.join(root, relativeDirectory);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        (ignoredSourceDirectories.has(entry.name) ||
          (relativeDirectory === "" &&
            ignoredTopLevelSourceDirectories.has(entry.name)))
      ) {
        continue;
      }
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await collectSourceDirectory(relativePath);
      } else if (/\.(?:c|m)?jsx?$|\.tsx?$/.test(entry.name)) {
        files[relativePath] = await readFile(
          path.join(root, relativePath),
          "utf8",
        );
      }
    }
  }
  await collectSourceDirectory("");
  await collectFiles(root, "supabase/migrations", [".sql"], files);
  return files;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const findings = verifyDataAccessFiles(
    await collectRepositoryPolicyFiles(root),
  );
  if (findings.length > 0) {
    for (const finding of findings) console.error(finding);
    process.exitCode = 1;
  } else {
    console.log("Data access policy verification passed.");
  }
}
