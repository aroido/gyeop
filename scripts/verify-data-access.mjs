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

const OWNER_MUTATION_EXPORTS = new Set([
  "createOrResumePlay",
  "saveSelfAnswer",
  "completePlay",
  "claimPlay",
  "createShareLink",
  "rotateShareLink",
  "disableShareLink",
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
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "from" &&
      !["Array", "Buffer", "Object"].includes(
        node.expression.expression.getText(),
      )
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
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

function callIsInsideRequiredIf(call, requiredPattern) {
  let current = call.parent;
  while (current) {
    if (ts.isIfStatement(current)) {
      const condition = current.expression.getText();
      if (requiredPattern.test(condition)) return true;
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
    if (
      ts.isElementAccessExpression(node) &&
      /\.auth\.admin$/.test(node.expression.getText())
    ) {
      findings.push(`${filePath}: dynamic auth.admin access is forbidden`);
    }

    if (ts.isCallExpression(node)) {
      const match = node.expression
        .getText()
        .match(/\.auth\.admin\.(deleteUser|getUserById|[A-Za-z0-9_]+)$/);
      if (match) {
        const method = match[1];
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
          if (
            node.arguments.length !== 2 ||
            node.arguments[1].kind !== ts.SyntaxKind.FalseKeyword
          ) {
            findings.push(
              `${filePath}: deleteUser requires literal false as its second argument`,
            );
          }
          if (
            !/prepared\.(?:uid|user_id)/.test(
              node.arguments[0]?.getText() ?? "",
            )
          ) {
            findings.push(
              `${filePath}: deleteUser identity must come from the prepared job result`,
            );
          }
          if (!source.includes('.rpc("prepare_auth_deletion_call"')) {
            findings.push(
              `${filePath}: deleteAuthUser must prepare the job-bound deletion call`,
            );
          }
          if (
            !callIsInsideRequiredIf(
              node,
              /(?:prepared\.allowed|prepared\.status\s*===\s*["']prepared["'])[\s\S]*(?:callBefore|call_before)[\s\S]*(?:Date\.now|now)/,
            )
          ) {
            findings.push(
              `${filePath}: deleteUser must be dominated by prepare success and call_before`,
            );
          }
        } else if (method === "getUserById") {
          if (
            !source.includes('.rpc("resolve_notification_recipient_identity"')
          ) {
            findings.push(
              `${filePath}: recipient lookup requires the job-bound identity RPC`,
            );
          }
          if (
            !callIsInsideRequiredIf(
              node,
              /!(?:identity|recipient)[A-Za-z]*Error[\s\S]*(?:identity|recipient)[\s\S]*(?:uid|userId|user_id)/,
            )
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

function verifyInternalRpc(source, findings) {
  if (!/^import ["']server-only["'];/m.test(source)) {
    findings.push(`${INTERNAL_RPC_PATH}: must import server-only`);
  }
  if (hasDirectTableCall(INTERNAL_RPC_PATH, source)) {
    findings.push(`${INTERNAL_RPC_PATH}: direct table access is forbidden`);
  }

  const file = sourceFile(INTERNAL_RPC_PATH, source);
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
      if (!body.includes("withOwnerMutationActor")) {
        findings.push(
          `${INTERNAL_RPC_PATH}: ${name} must use withOwnerMutationActor`,
        );
      }
      if (!body.includes(".abortSignal(signal)")) {
        findings.push(
          `${INTERNAL_RPC_PATH}: ${name} must bind the owner deadline signal`,
        );
      }
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

  const rpcCalls = [...source.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  const allowedRpcNames = new Set(ALLOWED_RPC_EXPORTS.values());
  for (const rpcName of rpcCalls) {
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

function extractSqlFunction(sql, name) {
  const startPattern = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`,
    "i",
  );
  const start = sql.search(startPattern);
  if (start < 0) return undefined;
  const afterStart = sql.slice(start);
  const tagMatch = afterStart.match(/\bas\s+(\$[A-Za-z0-9_]*\$)/i);
  if (!tagMatch || tagMatch.index === undefined)
    return { signature: afterStart, body: "" };
  const tag = tagMatch[1];
  const bodyStart = tagMatch.index + tagMatch[0].length;
  const bodyEnd = afterStart.indexOf(tag, bodyStart);
  return {
    signature: afterStart.slice(0, tagMatch.index),
    body: bodyEnd < 0 ? "" : afterStart.slice(bodyStart, bodyEnd),
  };
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
    const parsed = extractSqlFunction(sql, name);
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

export function verifyDataAccessFiles(files) {
  const findings = [];

  for (const [filePath, source] of Object.entries(files)) {
    if (/^(?:app|lib)\//.test(filePath)) {
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
  await collectFiles(root, "app", [".ts", ".tsx", ".mjs"], files);
  await collectFiles(root, "lib", [".ts", ".tsx", ".mjs"], files);
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
