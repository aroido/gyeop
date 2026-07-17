import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import path from "node:path";
import test, { after, before } from "node:test";

const root = path.resolve(new URL("../../", import.meta.url).pathname);

function localSupabase() {
  const output = execFileSync(
    "pnpm",
    ["exec", "supabase", "status", "-o", "env"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const values = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = JSON.parse(match[2]);
  }
  for (const name of ["API_URL", "SECRET_KEY"]) {
    if (!values[name]) throw new Error(`Local Supabase did not report ${name}`);
  }
  return values;
}

const local = localSupabase();
const proxySecret = Buffer.alloc(32, 18).toString("base64url");
const rateSecret = Buffer.alloc(32, 19).toString("base64url");
const serverEnv = {
  ...process.env,
  APP_URL: "http://127.0.0.1:3105",
  ORIGIN_PROXY_SECRET: proxySecret,
  RATE_LIMIT_SECRET: rateSecret,
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  SUPABASE_SECRET_KEY: local.SECRET_KEY,
};
let server;
let serverLog = "";

before(async () => {
  server = spawn(
    "pnpm",
    ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", "3105"],
    { cwd: root, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => {
      serverLog = (serverLog + chunk.toString()).slice(-8000);
    });
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:3105/");
      if (response.ok) return;
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Pack catalog server did not start:\n${serverLog}`);
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
});

function catalogRequest(slug, ip) {
  return fetch(`http://127.0.0.1:3105/api/packs/${slug}`, {
    headers: {
      "x-forwarded-for": ip,
      "x-forwarded-host": "127.0.0.1",
      "x-forwarded-proto": "https",
      "x-forwarded-port": "443",
      "x-gyeop-origin-verify": proxySecret,
    },
  });
}

function setOldFriendActive(active) {
  execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_gyeop",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `update public.pack_templates set is_active = ${active ? "true" : "false"} where slug = 'old-friend'`,
    ],
    { cwd: root, stdio: "ignore" },
  );
}

test("inactive and unknown packs share the same redacted 404", async () => {
  setOldFriendActive(false);
  const inactive = await catalogRequest("old-friend", "198.51.100.10");
  const unknown = await catalogRequest("unknown", "198.51.100.11");
  assert.equal(inactive.status, 404);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await inactive.json(), {
    code: "PACK_NOT_FOUND",
    message: "팩을 찾을 수 없습니다.",
  });
  assert.deepEqual(await unknown.json(), {
    code: "PACK_NOT_FOUND",
    message: "팩을 찾을 수 없습니다.",
  });
  for (const response of [inactive, unknown]) {
    assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
});

test("active pack returns only the approved published fields", async () => {
  setOldFriendActive(true);
  try {
    const response = await catalogRequest("old-friend", "198.51.100.12");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), [
      "cards",
      "sensitivity",
      "slug",
      "targetRelationship",
      "title",
      "version",
    ]);
    assert.equal(body.slug, "old-friend");
    assert.equal(body.version, "old-friend-v1");
    assert.equal(body.cards.length, 10);
    assert.equal(body.cards[0].ownerPrompt, "서운한 일이 생기면 나는?");
    assert.deepEqual(Object.keys(body.cards[0]).sort(), [
      "id",
      "isSignature",
      "optionA",
      "optionB",
      "ownerPrompt",
      "position",
      "visitorPrompt",
    ]);
    assert.equal(JSON.stringify(body).includes("published_at"), false);
    assert.equal(JSON.stringify(body).includes("11111111"), false);
  } finally {
    setOldFriendActive(false);
  }
});

test("catalog network limiter allows sixty calls then returns 429", async () => {
  setOldFriendActive(false);
  const responses = await Promise.all(
    Array.from({ length: 61 }, () =>
      catalogRequest("old-friend", "203.0.113.77"),
    ),
  );
  assert.equal(
    responses.filter((response) => response.status === 404).length,
    60,
  );
  const limited = responses.filter((response) => response.status === 429);
  assert.equal(limited.length, 1);
  assert.match(limited[0].headers.get("retry-after"), /^[1-9][0-9]*$/);
  assert.deepEqual(await limited[0].json(), {
    code: "RATE_LIMITED",
    message: "잠시 후 다시 시도해 주세요.",
  });
});
