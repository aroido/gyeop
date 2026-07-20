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

async function html(port, pathname = "/", redirect = "follow") {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    redirect,
  });
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
    assert.match(inactive.body, /오래 본 너의 시선/);
    assert.doesNotMatch(inactive.body, /href="\/play\/new\?pack=old-friend"/);
    assert.match(inactive.body, /href="\/play\/new\?pack=first-impression"/);
    assert.match(inactive.body, /href="\/play\/new\?pack=coworker"/);
    assert.match(inactive.body, /href="\/play\/new\?pack=honest-self"/);
    const inactiveLegacy = await html(3106, "/play/old-friend", "manual");
    assert.equal(inactiveLegacy.response.status, 307);
    assert.equal(
      inactiveLegacy.response.headers.get("location"),
      "/play/new?pack=old-friend",
    );

    setOldFriendActive(true);
    const active = await html(3106);
    assert.equal(active.response.status, 200);
    assert.match(active.body, /href="\/play\/new\?pack=old-friend"/);
    assert.match(active.body, /오래 본 너의 시선/);
    assert.match(active.body, /낮은 민감도/);
    const play = await html(3106, "/play/new?pack=old-friend");
    assert.equal(play.response.status, 200);
    assert.match(
      play.body,
      /오래 본 너의 시선(?:<!-- -->)? 질문을 준비하는 중/,
    );
    assert.doesNotMatch(play.body, /만 19세 이상/);

    setOldFriendActive(false);
    const inactiveAgain = await html(3106);
    assert.match(inactiveAgain.body, /오래 본 너의 시선/);
    assert.doesNotMatch(
      inactiveAgain.body,
      /href="\/play\/new\?pack=old-friend"/,
    );
  } finally {
    setOldFriendActive(true);
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
    assert.match(fallback.body, /준비 중/);
    assert.match(fallback.body, /오래 본 너의 시선/);
    assert.match(fallback.body, /처음 만난 너의 시선/);
    assert.match(fallback.body, /같이 일한 너의 시선/);
    assert.match(fallback.body, /가까운 너의 시선/);
    assert.doesNotMatch(fallback.body, /href="\/play\/new\?pack=old-friend"/);
    assert.doesNotMatch(
      fallback.body,
      /href="\/play\/new\?pack=first-impression"/,
    );
    assert.doesNotMatch(fallback.body, /href="\/play\/new\?pack=coworker"/);
    assert.doesNotMatch(fallback.body, /href="\/play\/new\?pack=honest-self"/);
    assert.equal(
      (await html(3107, "/play/old-friend", "manual")).response.status,
      307,
    );
  } finally {
    setOldFriendActive(true);
    await stopServer(broken.child);
  }
});
