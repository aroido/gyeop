import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("../../", import.meta.url).pathname);
const key = Buffer.alloc(32, 27).toString("base64url");

function localSupabase() {
  const output = execFileSync(
    "pnpm",
    ["exec", "supabase", "status", "-o", "env"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const values = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = JSON.parse(match[2]);
  }
  return values;
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
    { stdio: "ignore" },
  );
}

async function startServer(port, supabaseUrl, secretKey) {
  const child = spawn(
    "pnpm",
    [
      "exec",
      "next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        ACCOUNT_DELETE_REAUTH_KEYRING: JSON.stringify({ v1: key }),
        ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION: "v1",
        APP_URL: "https://gyeop.test",
        ORIGIN_PROXY_SECRET: key,
        RATE_LIMIT_SECRET: Buffer.alloc(32, 28).toString("base64url"),
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEY: secretKey,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      logs = (logs + chunk.toString()).slice(-8000);
    });
  }
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.status < 500) return { child, logs: () => logs };
    } catch {
      // Production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill("SIGKILL");
  throw new Error(`Production server did not start:\n${logs}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function html(port, pathname = "/") {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
  return { response, body: await response.text() };
}

test("one production build reflects runtime activation and fails closed", async () => {
  const local = localSupabase();
  assert.ok(local.API_URL && local.SECRET_KEY);
  setOldFriendActive(false);

  const working = await startServer(3106, local.API_URL, local.SECRET_KEY);
  try {
    const inactive = await html(3106);
    assert.equal(inactive.response.status, 200);
    assert.match(inactive.body, /팩 준비 중/);
    assert.doesNotMatch(inactive.body, /href="\/play\/old-friend"/);
    assert.equal((await html(3106, "/play/old-friend")).response.status, 404);

    setOldFriendActive(true);
    const active = await html(3106);
    assert.equal(active.response.status, 200);
    assert.match(active.body, /href="\/play\/old-friend"/);
    assert.match(active.body, /오래된 친구/);
    assert.match(active.body, /낮은 민감도/);
    const play = await html(3106, "/play/old-friend");
    assert.equal(play.response.status, 200);
    assert.match(play.body, /서운한 일이 생기면 나는\?/);

    setOldFriendActive(false);
    const inactiveAgain = await html(3106);
    assert.match(inactiveAgain.body, /팩 준비 중/);
    assert.doesNotMatch(inactiveAgain.body, /href="\/play\/old-friend"/);
  } finally {
    setOldFriendActive(false);
    await stopServer(working.child);
  }

  const broken = await startServer(
    3107,
    "http://127.0.0.1:9",
    local.SECRET_KEY,
  );
  try {
    const fallback = await html(3107);
    assert.equal(fallback.response.status, 200);
    assert.match(fallback.body, /팩 준비 중/);
    assert.doesNotMatch(fallback.body, /href="\/play\/old-friend"/);
    assert.equal((await html(3107, "/play/old-friend")).response.status, 404);
  } finally {
    await stopServer(broken.child);
  }
});
