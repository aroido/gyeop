import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_BUILD_ARGS = new Set([
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
]);
const RENDER_SERVICE_KEYS = new Set([
  "type",
  "name",
  "runtime",
  "plan",
  "healthCheckPath",
  "autoDeployTrigger",
  "envVars",
]);
const SERVER_SECRET_NAMES = new Set([
  "ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION",
  "ACCOUNT_DELETE_REAUTH_KEYRING",
  "CRON_SECRET",
  "NOTIFICATION_FINGERPRINT_KEYRING",
  "ORIGIN_PROXY_SECONDARY_SECRET",
  "ORIGIN_PROXY_SECRET",
  "ORIGIN_PROXY_WRITER_SECRET",
  "RATE_LIMIT_SECRET",
  "RESEND_API_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);
const SAFE_DOCKER_IDENTIFIERS = new Set([...PUBLIC_BUILD_ARGS, "NODE_ENV"]);
const SERVER_SECRET_PATTERN =
  /(?:^|_)(?:SECRET|TOKEN|KEYRING|PASSWORD|PRIVATE_KEY|SERVICE_ROLE)(?:_|$)|^RESEND_API_KEY$/;
const SAFE_SCALAR = /^[A-Za-z0-9_./-]+$/;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function mapping(text, lineNumber) {
  const match = /^([A-Za-z][A-Za-z0-9]*):(.*)$/.exec(text);
  invariant(match, `render.yaml:${lineNumber}: unsupported mapping syntax`);
  const suffix = match[2];
  if (suffix === "") return { key: match[1], value: null };
  invariant(
    suffix.startsWith(" ") && suffix.trim() === suffix.slice(1),
    `render.yaml:${lineNumber}: malformed scalar spacing`,
  );
  const value = suffix.slice(1);
  invariant(
    SAFE_SCALAR.test(value),
    `render.yaml:${lineNumber}: unsupported scalar syntax`,
  );
  return { key: match[1], value };
}

function setUnique(fields, key, value, lineNumber) {
  invariant(
    !fields.has(key),
    `render.yaml:${lineNumber}: duplicate ${key} declaration`,
  );
  fields.set(key, value);
}

export function verifyRenderYaml(renderYaml) {
  let servicesDeclarations = 0;
  const services = [];
  let service = null;
  let envVars = false;
  let envVar = null;

  for (const [index, raw] of renderYaml.split("\n").entries()) {
    const lineNumber = index + 1;
    invariant(
      !raw.includes("\t"),
      `render.yaml:${lineNumber}: tabs are unsupported`,
    );
    invariant(
      raw === raw.trimEnd(),
      `render.yaml:${lineNumber}: trailing whitespace is unsupported`,
    );
    const text = raw.trimStart();
    if (text === "" || text.startsWith("#")) continue;
    const indent = raw.length - text.length;
    invariant(
      indent % 2 === 0,
      `render.yaml:${lineNumber}: malformed indentation`,
    );

    if (indent === 0) {
      const entry = mapping(text, lineNumber);
      invariant(
        entry.key === "services" && entry.value === null,
        `render.yaml:${lineNumber}: unsupported root declaration`,
      );
      servicesDeclarations += 1;
      invariant(
        servicesDeclarations === 1,
        `render.yaml:${lineNumber}: duplicate services declaration`,
      );
      service = null;
      envVars = false;
      envVar = null;
      continue;
    }

    invariant(
      servicesDeclarations === 1,
      `render.yaml:${lineNumber}: content before services declaration`,
    );

    if (indent === 2) {
      invariant(
        text.startsWith("- "),
        `render.yaml:${lineNumber}: malformed service item`,
      );
      const entry = mapping(text.slice(2), lineNumber);
      invariant(
        entry.key === "type" && entry.value !== null,
        `render.yaml:${lineNumber}: service item must start with type`,
      );
      service = new Map();
      setUnique(service, entry.key, entry.value, lineNumber);
      services.push(service);
      envVars = false;
      envVar = null;
      continue;
    }

    invariant(service, `render.yaml:${lineNumber}: service field without item`);

    if (indent === 4) {
      const entry = mapping(text, lineNumber);
      invariant(
        RENDER_SERVICE_KEYS.has(entry.key),
        `render.yaml:${lineNumber}: unsupported service field ${entry.key}`,
      );
      setUnique(service, entry.key, entry.value, lineNumber);
      if (entry.key === "envVars") {
        invariant(
          entry.value === null,
          `render.yaml:${lineNumber}: envVars must be a list`,
        );
        envVars = true;
      } else {
        invariant(
          entry.value !== null,
          `render.yaml:${lineNumber}: unsupported nested service field`,
        );
        envVars = false;
      }
      envVar = null;
      continue;
    }

    if (indent === 6) {
      invariant(envVars, `render.yaml:${lineNumber}: unsupported nested list`);
      invariant(
        text.startsWith("- "),
        `render.yaml:${lineNumber}: malformed envVars item`,
      );
      const entry = mapping(text.slice(2), lineNumber);
      invariant(
        entry.key === "key" &&
          entry.value !== null &&
          /^[A-Z][A-Z0-9_]*$/.test(entry.value),
        `render.yaml:${lineNumber}: envVars item must start with a literal key`,
      );
      envVar = new Map([[entry.key, entry.value]]);
      continue;
    }

    if (indent === 8) {
      invariant(
        envVar,
        `render.yaml:${lineNumber}: envVars field without item`,
      );
      const entry = mapping(text, lineNumber);
      invariant(
        entry.key === "sync" && entry.value === "false",
        `render.yaml:${lineNumber}: only sync: false is supported for envVars`,
      );
      setUnique(envVar, entry.key, entry.value, lineNumber);
      continue;
    }

    throw new Error(`render.yaml:${lineNumber}: unsupported indentation`);
  }

  invariant(servicesDeclarations === 1, "render.yaml: services is required");
  invariant(
    services.length === 1,
    "render.yaml: exactly one service is required",
  );
  const fields = services[0];
  const required = {
    type: "web",
    name: "gyeop-private-mvp",
    runtime: "docker",
    plan: "free",
  };
  for (const [key, value] of Object.entries(required)) {
    invariant(
      fields.get(key) === value,
      `render.yaml: ${key} must be ${value}`,
    );
  }
  return required;
}

export function verifyDockerfile(dockerfile) {
  const buildArgs = [];
  for (const [index, raw] of dockerfile.split("\n").entries()) {
    const lineNumber = index + 1;
    const text = raw.trim();
    if (text === "" || text.startsWith("#")) continue;
    const instruction = /^(ARG|ENV)\b/i.exec(text)?.[1]?.toUpperCase();
    if (!instruction) continue;
    invariant(
      !text.endsWith("\\"),
      `Dockerfile:${lineNumber}: multiline ${instruction} is unsupported`,
    );
    const identifiers = text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    for (const identifier of identifiers) {
      const normalized = identifier.toUpperCase();
      if (SAFE_DOCKER_IDENTIFIERS.has(normalized)) continue;
      invariant(
        !SERVER_SECRET_NAMES.has(normalized) &&
          !SERVER_SECRET_PATTERN.test(normalized),
        `Dockerfile:${lineNumber}: ${identifier} is forbidden in ${instruction}`,
      );
    }
    if (instruction !== "ARG") continue;
    const match = /^ARG\s+([A-Za-z_][A-Za-z0-9_]*)(?:=[^\s]+)?$/i.exec(text);
    invariant(match, `Dockerfile:${lineNumber}: unsupported ARG declaration`);
    invariant(
      !buildArgs.includes(match[1]),
      `Dockerfile:${lineNumber}: duplicate ARG ${match[1]}`,
    );
    buildArgs.push(match[1]);
  }

  const actual = [...buildArgs].sort();
  const expected = [...PUBLIC_BUILD_ARGS].sort();
  invariant(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Dockerfile: build ARGs must be exactly ${expected.join(", ")}`,
  );
  return actual;
}

export function verifyDockerignore(dockerignore) {
  const rules = dockerignore
    .split("\n")
    .map((raw, index) => ({ text: raw.trim(), lineNumber: index + 1 }))
    .filter(({ text }) => text !== "" && !text.startsWith("#"));
  for (const { text, lineNumber } of rules) {
    invariant(
      !text.startsWith("!"),
      `.dockerignore:${lineNumber}: negation rules are unsupported`,
    );
  }
  for (const required of [".env", ".env.*"]) {
    invariant(
      rules.some(({ text }) => text === required),
      `.dockerignore: ${required} exclusion is required`,
    );
  }

  return [".env", ".env.*"];
}

export function verifyZeroCostMvpSources({
  renderYaml,
  dockerfile,
  dockerignore,
}) {
  return {
    render: verifyRenderYaml(renderYaml),
    buildArgs: verifyDockerfile(dockerfile),
    dockerignore: verifyDockerignore(dockerignore),
  };
}

export function verifyZeroCostMvp(root = ROOT) {
  return verifyZeroCostMvpSources({
    renderYaml: readFileSync(path.join(root, "render.yaml"), "utf8"),
    dockerfile: readFileSync(path.join(root, "Dockerfile"), "utf8"),
    dockerignore: readFileSync(path.join(root, ".dockerignore"), "utf8"),
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = verifyZeroCostMvp();
  console.log(
    `Zero-cost MVP declaration check passed: services=1 plan=${result.render.plan} buildArgs=${result.buildArgs.join(",")} dockerignore=${result.dockerignore.join(",")}`,
  );
}
