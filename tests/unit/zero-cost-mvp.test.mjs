import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  verifyDockerfile,
  verifyDockerignore,
  verifyRenderYaml,
  verifyZeroCostMvp,
} from "../../scripts/verify-zero-cost-mvp.mjs";

const root = path.resolve(new URL("../../", import.meta.url).pathname);
const renderYaml = readFileSync(path.join(root, "render.yaml"), "utf8");
const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
const dockerignore = readFileSync(path.join(root, ".dockerignore"), "utf8");

test("accepts the repository zero-cost declarations", () => {
  assert.doesNotThrow(() => verifyZeroCostMvp(root));
});

test("rejects additional hosted resources", () => {
  const secondService = `${renderYaml}\n  - type: web\n    name: another\n    runtime: docker\n    plan: free\n`;
  assert.throws(() => verifyRenderYaml(secondService), /exactly one service/);
  assert.throws(
    () =>
      verifyRenderYaml(
        `${renderYaml}\n  - type: cron\n    name: scheduled\n    runtime: docker\n    plan: free\n`,
      ),
    /exactly one service/,
  );
  assert.throws(
    () => verifyRenderYaml(`${renderYaml}\ndatabases:\n  - name: extra\n`),
    /unsupported root declaration/,
  );
});

test("rejects changed and duplicate service contracts", () => {
  for (const [needle, replacement, expected] of [
    ["plan: free", "plan: starter", /plan must be free/],
    ["runtime: docker", "runtime: node", /runtime must be docker/],
    ["name: gyeop-private-mvp", "name: other", /name must be/],
    ["    plan: free", "    plan: free\n    plan: starter", /duplicate plan/],
    ["  - type: web", "  - type: web\n    type: web", /duplicate type/],
    ["    name:", "    name: gyeop-private-mvp\n    name:", /duplicate name/],
    ["    runtime:", "    runtime: docker\n    runtime:", /duplicate runtime/],
  ]) {
    assert.throws(
      () => verifyRenderYaml(renderYaml.replace(needle, replacement)),
      expected,
    );
  }
  assert.throws(
    () => verifyRenderYaml(`${renderYaml}\nservices:\n`),
    /duplicate services/,
  );
});

test("rejects malformed and unsupported Render YAML", () => {
  assert.throws(
    () => verifyRenderYaml(renderYaml.replace("    name:", "   name:")),
    /malformed indentation/,
  );
  assert.throws(
    () =>
      verifyRenderYaml(renderYaml.replace("plan: free", "plan: &tier free")),
    /unsupported scalar syntax/,
  );
  assert.throws(
    () => verifyRenderYaml(renderYaml.replace("envVars:", "envVars: {}")),
    /unsupported scalar syntax/,
  );
  for (const field of [
    "numInstances: 2",
    "pullRequestPreviewsEnabled: true",
    "region: oregon",
  ]) {
    assert.throws(
      () =>
        verifyRenderYaml(
          renderYaml.replace("    envVars:", `    ${field}\n    envVars:`),
        ),
      /unsupported service field/,
    );
  }
});

test("requires the exact public Docker build arguments", () => {
  assert.throws(
    () =>
      verifyDockerfile(
        dockerfile.replace("ARG NEXT_PUBLIC_SUPABASE_URL\n", ""),
      ),
    /build ARGs must be exactly/,
  );
  assert.throws(
    () => verifyDockerfile(`${dockerfile}\nARG NEXT_PUBLIC_OTHER\n`),
    /build ARGs must be exactly/,
  );
  assert.throws(
    () => verifyDockerfile(`${dockerfile}\nARG NEXT_PUBLIC_SUPABASE_URL\n`),
    /duplicate ARG/,
  );
  assert.throws(
    () =>
      verifyDockerfile(
        dockerfile.replace("ARG NEXT_PUBLIC_GA_MEASUREMENT_ID\n", ""),
      ),
    /build ARGs must be exactly/,
  );
});

test("requires every public build value in the Render environment", () => {
  assert.throws(
    () =>
      verifyRenderYaml(
        renderYaml.replace(
          "      - key: NEXT_PUBLIC_GA_MEASUREMENT_ID\n        sync: false\n",
          "",
        ),
      ),
    /NEXT_PUBLIC_GA_MEASUREMENT_ID build environment is required/,
  );
});

test("rejects known and pattern-matched server secrets in Docker ARG and ENV", () => {
  for (const declaration of [
    "ARG SUPABASE_SECRET_KEY",
    "ARG SUPABASE_SERVICE_ROLE_KEY",
    "ENV ORIGIN_PROXY_SECRET=placeholder",
    "ENV ORIGIN_PROXY_WRITER_SECRET=placeholder",
    "ENV ORIGIN_PROXY_SECONDARY_SECRET=placeholder",
    "ENV RATE_LIMIT_SECRET=$RATE_LIMIT_SECRET",
    "ARG ACCOUNT_DELETE_REAUTH_KEYRING",
    "ENV CRON_SECRET=placeholder",
    "ENV RESEND_API_KEY=placeholder",
    "ENV FUTURE_API_KEY=placeholder",
    "ENV NOTIFICATION_FINGERPRINT_KEYRING=placeholder",
    "ENV GITHUB_TOKEN=$GITHUB_TOKEN",
    "ENV DATABASE_PASSWORD=placeholder",
    "ENV SIGNING_PRIVATE_KEY=placeholder",
    "ENV SERVICE_ROLE=placeholder",
    "ENV SAFE_NAME=$FUTURE_SECRET",
  ]) {
    assert.throws(
      () => verifyDockerfile(`${dockerfile}\n${declaration}\n`),
      /forbidden in (?:ARG|ENV)/,
    );
  }
});

test("requires .env and .env.* Docker context exclusions", () => {
  assert.throws(
    () => verifyDockerignore(dockerignore.replace(".env\n", "")),
    /.env exclusion is required/,
  );
  assert.throws(
    () => verifyDockerignore(dockerignore.replace(".env.*\n", "")),
    /.env.\* exclusion is required/,
  );
});

test("rejects every active Docker ignore negation", () => {
  for (const negation of [
    "!.env",
    "!.env.local",
    "!.env.production",
    "!.e??.production",
    "!README.md",
    "!*",
    "!**/*",
  ]) {
    assert.throws(
      () => verifyDockerignore(`${dockerignore}\n${negation}\n`),
      /negation rules are unsupported/,
    );
  }
});
