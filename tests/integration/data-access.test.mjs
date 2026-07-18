import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("../../", import.meta.url).pathname);

function localSupabase() {
  const output = execFileSync(
    "pnpm",
    [
      "exec",
      "supabase",
      "status",
      "-o",
      "env",
      "--override-name",
      "api.url=SUPABASE_URL",
      "--override-name",
      "auth.anon_key=SUPABASE_ANON_KEY",
      "--override-name",
      "auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY",
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const values = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = JSON.parse(match[2]);
  }

  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!values[name]) throw new Error(`Local Supabase did not report ${name}`);
  }
  return values;
}

const local = localSupabase();

function headers(key) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

async function waitForDataApiSchema() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(
      `${local.SUPABASE_URL}/rest/v1/rpc/consume_rate_limit`,
      {
        method: "POST",
        headers: headers(local.SUPABASE_SERVICE_ROLE_KEY),
        body: JSON.stringify({
          p_key_hash: `\\x${randomBytes(32).toString("hex")}`,
          p_action: "schema_readiness_probe",
          p_window_seconds: 60,
          p_limit: 1,
        }),
      },
    );
    if (response.ok) return;
    if (response.status !== 503) {
      throw new Error(
        `Local Data API readiness failed with ${response.status}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Local Data API schema cache did not become ready");
}

await waitForDataApiSchema();

async function tableRequest(method, table, key) {
  const now = new Date();
  const later = new Date(now.getTime() + 60_000);
  const fixtures = {
    analytics_events: {
      query: "id=eq.00000000-0000-0000-0000-000000000000",
      insert: { event_name: "blocked_probe" },
      update: { event_name: "blocked_update" },
    },
    rate_limit_buckets: {
      query: "action=eq.blocked_probe",
      insert: {
        key_hash: `\\x${randomBytes(32).toString("hex")}`,
        action: "blocked_probe",
        window_start: now.toISOString(),
        count: 1,
        expires_at: later.toISOString(),
      },
      update: { count: 2 },
    },
    pack_templates: {
      query: "slug=eq.old-friend",
      insert: {
        slug: "blocked-pack",
        title: "Blocked",
        target_relationship: "old_friend",
        sensitivity: "low",
      },
      update: { title: "Blocked update" },
    },
    pack_versions: {
      query: "version=eq.old-friend-v1",
      insert: {
        template_id: "11111111-1111-4111-8111-111111111111",
        version: "blocked-v1",
      },
      update: { version: "blocked-v2" },
    },
    pack_cards: {
      query: "id=eq.conflict",
      insert: {
        pack_version_id: "15151515-1515-4515-8515-151515151515",
        id: "blocked-card",
        position: 1,
        owner_prompt: "Blocked owner",
        visitor_prompt: "Blocked visitor",
        option_a: "A",
        option_b: "B",
      },
      update: { owner_prompt: "Blocked update" },
    },
    pack_plays: {
      query: "id=eq.17000000-0000-4000-8000-000000000000",
      insert: {
        id: "17000000-0000-4000-8000-000000000000",
        pack_version_id: "15151515-1515-4515-8515-151515151515",
        management_secret_hash: `\\x${randomBytes(32).toString("hex")}`,
        last_active_at: now.toISOString(),
        management_expires_at: new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      update: { current_position: 2 },
    },
    self_answers: {
      query: "card_id=eq.conflict",
      insert: {
        pack_play_id: "17000000-0000-4000-8000-000000000000",
        pack_version_id: "15151515-1515-4515-8515-151515151515",
        card_id: "conflict",
        choice: "a",
      },
      update: { choice: "b" },
    },
  };
  const fixture = fixtures[table];
  if (!fixture) throw new Error(`Missing table fixture for ${table}`);

  return fetch(`${local.SUPABASE_URL}/rest/v1/${table}?${fixture.query}`, {
    method,
    headers: headers(key),
    body:
      method === "GET" || method === "DELETE"
        ? undefined
        : JSON.stringify(method === "POST" ? fixture.insert : fixture.update),
  });
}

test("anon and service keys cannot access application tables directly", async () => {
  for (const key of [
    local.SUPABASE_ANON_KEY,
    local.SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    for (const table of [
      "analytics_events",
      "rate_limit_buckets",
      "pack_templates",
      "pack_versions",
      "pack_cards",
      "pack_plays",
      "self_answers",
    ]) {
      for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
        const response = await tableRequest(method, table, key);
        assert.ok(
          [401, 403, 404].includes(response.status),
          `${method} ${table} must be denied, got ${response.status}`,
        );
      }
    }
  }
});

test("anon key cannot execute the mutation RPC", async () => {
  const response = await fetch(
    `${local.SUPABASE_URL}/rest/v1/rpc/consume_rate_limit`,
    {
      method: "POST",
      headers: headers(local.SUPABASE_ANON_KEY),
      body: JSON.stringify({
        p_key_hash: `\\x${randomBytes(32).toString("hex")}`,
        p_action: "anon_probe",
        p_window_seconds: 60,
        p_limit: 1,
      }),
    },
  );
  assert.ok(
    [401, 403, 404].includes(response.status),
    `anon RPC must be denied, got ${response.status}`,
  );
});

test("anon key cannot execute owner play RPCs", async () => {
  for (const [rpc, body] of [
    [
      "create_or_resume_play",
      {
        p_pack_slug: "old-friend",
        p_existing_play_id: null,
        p_existing_secret_hash: null,
        p_new_play_id: "17000000-0000-4000-8000-000000000009",
        p_new_secret_hash: `\\x${randomBytes(32).toString("hex")}`,
        p_network_key: `\\x${randomBytes(32).toString("hex")}`,
      },
    ],
    [
      "get_owner_play",
      {
        p_play_id: "17000000-0000-4000-8000-000000000009",
        p_management_secret_hash: `\\x${randomBytes(32).toString("hex")}`,
      },
    ],
  ]) {
    const response = await fetch(`${local.SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: headers(local.SUPABASE_ANON_KEY),
      body: JSON.stringify(body),
    });
    assert.ok(
      [401, 403, 404].includes(response.status),
      `anon ${rpc} must be denied, got ${response.status}`,
    );
  }
});

test("anon key cannot execute pack catalog or publication RPCs", async () => {
  for (const [name, body] of [
    ["get_published_pack", { p_slug: "old-friend" }],
    [
      "publish_pack_version",
      { p_pack_version_id: "15151515-1515-4515-8515-151515151515" },
    ],
  ]) {
    const response = await fetch(`${local.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: headers(local.SUPABASE_ANON_KEY),
      body: JSON.stringify(body),
    });
    assert.ok(
      [401, 403, 404].includes(response.status),
      `anon ${name} must be denied, got ${response.status}`,
    );
  }
});

test("service RPC atomically counts competing calls", async () => {
  const requestCount = 20;
  const limit = 5;
  const keyHash = `\\x${randomBytes(32).toString("hex")}`;

  const responses = await Promise.all(
    Array.from({ length: requestCount }, () =>
      fetch(`${local.SUPABASE_URL}/rest/v1/rpc/consume_rate_limit`, {
        method: "POST",
        headers: headers(local.SUPABASE_SERVICE_ROLE_KEY),
        body: JSON.stringify({
          p_key_hash: keyHash,
          p_action: "concurrent_probe",
          p_window_seconds: 60,
          p_limit: limit,
        }),
      }),
    ),
  );

  assert.ok(
    responses.every((response) => response.ok),
    `service RPC statuses: ${responses.map((response) => response.status).join(",")}`,
  );
  const rows = (
    await Promise.all(responses.map((response) => response.json()))
  ).map((result) => result[0]);
  assert.deepEqual(
    rows.map((row) => row.current_count).sort((left, right) => left - right),
    Array.from({ length: requestCount }, (_, index) => index + 1),
  );
  assert.equal(rows.filter((row) => row.allowed).length, limit);
  assert.ok(
    rows
      .filter((row) => !row.allowed)
      .every((row) => row.retry_after_seconds > 0),
  );
});
