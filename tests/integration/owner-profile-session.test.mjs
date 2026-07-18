import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { randomBytes, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import {
  OWNER_COOKIE_NAME,
  createOwnerCredential,
} from "../../lib/owner-play/owner-play-session-core.mjs";

const root = new URL("../../", import.meta.url).pathname;
const versionId = "15151515-1515-4515-8515-151515151515";
const proxySecret = Buffer.alloc(32, 27).toString("base64url");
const rateSecret = randomBytes(32).toString("base64url");
const appUrl = "http://127.0.0.1:3107";
let server;
let serverLog = "";

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
const serverEnv = {
  ...process.env,
  APP_URL: appUrl,
  ORIGIN_PROXY_SECRET: proxySecret,
  RATE_LIMIT_SECRET: rateSecret,
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
      ('${responseId}', '${versionId}', 'conflict', 'required', 1),
      ('${responseId}', '${versionId}', 'reunion', 'required', 2),
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
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
});

test("current-cookie-only profile auth is private and generic", async () => {
  const initialProfileViewCount = Number(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_viewed'",
      true,
    ),
  );
  const ownerA = createOwnerCredential();
  const ownerB = createOwnerCredential();
  const draft = createOwnerCredential();
  const expired = createOwnerCredential();
  insertOwner(ownerA, true);
  insertOwner(ownerB, true);
  insertOwner(draft, false);
  insertOwner(expired, true);
  sql(`with expired_time as (
      select clock_timestamp() - interval '1 second' as value
    )
    update public.pack_plays
    set management_expires_at = expired_time.value,
        last_active_at = expired_time.value - interval '7 days'
    from expired_time
    where id = '${expired.playId}'`);

  const absent = await ownerRequest("/api/me/profile");
  const absentBody = await absent.text();
  assert.equal(absent.status, 404);

  const malformed = await ownerRequest("/api/me/profile", {
    cookie: `${OWNER_COOKIE_NAME}=bad`,
  });
  assert.equal(malformed.status, 404);
  assert.equal(await malformed.text(), absentBody);
  assert.match(malformed.headers.get("set-cookie") ?? "", /Max-Age=0/);

  const tamperedSecret = randomBytes(32).toString("base64url");
  const tampered = await ownerRequest("/api/me/profile", {
    cookie: `${OWNER_COOKIE_NAME}=v1.${ownerA.playId}.${tamperedSecret}`,
  });
  assert.equal(tampered.status, 404);
  assert.equal(await tampered.text(), absentBody);
  assert.match(tampered.headers.get("set-cookie") ?? "", /Max-Age=0/);

  const ownerBSecret = ownerB.value.split(".")[2];
  const composed = await ownerRequest("/api/me/profile", {
    cookie: `${OWNER_COOKIE_NAME}=v1.${ownerA.playId}.${ownerBSecret}`,
  });
  assert.equal(composed.status, 404);
  assert.equal(await composed.text(), absentBody);

  const draftResponse = await ownerRequest("/api/me/profile", {
    cookie: ownerCookie(draft),
  });
  assert.equal(draftResponse.status, 404);
  assert.equal(await draftResponse.text(), absentBody);
  assert.match(draftResponse.headers.get("set-cookie") ?? "", /Max-Age=604800/);

  const expiredResponse = await ownerRequest("/api/me/profile", {
    cookie: ownerCookie(expired),
  });
  assert.equal(expiredResponse.status, 404);
  assert.equal(await expiredResponse.text(), absentBody);
  assert.match(expiredResponse.headers.get("set-cookie") ?? "", /Max-Age=0/);

  const expiredEvent = await ownerRequest("/api/me/profile/events", {
    method: "POST",
    ip: "198.51.100.30",
    cookie: ownerCookie(expired),
    body: { event: "profile_viewed" },
  });
  assert.equal(expiredEvent.status, 404);
  assert.equal(await expiredEvent.text(), absentBody);
  assert.match(expiredEvent.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(
    Number(
      sql(
        "select count(*) from public.analytics_events where event_name = 'profile_viewed'",
        true,
      ),
    ),
    initialProfileViewCount,
  );

  const responseA = await ownerRequest("/api/me/profile", {
    cookie: ownerCookie(ownerA),
  });
  const profileA = await responseA.json();
  assert.equal(responseA.status, 200, serverLog);
  assert.equal(profileA.playId, ownerA.playId);
  assert.equal(profileA.cards.length, 10);
  assert.equal(profileA.sightCount, 0);
  assert.match(responseA.headers.get("set-cookie") ?? "", /Max-Age=604800/);

  const responseB = await ownerRequest("/api/me/profile", {
    cookie: ownerCookie(ownerB),
  });
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
    cookie: ownerCookie(ownerA),
    body: { event: "profile_viewed" },
  });
  assert.equal(event.status, 204, serverLog);
  assert.equal(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_viewed' and visitor_response_id is null and properties = jsonb_build_object('packVersion', 'old-friend-v1')",
      true,
    ),
    String(initialProfileViewCount + 1),
  );
});

test("submitted public sights refresh live and reveal only at three samples", async () => {
  const owner = createOwnerCredential();
  insertOwner(owner, true);
  const publicLink = insertLink(owner.playId, "public");
  const oneToOneLink = insertLink(owner.playId, "one_to_one");

  const ineligibleReshare = await ownerRequest("/api/me/profile/events", {
    method: "POST",
    ip: "198.51.100.130",
    cookie: ownerCookie(owner),
    body: { event: "profile_reshare_clicked" },
  });
  assert.equal(ineligibleReshare.status, 404);
  assert.equal(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_reshare_clicked'",
      true,
    ),
    "0",
  );

  insertSubmittedResponse(publicLink, "a");
  insertSubmittedResponse(publicLink, "b");
  insertSubmittedResponse(oneToOneLink, "b");

  const before = await ownerRequest("/api/me/profile", {
    ip: "198.51.100.28",
    cookie: ownerCookie(owner),
  });
  const beforeProfile = await before.json();
  assert.equal(beforeProfile.sightCount, 2);
  assert.equal(beforeProfile.cards[0].sampleCount, 2);
  assert.equal(beforeProfile.cards[0].counts, null);

  const eligibleReshare = await ownerRequest("/api/me/profile/events", {
    method: "POST",
    ip: "198.51.100.130",
    cookie: ownerCookie(owner),
    body: { event: "profile_reshare_clicked" },
  });
  assert.equal(eligibleReshare.status, 204, serverLog);
  assert.equal(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_reshare_clicked' and visitor_response_id is null and properties = jsonb_build_object('packVersion', 'old-friend-v1', 'entrySource', 'profile_reshare')",
      true,
    ),
    "1",
  );

  insertSubmittedResponse(publicLink, "a");
  const after = await ownerRequest("/api/me/profile", {
    ip: "198.51.100.28",
    cookie: ownerCookie(owner),
  });
  const afterProfile = await after.json();
  assert.equal(afterProfile.sightCount, 3);
  assert.equal(afterProfile.sightStatus, "has_sight");
  assert.equal(afterProfile.cards[0].sampleCount, 3);
  assert.deepEqual(afterProfile.cards[0].counts, { a: 2, b: 1 });
  assert.equal("relationshipCode" in afterProfile, false);
  assert.equal("responseId" in afterProfile.cards[0], false);
});

test("owner profile access limit blocks the 121st request before the domain", async () => {
  const owner = createOwnerCredential();
  insertOwner(owner, true);
  const initialProfileViewCount = Number(
    sql(
      "select count(*) from public.analytics_events where event_name = 'profile_viewed'",
      true,
    ),
  );
  const ip = "198.51.100.129";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await ownerRequest("/api/me/profile", {
      ip,
      cookie: ownerCookie(owner),
    });
    assert.equal(response.status, 200, `attempt ${attempt + 1}: ${serverLog}`);
  }
  const blocked = await ownerRequest("/api/me/profile", {
    ip,
    cookie: ownerCookie(owner),
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
