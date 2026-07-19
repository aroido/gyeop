import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import test from "node:test";

const databaseContainer = "supabase_db_gyeop";
const versionId = "15151515-1515-4515-8515-151515151515";

function psqlArgs(query) {
  return [
    "exec",
    databaseContainer,
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
  throw new Error("Timed out waiting for withdrawal collision barrier");
}

test("one management capability withdraws exactly once under concurrency", async () => {
  const playId = randomUUID();
  const linkId = randomUUID();
  const responseId = randomUUID();
  const publicId = randomBytes(16).toString("base64url");
  const ownerHash = randomBytes(32).toString("hex");
  const shareHash = randomBytes(32).toString("hex");
  const sessionHash = randomBytes(32).toString("hex");
  const managementHash = randomBytes(32).toString("hex");
  const barrierKey = randomInt(6_000_000, 7_000_000);

  sql(`
    with fixed_time as (select clock_timestamp() as value)
    insert into public.pack_plays (
      id, pack_version_id, management_secret_hash, management_expires_at,
      last_active_at, status, current_position, completed_at
    ) select '${playId}', '${versionId}', decode('${ownerHash}', 'hex'),
      value + interval '7 days', value, 'completed', 10, value
    from fixed_time;
    insert into public.share_links (
      id, public_id, pack_play_id, kind, secret_hash
    ) values (
      '${linkId}', '${publicId}', '${playId}', 'public',
      decode('${shareHash}', 'hex')
    );
    with fixed_time as (select clock_timestamp() as value)
    insert into public.visitor_responses (
      id, share_link_id, pack_version_id, relationship_code,
      known_since_code, status, session_token_hash, session_expires_at,
      management_token_hash, created_at, submitted_at
    ) select '${responseId}', '${linkId}', '${versionId}', 'old_friend',
      'ten_years_or_more', 'submitted', decode('${sessionHash}', 'hex'),
      value + interval '24 hours', decode('${managementHash}', 'hex'),
      value, value
    from fixed_time;
  `);

  const withdrawal = `select public.withdraw_response(
    decode('${managementHash}', 'hex')
  )->>'outcome'`;
  const first = sqlProcess(`
    begin;
    ${withdrawal};
    select pg_advisory_lock(${barrierKey});
    select pg_sleep(1.2);
    commit;
  `);
  await waitForAdvisoryHeld(barrierKey);
  const second = sqlProcess(withdrawal);
  const early = await Promise.race([
    second.done.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 300)),
  ]);
  assert.equal(
    early,
    false,
    "the second withdrawal must wait for the row lock",
  );

  const [firstResult, secondResult] = await Promise.all([
    first.done,
    second.done,
  ]);
  assert.equal(firstResult.code, 0, firstResult.stderr);
  assert.equal(secondResult.code, 0, secondResult.stderr);
  assert.deepEqual(
    [firstResult.stdout, secondResult.stdout]
      .map((output) => output.match(/\b(?:withdrawn|unavailable)\b/)?.[0])
      .sort(),
    ["unavailable", "withdrawn"],
  );
  assert.equal(
    sql(
      `select status from public.visitor_responses where id = '${responseId}'`,
    ),
    "withdrawn",
  );
  assert.equal(
    sql(
      `select count(*) from public.analytics_events where event_name = 'response_withdrawn'`,
    ),
    "1",
  );
});
