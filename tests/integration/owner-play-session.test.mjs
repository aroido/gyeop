import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { after, before } from "node:test";

const root = path.resolve(new URL("../../", import.meta.url).pathname);
const manifestFiles = [
  "old-friend-v1.json",
  "first-impression-v1.json",
  "coworker-v1.json",
  "honest-self-v1.json",
];
const manifests = manifestFiles.map((file) =>
  JSON.parse(readFileSync(path.join(root, "content/packs", file), "utf8")),
);
const manifest = manifests[0];

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
const proxySecret = Buffer.alloc(32, 28).toString("base64url");
const rateSecret = randomBytes(32).toString("base64url");
const appUrl = "http://127.0.0.1:3106";
const serverEnv = {
  ...process.env,
  APP_URL: appUrl,
  ORIGIN_PROXY_SECRET: proxySecret,
  RATE_LIMIT_SECRET: rateSecret,
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  SUPABASE_SECRET_KEY: local.SECRET_KEY,
};
let server;
let serverLog = "";

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

before(async () => {
  sql(
    "update public.pack_templates set is_active = false where slug = 'old-friend'; delete from public.rate_limit_buckets where action = 'owner_draft_create'",
  );
  server = spawn(
    "pnpm",
    ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", "3106"],
    { cwd: root, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => {
      serverLog = (serverLog + chunk.toString()).slice(-12000);
    });
  }
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(appUrl);
      if (response.ok) return;
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Owner play server did not start:\n${serverLog}`);
});

after(async () => {
  sql(
    "update public.pack_templates set is_active = true where slug = 'old-friend'",
  );
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
});

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
  { method = "GET", ip, cookie, body, headerOverrides = {} } = {},
) {
  const headers = proxyHeaders(ip ?? "198.51.100.1", headerOverrides);
  if (cookie) headers.cookie = cookie;
  const options = { method, headers };
  if (body !== undefined) {
    if (!("origin" in headers)) headers.origin = appUrl;
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${appUrl}${pathname}`, options);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response;
}

function cookieFrom(response) {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "response must set the owner cookie");
  const value = header.match(/__Host-gyeop-owner=([^;]*)/)?.[1];
  assert.ok(value, "response must contain a non-empty owner cookie");
  return `__Host-gyeop-owner=${value}`;
}

function visitorCookieFrom(response) {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "response must set the visitor cookie");
  const value = header.match(/__Host-gyeop-response=([^;]*)/)?.[1];
  assert.ok(value, "response must contain a non-empty visitor cookie");
  return `__Host-gyeop-response=${value}`;
}

test("owner boundary failures are always private no-store", async () => {
  const invalidOrigin = await ownerRequest("/api/plays", {
    method: "POST",
    body: {
      packSlug: "old-friend",
      entrySource: "home",
    },
    headerOverrides: { origin: "https://evil.example" },
  });
  assert.equal(invalidOrigin.status, 403);

  const invalidInput = await ownerRequest("/api/plays", {
    method: "POST",
    body: {
      packSlug: "old-friend",
      entrySource: "home",
      extra: true,
    },
  });
  assert.equal(invalidInput.status, 400);

  const invalidProxy = await ownerRequest("/api/plays", {
    method: "POST",
    body: {
      packSlug: "old-friend",
      entrySource: "home",
    },
    headerOverrides: {
      "x-forwarded-for": "198.51.100.1, 203.0.113.1",
    },
  });
  assert.equal(invalidProxy.status, 400);
});

test("new owner rejects unexpected input without side effects", async () => {
  const before = sql(
    "select json_build_array((select count(*) from public.pack_plays), (select count(*) from public.analytics_events), (select count(*) from public.rate_limit_buckets))",
    true,
  );
  const bodies = [
    {
      packSlug: "first-impression",
      entrySource: "home",
      eligibilityConfirmed: false,
    },
    {
      packSlug: "first-impression",
      entrySource: "home",
      eligibilityConfirmed: "true",
    },
    {
      packSlug: "first-impression",
      entrySource: "home",
      eligibilityConfirmed: 1,
    },
    {
      packSlug: "first-impression",
      entrySource: "home",
      eligibilityConfirmed: true,
      extra: true,
    },
  ];
  for (const [index, body] of bodies.entries()) {
    const response = await ownerRequest("/api/plays", {
      method: "POST",
      ip: `198.51.100.${120 + index}`,
      body,
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal(
    sql(
      "select json_build_array((select count(*) from public.pack_plays), (select count(*) from public.analytics_events), (select count(*) from public.rate_limit_buckets))",
      true,
    ),
    before,
  );
});

test("inactive create returns PACK_NOT_FOUND without a cookie or quota row", async () => {
  const response = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.20",
    body: {
      packSlug: "old-friend",
      entrySource: "home",
    },
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    code: "PACK_NOT_FOUND",
    message: "팩을 찾을 수 없습니다.",
  });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(
    sql(
      "select count(*) from public.rate_limit_buckets where action = 'owner_draft_create'",
      true,
    ),
    "0",
  );
});

test("each additional pack completes the real owner, share, visitor, and profile path", async () => {
  for (const [index, pack] of manifests.slice(1).entries()) {
    const ip = `198.51.100.${41 + index}`;
    const catalog = await fetch(`${appUrl}/api/packs/${pack.slug}`, {
      headers: proxyHeaders(ip),
    });
    assert.equal(catalog.status, 200, `${pack.slug}: ${serverLog}`);
    const catalogBody = await catalog.json();
    assert.equal(catalogBody.title, pack.title);
    assert.equal(catalogBody.cards.length, 10);

    const created = await ownerRequest("/api/plays", {
      method: "POST",
      ip,
      body: {
        packSlug: pack.slug,
        entrySource: "home",
      },
    });
    assert.equal(created.status, 201, `${pack.slug}: ${serverLog}`);
    const play = await created.json();
    assert.equal(play.packSlug, pack.slug);
    assert.equal(play.packVersion, pack.version);
    const cookie = cookieFrom(created);

    for (const card of pack.cards) {
      const saved = await ownerRequest(
        `/api/plays/${play.id}/answers/${card.id}`,
        {
          method: "PUT",
          ip,
          cookie,
          body: { choice: "a", currentPosition: card.position },
        },
      );
      assert.equal(saved.status, 200, `${pack.slug}/${card.id}: ${serverLog}`);
    }

    const completed = await ownerRequest(`/api/plays/${play.id}/complete`, {
      method: "POST",
      ip,
      cookie,
      body: {},
    });
    assert.equal(completed.status, 200, `${pack.slug}: ${serverLog}`);
    assert.equal((await completed.json()).status, "completed");

    const profile = await ownerRequest("/api/me/profile", {
      ip,
      cookie,
    });
    assert.equal(profile.status, 200, `${pack.slug}: ${serverLog}`);
    const profileBody = await profile.json();
    assert.equal(profileBody.packSlug, pack.slug);
    assert.equal(profileBody.packTitle, pack.title);
    assert.equal(profileBody.cards.length, 10);

    const kind = pack.presentation.defaultShareKind;
    const shared = await ownerRequest(`/api/plays/${play.id}/links`, {
      method: "POST",
      ip,
      cookie,
      body: { kind },
    });
    assert.equal(shared.status, 201, `${pack.slug}: ${serverLog}`);
    const shareBody = await shared.json();
    assert.equal(shareBody.link.kind, kind);
    const inviteUrl = new URL(shareBody.inviteUrl);
    const publicId = inviteUrl.pathname.split("/").at(-1);
    const secret = inviteUrl.hash.slice("#k=".length);
    assert.ok(publicId && secret);

    const beforeMetadata =
      index === 0
        ? sql(
            "select json_build_array((select count(*) from public.visitor_responses), (select count(*) from public.analytics_events), (select count(*) from public.rate_limit_buckets))",
            true,
          )
        : null;
    const metadata = await ownerRequest(`/api/invites/${publicId}/metadata`, {
      method: "POST",
      ip: `203.0.113.${41 + index}`,
      body: { secret },
    });
    assert.equal(metadata.status, 200, `${pack.slug}: ${serverLog}`);
    assert.deepEqual(await metadata.json(), {
      packSlug: pack.slug,
      packVersion: pack.version,
      packTitle: pack.title,
      kind,
    });
    if (beforeMetadata !== null) {
      assert.equal(
        sql(
          "select json_build_array((select count(*) from public.visitor_responses), (select count(*) from public.analytics_events), (select count(*) from public.rate_limit_buckets))",
          true,
        ),
        beforeMetadata,
      );
    }

    if (index === 0) {
      const before = sql(
        "select json_build_array((select count(*) from public.visitor_responses), (select count(*) from public.analytics_events), (select count(*) from public.rate_limit_buckets))",
        true,
      );
      const bodies = [
        {
          intent: "start",
          secret,
          eligibilityConfirmed: false,
          relationshipCode: "old_friend",
          knownSinceCode: "ten_years_or_more",
        },
        {
          intent: "start",
          secret,
          eligibilityConfirmed: "true",
          relationshipCode: "old_friend",
          knownSinceCode: "ten_years_or_more",
        },
        {
          intent: "start",
          secret,
          eligibilityConfirmed: 1,
          relationshipCode: "old_friend",
          knownSinceCode: "ten_years_or_more",
        },
        {
          intent: "start",
          secret,
          eligibilityConfirmed: true,
          relationshipCode: "old_friend",
          knownSinceCode: "ten_years_or_more",
          extra: true,
        },
      ];
      for (const body of bodies) {
        const rejected = await ownerRequest(
          `/api/invites/${publicId}/responses`,
          {
            method: "POST",
            ip: "203.0.113.220",
            body,
          },
        );
        assert.equal(rejected.status, 400);
        assert.equal(rejected.headers.get("set-cookie"), null);
      }
      assert.equal(
        sql(
          "select json_build_array((select count(*) from public.visitor_responses), (select count(*) from public.analytics_events), (select count(*) from public.rate_limit_buckets))",
          true,
        ),
        before,
      );
    }

    const response = await ownerRequest(`/api/invites/${publicId}/responses`, {
      method: "POST",
      ip: `203.0.113.${41 + index}`,
      body: {
        intent: "start",
        secret,
        relationshipCode: "old_friend",
        knownSinceCode: "ten_years_or_more",
      },
    });
    assert.equal(response.status, 201, `${pack.slug}: ${serverLog}`);
    const responseBody = await response.json();
    if (index === 0) {
      assert.equal(
        sql(
          "select count(*) from public.analytics_events where event_name = 'invite_opened'",
          true,
        ),
        "1",
      );
    }
    assert.equal(responseBody.packSlug, pack.slug);
    assert.equal(responseBody.packVersion, pack.version);
    assert.equal(responseBody.packTitle, pack.title);
    assert.equal(responseBody.assignments.length, 3);

    const visitorCookie = visitorCookieFrom(response);
    for (const assignment of responseBody.assignments) {
      const saved = await ownerRequest(
        `/api/responses/${responseBody.id}/answers/${assignment.cardId}`,
        {
          method: "PUT",
          ip: `203.0.113.${41 + index}`,
          cookie: visitorCookie,
          body: { choice: "b" },
        },
      );
      assert.equal(
        saved.status,
        200,
        `${pack.slug}/${assignment.cardId}: ${serverLog}`,
      );
    }

    const submitted = await ownerRequest(
      `/api/responses/${responseBody.id}/submit`,
      {
        method: "POST",
        ip: `203.0.113.${41 + index}`,
        cookie: visitorCookie,
        body: { managementSecret: `${"A".repeat(42)}${"AEI"[index]}` },
      },
    );
    assert.equal(submitted.status, 200, `${pack.slug}: ${serverLog}`);
    const submittedBody = await submitted.json();
    assert.equal(submittedBody.status, "submitted");
    assert.equal(submittedBody.packSlug, pack.slug);
    assert.equal(submittedBody.packTitle, pack.title);
    assert.equal(submittedBody.assignments.length, 3);
    assert.ok(
      submittedBody.assignments.every(
        (assignment) =>
          assignment.visitorChoice === "b" &&
          typeof assignment.matches === "boolean",
      ),
    );

    for (const event of ["comparison_viewed", "same_pack_start_clicked"]) {
      const recorded = await ownerRequest(
        `/api/responses/${responseBody.id}/events`,
        {
          method: "POST",
          ip: `203.0.113.${41 + index}`,
          cookie: visitorCookie,
          body: { event },
        },
      );
      assert.equal(recorded.status, 204, `${pack.slug}/${event}: ${serverLog}`);
    }

    const converted = await ownerRequest("/api/plays", {
      method: "POST",
      ip: `203.0.113.${41 + index}`,
      cookie: visitorCookie,
      body: {
        packSlug: pack.slug,
        entrySource: "same_pack_cta",
      },
    });
    assert.equal(converted.status, 201, `${pack.slug}: ${serverLog}`);
    const convertedBody = await converted.json();
    assert.equal(convertedBody.packSlug, pack.slug);
    assert.equal(convertedBody.packVersion, pack.version);
    assert.equal(
      sql(
        `select count(*) from public.analytics_events
         where event_name = 'pack_opened'
           and visitor_response_id = '${responseBody.id}'
           and owner_play_id = '${convertedBody.id}'
           and properties->>'entrySource' = 'same_pack_cta'
           and properties->>'packVersion' = '${pack.version}'`,
        true,
      ),
      "1",
    );
  }
});

test("owner can create, reload, save ten answers, complete, and cannot edit", async () => {
  sql(
    "update public.pack_templates set is_active = true where slug = 'old-friend'",
  );
  const created = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.21",
    body: {
      packSlug: "old-friend",
      entrySource: "home",
    },
  });
  assert.equal(created.status, 201, serverLog);
  const createdBody = await created.json();
  assert.deepEqual(Object.keys(createdBody).sort(), [
    "answers",
    "currentPosition",
    "id",
    "managementExpiresAt",
    "managementTtlSeconds",
    "packSlug",
    "packVersion",
    "status",
  ]);
  assert.equal(createdBody.answers.length, 0);
  assert.equal(createdBody.managementTtlSeconds, 604800);
  const cookie = cookieFrom(created);
  const setCookie = created.headers.get("set-cookie");
  for (const attribute of [
    "Path=/",
    "Max-Age=604800",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ]) {
    assert.ok(setCookie.includes(attribute));
  }
  assert.equal(setCookie.includes("Domain="), false);

  const resumed = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.21",
    cookie,
    body: { packSlug: "old-friend", entrySource: "home" },
  });
  assert.equal(resumed.status, 200);
  assert.equal((await resumed.json()).id, createdBody.id);

  for (const card of manifest.cards) {
    const saved = await ownerRequest(
      `/api/plays/${createdBody.id}/answers/${card.id}`,
      {
        method: "PUT",
        ip: "198.51.100.21",
        cookie,
        body: {
          choice: card.position % 2 === 0 ? "b" : "a",
          currentPosition: card.position,
        },
      },
    );
    assert.equal(saved.status, 200, `${card.id}: ${serverLog}`);
  }

  const restored = await ownerRequest(`/api/plays/${createdBody.id}`, {
    ip: "198.51.100.21",
    cookie,
  });
  assert.equal(restored.status, 200);
  const restoredBody = await restored.json();
  assert.equal(restoredBody.answers.length, 10);
  assert.deepEqual(
    restoredBody.answers.map((answer) => answer.cardId),
    manifest.cards.map((card) => card.id),
  );

  const completed = await ownerRequest(
    `/api/plays/${createdBody.id}/complete`,
    {
      method: "POST",
      ip: "198.51.100.21",
      cookie,
      body: {},
    },
  );
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).status, "completed");

  const rejectedEdit = await ownerRequest(
    `/api/plays/${createdBody.id}/answers/${manifest.cards[0].id}`,
    {
      method: "PUT",
      ip: "198.51.100.21",
      cookie,
      body: { choice: "b", currentPosition: 10 },
    },
  );
  assert.equal(rejectedEdit.status, 409);
  assert.deepEqual(await rejectedEdit.json(), {
    code: "OWNER_PLAY_COMPLETED",
    message: "완료한 답변은 변경할 수 없습니다.",
  });
  assert.ok(rejectedEdit.headers.get("set-cookie")?.includes("Max-Age=604800"));
});

test("nine saved answers remain a recoverable draft after incomplete completion", async () => {
  const created = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.22",
    body: {
      packSlug: "old-friend",
      entrySource: "home",
    },
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  const cookie = cookieFrom(created);

  for (const card of manifest.cards.slice(0, 9)) {
    const saved = await ownerRequest(
      `/api/plays/${body.id}/answers/${card.id}`,
      {
        method: "PUT",
        ip: "198.51.100.22",
        cookie,
        body: { choice: "a", currentPosition: card.position + 1 },
      },
    );
    assert.equal(saved.status, 200);
  }

  const incomplete = await ownerRequest(`/api/plays/${body.id}/complete`, {
    method: "POST",
    ip: "198.51.100.22",
    cookie,
    body: {},
  });
  assert.equal(incomplete.status, 409);
  assert.deepEqual(await incomplete.json(), {
    code: "OWNER_PLAY_INCOMPLETE",
    message: "모든 질문에 답한 뒤 완료해 주세요.",
  });

  const restored = await ownerRequest(`/api/plays/${body.id}`, {
    ip: "198.51.100.22",
    cookie,
  });
  assert.equal(restored.status, 200);
  const restoredBody = await restored.json();
  assert.equal(restoredBody.status, "draft");
  assert.equal(restoredBody.answers.length, 9);
});

test("an expired capability converges to the generic terminal response", async () => {
  const created = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.23",
    body: {
      packSlug: "old-friend",
      entrySource: "home",
    },
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  const cookie = cookieFrom(created);
  sql(`
    update public.pack_plays
    set last_active_at = expired.at,
        management_expires_at = expired.at + interval '7 days'
    from (select clock_timestamp() - interval '8 days' as at) expired
    where id = '${body.id}'
  `);

  const expired = await ownerRequest(`/api/plays/${body.id}`, {
    ip: "198.51.100.23",
    cookie,
  });
  assert.equal(expired.status, 404);
  assert.deepEqual(await expired.json(), {
    code: "OWNER_PLAY_NOT_FOUND",
    message: "진행 중인 팩을 찾을 수 없습니다.",
  });
  assert.ok(expired.headers.get("set-cookie")?.includes("Max-Age=0"));
  assert.equal(
    sql(
      `select count(*) from public.pack_plays where id = '${body.id}' and management_secret_hash is not null`,
      true,
    ),
    "0",
  );
});

test("a stale owner cookie starts the requested pack automatically", async () => {
  const created = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.24",
    body: {
      packSlug: "honest-self",
      entrySource: "home",
    },
  });
  assert.equal(created.status, 201);
  const stale = await created.json();
  const cookie = cookieFrom(created);
  sql(`
    update public.pack_plays
    set last_active_at = expired.at,
        management_expires_at = expired.at + interval '7 days'
    from (select clock_timestamp() - interval '8 days' as at) expired
    where id = '${stale.id}'
  `);

  const restarted = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.24",
    cookie,
    body: {
      packSlug: "honest-self",
      entrySource: "home",
    },
  });
  assert.equal(restarted.status, 201);
  const play = await restarted.json();
  assert.equal(play.packSlug, "honest-self");
  assert.notEqual(play.id, stale.id);
  assert.ok(restarted.headers.get("set-cookie")?.includes(play.id));
});

test("a blank current pack yields to a new pack, but an answered pack stays", async () => {
  const blank = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.25",
    body: {
      packSlug: "honest-self",
      entrySource: "home",
    },
  });
  assert.equal(blank.status, 201);
  const blankPlay = await blank.json();
  const blankCookie = cookieFrom(blank);

  const replaced = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.25",
    cookie: blankCookie,
    body: {
      packSlug: "coworker",
      entrySource: "home",
    },
  });
  assert.equal(replaced.status, 201);
  const replacement = await replaced.json();
  assert.equal(replacement.packSlug, "coworker");
  assert.notEqual(replacement.id, blankPlay.id);

  const answered = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.26",
    body: {
      packSlug: "honest-self",
      entrySource: "home",
    },
  });
  assert.equal(answered.status, 201);
  const answeredPlay = await answered.json();
  const answeredCookie = cookieFrom(answered);
  const honestSelf = manifests.find((pack) => pack.slug === "honest-self");
  assert.ok(honestSelf);
  const firstCard = honestSelf.cards[0];
  const saved = await ownerRequest(
    `/api/plays/${answeredPlay.id}/answers/${firstCard.id}`,
    {
      method: "PUT",
      ip: "198.51.100.26",
      cookie: answeredCookie,
      body: { choice: "a", currentPosition: firstCard.position },
    },
  );
  assert.equal(saved.status, 200);

  const blocked = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.26",
    cookie: answeredCookie,
    body: {
      packSlug: "coworker",
      entrySource: "home",
    },
  });
  assert.equal(blocked.status, 404);
  assert.equal(blocked.headers.get("set-cookie"), null);
});

test("cross-play preserves a valid cookie while tamper and malformed cookies are deleted", async () => {
  const first = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.31",
    body: {
      packSlug: "old-friend",
      entrySource: "home",
    },
  });
  const firstBody = await first.json();
  const firstCookie = cookieFrom(first);
  const second = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.32",
    body: {
      packSlug: "old-friend",
      entrySource: "home",
    },
  });
  const secondCookie = cookieFrom(second);

  const crossPlay = await ownerRequest(`/api/plays/${firstBody.id}`, {
    ip: "198.51.100.32",
    cookie: secondCookie,
  });
  assert.equal(crossPlay.status, 404);
  assert.deepEqual(await crossPlay.json(), {
    code: "OWNER_PLAY_NOT_FOUND",
    message: "진행 중인 팩을 찾을 수 없습니다.",
  });
  assert.equal(crossPlay.headers.get("set-cookie"), null);

  const tamperedCookie = firstCookie.replace(/.$/, (last) =>
    last === "a" ? "b" : "a",
  );
  const tampered = await ownerRequest(`/api/plays/${firstBody.id}`, {
    ip: "198.51.100.31",
    cookie: tamperedCookie,
  });
  assert.equal(tampered.status, 404);
  assert.ok(tampered.headers.get("set-cookie")?.includes("Max-Age=0"));

  const malformed = await ownerRequest(`/api/plays/${firstBody.id}`, {
    ip: "198.51.100.31",
    cookie: "__Host-gyeop-owner=malformed",
  });
  assert.equal(malformed.status, 404);
  assert.ok(malformed.headers.get("set-cookie")?.includes("Max-Age=0"));
});

test("create quota commits five orphan plays and the sixth response is 429", async () => {
  const responses = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    responses.push(
      await ownerRequest("/api/plays", {
        method: "POST",
        ip: "203.0.113.99",
        body: {
          packSlug: "old-friend",
          entrySource: "home",
        },
      }),
    );
  }
  assert.deepEqual(
    responses.map((response) => response.status),
    [201, 201, 201, 201, 201, 429],
  );
  assert.match(responses[5].headers.get("retry-after"), /^[1-9][0-9]*$/);
  assert.deepEqual(await responses[5].json(), {
    code: "RATE_LIMITED",
    message: "잠시 후 다시 시도해 주세요.",
  });
});

test("logout revokes the DB capability, clears the cookie, and is idempotent", async () => {
  const created = await ownerRequest("/api/plays", {
    method: "POST",
    ip: "198.51.100.41",
    body: {
      packSlug: "old-friend",
      entrySource: "home",
    },
  });
  const body = await created.json();
  const cookie = cookieFrom(created);
  const logout = await ownerRequest("/api/me/session", {
    method: "DELETE",
    ip: "198.51.100.41",
    cookie,
    body: {},
  });
  assert.equal(logout.status, 204);
  assert.ok(logout.headers.get("set-cookie")?.includes("Max-Age=0"));

  const revoked = await ownerRequest(`/api/plays/${body.id}`, {
    ip: "198.51.100.41",
    cookie,
  });
  assert.equal(revoked.status, 404);
  assert.ok(revoked.headers.get("set-cookie")?.includes("Max-Age=0"));

  const repeated = await ownerRequest("/api/me/session", {
    method: "DELETE",
    ip: "198.51.100.41",
    body: {},
  });
  assert.equal(repeated.status, 204);
  assert.ok(repeated.headers.get("set-cookie")?.includes("Max-Age=0"));
});
