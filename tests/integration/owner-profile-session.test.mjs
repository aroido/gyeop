import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { randomBytes, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import {
  OWNER_COOKIE_NAME,
  createOwnerCredential,
} from "../../lib/owner-play/owner-play-session-core.mjs";

const root = new URL("../../", import.meta.url).pathname;
const versionId = "e05e6366-2a00-4798-8273-0af5f16aad10";
const proxySecret = Buffer.alloc(32, 27).toString("base64url");
const rateSecret = randomBytes(32).toString("base64url");
const accountDeleteKey = Buffer.alloc(32, 26).toString("base64url");
const appUrl = "http://127.0.0.1:3107";
let server;
let serverLog = "";
let testAccount;

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
  return values;
}

const local = localSupabase();
for (const name of ["ANON_KEY", "API_URL", "SECRET_KEY"]) {
  if (!local[name]) throw new Error(`Local Supabase did not report ${name}`);
}
const serverEnv = {
  ...process.env,
  ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION: "v1",
  ACCOUNT_DELETE_REAUTH_KEYRING: JSON.stringify({ v1: accountDeleteKey }),
  APP_URL: appUrl,
  ORIGIN_PROXY_SECRET: proxySecret,
  RATE_LIMIT_SECRET: rateSecret,
  GYEOP_NEXT_DIST_DIR: ".next/integration-owner-profile-3107",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  SUPABASE_SECRET_KEY: local.SECRET_KEY,
};

function sql(statement, output = false) {
  const result = execFileSync(
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
      ...(output ? ["-At"] : []),
      "-c",
      statement,
    ],
    { cwd: root, encoding: "utf8", stdio: output ? "pipe" : "ignore" },
  );
  return typeof result === "string" ? result.trim() : "";
}

function hashHex(credential) {
  return Buffer.from(credential.managementSecretHash).toString("hex");
}

function ownerCookie(credential) {
  return `${OWNER_COOKIE_NAME}=${credential.value}`;
}

async function createAuthenticatedAccount() {
  const email = `owner-profile-${randomBytes(8).toString("hex")}@example.com`;
  const password = `T3st-${randomBytes(12).toString("base64url")}`;
  const admin = createClient(local.API_URL, local.SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(created.error);
  assert.ok(created.data.user);

  const authCookies = new Map();
  const client = createServerClient(local.API_URL, local.ANON_KEY, {
    cookies: {
      getAll() {
        return [...authCookies].map(([name, value]) => ({ name, value }));
      },
      setAll(values) {
        for (const { name, value } of values) authCookies.set(name, value);
      },
    },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  assert.ok(signedIn.data.session);
  assert.ok(authCookies.size > 0, "SSR sign-in must persist an auth cookie");
  return {
    admin,
    cookie: [...authCookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; "),
    userId: created.data.user.id,
  };
}

function claimOwner(credential) {
  sql(
    `update public.pack_plays set owner_id = '${testAccount.userId}' where id = '${credential.playId}'`,
  );
}

function insertOwner(credential, completed) {
  const hash = hashHex(credential);
  sql(`
    with fixed_time as (select clock_timestamp() as value)
    insert into public.pack_plays (
      id, pack_version_id, management_secret_hash, management_expires_at,
      last_active_at, status, current_position, created_at, updated_at
    ) select
      '${credential.playId}', '${versionId}', decode('${hash}', 'hex'),
      value + interval '7 days', value, 'draft', ${completed ? 10 : 1}, value, value
    from fixed_time;
    ${
      completed
        ? `insert into public.self_answers (
            pack_play_id, pack_version_id, card_id, choice
          )
          select '${credential.playId}', '${versionId}', card.id,
            case when card.position % 2 = 0 then 'b' else 'a' end
          from public.pack_cards as card
          where card.pack_version_id = '${versionId}';
          update public.pack_plays
          set status = 'completed', completed_at = clock_timestamp()
          where id = '${credential.playId}';`
        : ""
    }
  `);
}

function insertLink(playId, kind) {
  const linkId = randomUUID();
  const publicId = randomBytes(16).toString("base64url");
  const hash = randomBytes(32).toString("hex");
  sql(`insert into public.share_links (
      id, public_id, pack_play_id, kind, secret_hash
    ) values (
      '${linkId}', '${publicId}', '${playId}', '${kind}', decode('${hash}', 'hex')
    )`);
  return linkId;
}

function insertSubmittedResponse(linkId, choice) {
  const responseId = randomUUID();
  const sessionHash = randomBytes(32).toString("hex");
  const managementHash = randomBytes(32).toString("hex");
  sql(`
    with fixed_time as (select clock_timestamp() as value)
    insert into public.visitor_responses (
      id, share_link_id, pack_version_id, relationship_code, known_since_code,
      status, session_token_hash, session_expires_at, management_token_hash,
      created_at, submitted_at
    ) select
      '${responseId}', '${linkId}', '${versionId}', 'old_friend',
      'ten_years_or_more', 'submitted', decode('${sessionHash}', 'hex'),
      value + interval '24 hours', decode('${managementHash}', 'hex'), value, value
    from fixed_time;
    insert into public.visitor_assignments (
      response_id, pack_version_id, card_id, stage, position
    ) values
      ('${responseId}', '${versionId}', 'reunion', 'required', 1),
      ('${responseId}', '${versionId}', 'conflict', 'required', 2),
      ('${responseId}', '${versionId}', 'plans', 'required', 3);
    insert into public.visitor_answers (
      response_id, pack_version_id, card_id, choice
    )
    select response_id, pack_version_id, card_id, '${choice}'
    from public.visitor_assignments
    where response_id = '${responseId}';
  `);
  return responseId;
}

function proxyHeaders(ip, extra = {}) {
  return {
    "x-forwarded-for": ip,
    "x-forwarded-host": "127.0.0.1",
    "x-forwarded-proto": "https",
    "x-forwarded-port": "443",
    "x-gyeop-origin-verify": proxySecret,
    ...extra,
  };
}

async function ownerRequest(
  pathname,
  { method = "GET", ip = "198.51.100.27", cookie, body } = {},
) {
  const headers = proxyHeaders(ip);
  if (cookie) headers.cookie = cookie;
  const options = { method, headers };
  if (body !== undefined) {
    headers.origin = appUrl;
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${appUrl}${pathname}`, options);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response;
}

before(async () => {
  testAccount = await createAuthenticatedAccount();
  server = spawn(
    "pnpm",
    ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", "3107"],
    { cwd: root, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => {
      serverLog = (serverLog + chunk.toString()).slice(-16000);
    });
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(appUrl);
      if (response.ok) return;
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Owner profile server did not start:\n${serverLog}`);
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (testAccount) {
    sql(
      `update public.pack_plays set owner_id = null where owner_id = '${testAccount.userId}'`,
    );
    const deleted = await testAccount.admin.auth.admin.deleteUser(
      testAccount.userId,
    );
    assert.ifError(deleted.error);
  }
});

test("profile access requires Auth and stays scoped to the requested owned play", async () => {
  const initialProfileViewCount = Number(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_viewed'",
      true,
    ),
  );
  const ownerA = createOwnerCredential();
  const ownerB = createOwnerCredential();
  const draft = createOwnerCredential();
  insertOwner(ownerA, true);
  insertOwner(ownerB, true);
  insertOwner(draft, false);
  claimOwner(ownerA);
  claimOwner(ownerB);
  claimOwner(draft);

  const absent = await ownerRequest(`/api/me/profile?playId=${ownerA.playId}`);
  const absentBody = await absent.json();
  assert.equal(absent.status, 401);
  assert.deepEqual(absentBody, {
    code: "OWNER_AUTH_REQUIRED",
    message: "로그인한 뒤 내 질문팩을 불러올 수 있어요.",
  });

  const malformed = await ownerRequest(
    `/api/me/profile?playId=${ownerA.playId}`,
    {
      cookie: `${OWNER_COOKIE_NAME}=bad`,
    },
  );
  assert.equal(malformed.status, 401);
  assert.deepEqual(await malformed.json(), absentBody);
  assert.equal(malformed.headers.get("set-cookie"), null);

  const anonymousOnly = await ownerRequest(
    `/api/me/profile?playId=${ownerA.playId}`,
    { cookie: ownerCookie(ownerA) },
  );
  assert.equal(anonymousOnly.status, 401);
  assert.deepEqual(await anonymousOnly.json(), absentBody);

  const unknown = await ownerRequest(`/api/me/profile?playId=${randomUUID()}`, {
    cookie: testAccount.cookie,
  });
  assert.equal(unknown.status, 404);

  const draftResponse = await ownerRequest(
    `/api/me/profile?playId=${draft.playId}`,
    { cookie: testAccount.cookie },
  );
  assert.equal(draftResponse.status, 404);

  const signedOutEvent = await ownerRequest("/api/me/profile/events", {
    method: "POST",
    ip: "198.51.100.30",
    cookie: ownerCookie(ownerA),
    body: { event: "profile_viewed", playId: ownerA.playId },
  });
  assert.equal(signedOutEvent.status, 401);
  assert.deepEqual(await signedOutEvent.json(), absentBody);
  assert.equal(
    Number(
      sql(
        "select count(*) from public.analytics_events where event_name = 'profile_viewed'",
        true,
      ),
    ),
    initialProfileViewCount,
  );

  const responseA = await ownerRequest(
    `/api/me/profile?playId=${ownerA.playId}`,
    { cookie: testAccount.cookie },
  );
  const profileA = await responseA.json();
  assert.equal(responseA.status, 200, serverLog);
  assert.equal(profileA.playId, ownerA.playId);
  assert.equal(profileA.cards.length, 10);
  assert.equal(profileA.sightCount, 0);
  assert.deepEqual(profileA.relationshipLayers, []);

  const responseB = await ownerRequest(
    `/api/me/profile?playId=${ownerB.playId}`,
    { cookie: testAccount.cookie },
  );
  assert.equal(responseB.status, 200);
  assert.equal((await responseB.json()).playId, ownerB.playId);
  assert.equal(
    Number(
      sql(
        "select count(*) from public.analytics_events where event_name = 'profile_viewed'",
        true,
      ),
    ),
    initialProfileViewCount,
  );

  const event = await ownerRequest("/api/me/profile/events", {
    method: "POST",
    cookie: testAccount.cookie,
    body: { event: "profile_viewed", playId: ownerA.playId },
  });
  assert.equal(event.status, 204, serverLog);
  assert.equal(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_viewed' and visitor_response_id is null and properties = jsonb_build_object('packVersion', 'old-friend-v2')",
      true,
    ),
    String(initialProfileViewCount + 1),
  );
});

test("submitted public sights refresh live and reveal only at three samples", async () => {
  const initialProfileViewCount = Number(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_viewed'",
      true,
    ),
  );
  const initialProfileReshareCount = Number(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_reshare_clicked'",
      true,
    ),
  );
  const owner = createOwnerCredential();
  insertOwner(owner, true);
  claimOwner(owner);
  const publicLink = insertLink(owner.playId, "public");
  const oneToOneLink = insertLink(owner.playId, "one_to_one");

  const ineligibleReshare = await ownerRequest("/api/me/profile/events", {
    method: "POST",
    ip: "198.51.100.130",
    cookie: testAccount.cookie,
    body: { event: "profile_reshare_clicked", playId: owner.playId },
  });
  assert.equal(ineligibleReshare.status, 404);
  assert.equal(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_reshare_clicked'",
      true,
    ),
    String(initialProfileReshareCount),
  );

  insertSubmittedResponse(publicLink, "a");
  insertSubmittedResponse(publicLink, "b");
  insertSubmittedResponse(oneToOneLink, "b");

  const before = await ownerRequest(`/api/me/profile?playId=${owner.playId}`, {
    ip: "198.51.100.28",
    cookie: testAccount.cookie,
  });
  const beforeProfile = await before.json();
  assert.equal(beforeProfile.sightCount, 2);
  assert.equal(beforeProfile.cards[0].sampleCount, 0);
  assert.equal(beforeProfile.cards[0].counts, null);
  assert.deepEqual(beforeProfile.relationshipLayers, [
    {
      relationshipCode: "old_friend",
      sightCount: 2,
      status: "collecting",
      cards: [],
    },
  ]);

  const eligibleReshare = await ownerRequest("/api/me/profile/events", {
    method: "POST",
    ip: "198.51.100.130",
    cookie: testAccount.cookie,
    body: { event: "profile_reshare_clicked", playId: owner.playId },
  });
  assert.equal(eligibleReshare.status, 204, serverLog);
  assert.equal(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_reshare_clicked' and visitor_response_id is null and properties = jsonb_build_object('packVersion', 'old-friend-v2', 'entrySource', 'profile_reshare')",
      true,
    ),
    String(initialProfileReshareCount + 1),
  );
  assert.equal(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_viewed'",
      true,
    ),
    String(initialProfileViewCount + 1),
  );
  assert.equal(
    sql(
      `select min(viewed.occurred_at) <= min(clicked.occurred_at)
       from public.analytics_events viewed
       cross join public.analytics_events clicked
       where viewed.event_name = 'profile_viewed'
         and viewed.owner_play_id = '${owner.playId}'
         and clicked.event_name = 'profile_reshare_clicked'
         and clicked.owner_play_id = '${owner.playId}'`,
      true,
    ),
    "t",
  );

  insertSubmittedResponse(publicLink, "a");
  const after = await ownerRequest(`/api/me/profile?playId=${owner.playId}`, {
    ip: "198.51.100.28",
    cookie: testAccount.cookie,
  });
  const afterProfile = await after.json();
  assert.equal(afterProfile.sightCount, 3);
  assert.equal(afterProfile.sightStatus, "has_sight");
  assert.equal(afterProfile.cards[0].sampleCount, 3);
  assert.deepEqual(afterProfile.cards[0].counts, { a: 2, b: 1 });
  assert.equal(afterProfile.relationshipLayers.length, 1);
  assert.equal(
    afterProfile.relationshipLayers[0].relationshipCode,
    "old_friend",
  );
  assert.equal(afterProfile.relationshipLayers[0].status, "available");
  assert.equal(afterProfile.relationshipLayers[0].cards.length, 10);
  assert.deepEqual(afterProfile.relationshipLayers[0].cards[0], {
    cardId: "conflict",
    sampleCount: 3,
    status: "available",
    counts: { a: 2, b: 1 },
  });
  assert.equal("relationshipCode" in afterProfile, false);
  assert.equal("responseId" in afterProfile.cards[0], false);
});

test("owner profile access limit blocks the 121st request before the domain", async () => {
  const owner = createOwnerCredential();
  insertOwner(owner, true);
  claimOwner(owner);
  const initialProfileViewCount = Number(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_viewed'",
      true,
    ),
  );
  const ip = "198.51.100.129";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await ownerRequest(
      `/api/me/profile?playId=${owner.playId}`,
      {
        ip,
        cookie: testAccount.cookie,
      },
    );
    assert.equal(response.status, 200, `attempt ${attempt + 1}: ${serverLog}`);
  }
  const blocked = await ownerRequest(`/api/me/profile?playId=${owner.playId}`, {
    ip,
    cookie: testAccount.cookie,
  });
  assert.equal(blocked.status, 429);
  assert.match(blocked.headers.get("retry-after") ?? "", /^[1-9][0-9]*$/);
  assert.equal(
    Number(
      sql(
        "select count(*) from public.analytics_events where event_name = 'profile_viewed'",
        true,
      ),
    ),
    initialProfileViewCount,
    "GET profile access never writes render events",
  );
});
