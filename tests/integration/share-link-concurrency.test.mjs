import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import test from "node:test";

const versionId = "15151515-1515-4515-8515-151515151515";

function psqlArgs(query) {
  return [
    "exec",
    "supabase_db_gyeop",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    query,
  ];
}

function sql(query) {
  return execFileSync("docker", psqlArgs(query), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sqlProcess(query) {
  const child = spawn("docker", psqlArgs(query), {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  child.stdout.on("data", (chunk) => (output += chunk.toString()));
  child.stderr.on("data", (chunk) => (errors += chunk.toString()));
  return {
    done: new Promise((resolve) =>
      child.once("exit", (code) =>
        resolve({ code, stdout: output, stderr: errors }),
      ),
    ),
  };
}

async function waitForAdvisoryHeld(key) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (sql(`select not pg_try_advisory_lock(${key})`) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for share rotation lock");
}

function credential() {
  return {
    id: randomUUID(),
    publicId: randomBytes(16).toString("base64url"),
    hash: randomBytes(32).toString("hex"),
  };
}

function createFixture() {
  const playId = randomUUID();
  const managementHash = randomBytes(32).toString("hex");
  const link = credential();
  sql(`
    with fixed_time as (select clock_timestamp() as value)
    insert into public.pack_plays (
      id, pack_version_id, management_secret_hash, status, current_position,
      completed_at, last_active_at, management_expires_at, created_at, updated_at
    )
    select '${playId}', '${versionId}', decode('${managementHash}', 'hex'),
      'completed', 10, value, value, value + interval '7 days', value, value
    from fixed_time;
    insert into public.share_links (
      id, public_id, pack_play_id, kind, secret_hash
    ) values (
      '${link.id}', '${link.publicId}', '${playId}', 'public', decode('${link.hash}', 'hex')
    );
  `);
  return {
    playId,
    managementHash,
    link,
    barrierKey: randomInt(3_000_000, 4_000_000),
  };
}

function rotateSql(fixture, next) {
  return `select public.rotate_share_link(
    '${fixture.playId}', decode('${fixture.managementHash}', 'hex'),
    '${fixture.link.id}', '${next.id}', '${next.publicId}', decode('${next.hash}', 'hex')
  )->>'outcome'`;
}

test("concurrent rotation creates one replacement and one event", async () => {
  const eventCountBefore = Number(
    sql(
      "select count(*) from public.analytics_events where event_name = 'share_link_created'",
    ),
  );
  const fixture = createFixture();
  const firstCredential = credential();
  const secondCredential = credential();
  const first = sqlProcess(`
    begin;
    ${rotateSql(fixture, firstCredential)};
    select pg_advisory_lock(${fixture.barrierKey});
    select pg_sleep(1.2);
    commit;
  `);
  await waitForAdvisoryHeld(fixture.barrierKey);
  const second = sqlProcess(rotateSql(fixture, secondCredential));
  const early = await Promise.race([
    second.done.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 300)),
  ]);
  assert.equal(early, false, "second rotate must wait for the owner/link lock");
  const firstResult = await first.done;
  const secondResult = await second.done;
  assert.equal(firstResult.code, 0, firstResult.stderr);
  assert.match(firstResult.stdout, /rotated/);
  assert.equal(secondResult.code, 0, secondResult.stderr);
  assert.match(secondResult.stdout, /link_not_active/);
  assert.equal(
    sql(
      `select count(*) from public.share_links where pack_play_id = '${fixture.playId}'`,
    ),
    "2",
  );
  assert.equal(
    Number(
      sql(
        "select count(*) from public.analytics_events where event_name = 'share_link_created'",
      ),
    ),
    eventCountBefore + 1,
  );
});

test("credential collision leaves the old link and owner TTL unchanged", () => {
  const eventCountBefore = Number(
    sql(
      "select count(*) from public.analytics_events where event_name = 'share_link_created'",
    ),
  );
  const fixture = createFixture();
  const collision = credential();
  sql(`insert into public.share_links(id, public_id, pack_play_id, kind, secret_hash)
    values ('${collision.id}', '${collision.publicId}', '${fixture.playId}', 'public', decode('${collision.hash}', 'hex'))`);
  const before = sql(
    `select management_expires_at::text from public.pack_plays where id = '${fixture.playId}'`,
  );
  const result = credential();
  result.publicId = collision.publicId;
  assert.equal(sql(rotateSql(fixture, result)), "collision");
  assert.equal(
    sql(
      `select status from public.share_links where id = '${fixture.link.id}'`,
    ),
    "active",
  );
  assert.equal(
    sql(
      `select management_expires_at::text from public.pack_plays where id = '${fixture.playId}'`,
    ),
    before,
  );
  assert.equal(
    Number(
      sql(
        "select count(*) from public.analytics_events where event_name = 'share_link_created'",
      ),
    ),
    eventCountBefore,
  );
});
