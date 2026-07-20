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
  throw new Error("Timed out waiting for visitor response collision barrier");
}

test("same new response credential commits exactly once under concurrency", async () => {
  const playId = randomUUID();
  const linkId = randomUUID();
  const responseId = randomUUID();
  const publicId = randomBytes(16).toString("base64url");
  const managementHash = randomBytes(32).toString("hex");
  const shareHash = randomBytes(32).toString("hex");
  const sessionHash = randomBytes(32).toString("hex");
  const rateKey = randomBytes(32).toString("hex");
  const barrierKey = randomInt(4_000_000, 5_000_000);
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
      '${linkId}', '${publicId}', '${playId}', 'public', decode('${shareHash}', 'hex')
    );
  `);
  const start = `select public.start_response(
    '${publicId}', decode('${shareHash}', 'hex'), 'start', null, null,
    '${responseId}', decode('${sessionHash}', 'hex'),
    'old_friend', 'ten_years_or_more', decode('${rateKey}', 'hex')
  )->>'outcome'`;
  const first = sqlProcess(`
    begin;
    ${start};
    select pg_advisory_lock(${barrierKey});
    select pg_sleep(1.2);
    commit;
  `);
  await waitForAdvisoryHeld(barrierKey);
  const second = sqlProcess(start);
  const early = await Promise.race([
    second.done.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 300)),
  ]);
  assert.equal(early, false, "second start must wait for the public-link lock");
  const [firstResult, secondResult] = await Promise.all([
    first.done,
    second.done,
  ]);
  assert.equal(firstResult.code, 0, firstResult.stderr);
  assert.equal(secondResult.code, 0, secondResult.stderr);
  assert.deepEqual(
    [firstResult.stdout, secondResult.stdout]
      .map((output) => output.match(/\b(?:collision|created)\b/)?.[0])
      .sort(),
    ["collision", "created"],
  );
  assert.equal(
    sql(
      `select count(*) from public.visitor_responses where id = '${responseId}'`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `select count(*) from public.analytics_events where visitor_response_id = '${responseId}'`,
    ),
    "2",
  );
  assert.equal(
    sql(
      `select count(*) from public.visitor_assignments where response_id = '${responseId}'`,
    ),
    "3",
  );
  assert.equal(
    sql(`select count(*)
      from public.visitor_assignments as assignment
      join public.pack_cards as card
        on card.pack_version_id = assignment.pack_version_id
        and card.id = assignment.card_id
      where assignment.response_id = '${responseId}'
        and assignment.position = 1
        and card.is_signature`),
    "1",
  );
  assert.equal(
    sql(`select count from public.rate_limit_buckets
      where key_hash = decode('${rateKey}', 'hex') and action = 'response_start'`),
    "1",
  );

  const resumedResponseId = randomUUID();
  const resumedSessionHash = randomBytes(32).toString("hex");
  const resumedRateKey = randomBytes(32).toString("hex");
  const resume = `select public.start_response(
    '${publicId}', decode('${shareHash}', 'hex'), 'start',
    '${responseId}', decode('${sessionHash}', 'hex'),
    '${resumedResponseId}', decode('${resumedSessionHash}', 'hex'),
    'family', 'under_one_year', decode('${resumedRateKey}', 'hex')
  )->'response'->'assignments'`;
  const resumeBarrierKey = randomInt(5_000_000, 6_000_000);
  const firstResume = sqlProcess(`
    begin;
    ${resume};
    select pg_advisory_lock(${resumeBarrierKey});
    select pg_sleep(1.2);
    commit;
  `);
  await waitForAdvisoryHeld(resumeBarrierKey);
  const secondResume = sqlProcess(resume);
  const resumeEarly = await Promise.race([
    secondResume.done.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 300)),
  ]);
  assert.equal(
    resumeEarly,
    false,
    "second same-session retry must wait for the public-link lock",
  );
  const [firstResumeResult, secondResumeResult] = await Promise.all([
    firstResume.done,
    secondResume.done,
  ]);
  assert.equal(firstResumeResult.code, 0, firstResumeResult.stderr);
  assert.equal(secondResumeResult.code, 0, secondResumeResult.stderr);
  const assignmentPayload = (output) =>
    output.split("\n").find((line) => line.startsWith("["));
  const firstAssignmentPayload = assignmentPayload(firstResumeResult.stdout);
  assert.ok(firstAssignmentPayload, "first retry must return assignments");
  assert.equal(
    firstAssignmentPayload,
    assignmentPayload(secondResumeResult.stdout),
  );
  assert.equal(
    sql(
      `select count(*) from public.visitor_responses where id in ('${responseId}', '${resumedResponseId}')`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `select count(*) from public.visitor_assignments where response_id = '${responseId}'`,
    ),
    "3",
  );
  assert.equal(
    sql(
      `select count(*) from public.analytics_events where visitor_response_id = '${responseId}'`,
    ),
    "2",
  );
  assert.equal(
    sql(`select count(*) from public.rate_limit_buckets
      where key_hash = decode('${resumedRateKey}', 'hex') and action = 'response_start'`),
    "0",
  );
});

test("one-to-one submit and terminal events stay exactly-once under concurrency", async () => {
  const playId = randomUUID();
  const linkId = randomUUID();
  const responseId = randomUUID();
  const publicId = randomBytes(16).toString("base64url");
  const ownerHash = randomBytes(32).toString("hex");
  const shareHash = randomBytes(32).toString("hex");
  const sessionHash = randomBytes(32).toString("hex");
  const rateKey = randomBytes(32).toString("hex");
  const firstManagementHash = randomBytes(32).toString("hex");
  const secondManagementHash = randomBytes(32).toString("hex");

  sql(`
    with fixed_time as (select clock_timestamp() as value)
    insert into public.pack_plays (
      id, pack_version_id, management_secret_hash, status, current_position,
      last_active_at, management_expires_at, created_at, updated_at
    )
    select '${playId}', '${versionId}', decode('${ownerHash}', 'hex'),
      'draft', 10, value, value + interval '7 days', value, value
    from fixed_time;
    insert into public.self_answers (
      pack_play_id, pack_version_id, card_id, choice
    )
    select '${playId}', '${versionId}', card.id, 'a'
    from public.pack_cards as card
    where card.pack_version_id = '${versionId}';
    update public.pack_plays
    set status = 'completed', completed_at = clock_timestamp()
    where id = '${playId}';
    insert into public.share_links (
      id, public_id, pack_play_id, kind, secret_hash
    ) values (
      '${linkId}', '${publicId}', '${playId}', 'one_to_one',
      decode('${shareHash}', 'hex')
    );
    select public.start_required_response(
      '${publicId}', decode('${shareHash}', 'hex'), 'start', null, null,
      '${responseId}', decode('${sessionHash}', 'hex'),
      'old_friend', 'ten_years_or_more', decode('${rateKey}', 'hex')
    );
    select public.save_response_answer(
      '${responseId}', decode('${sessionHash}', 'hex'), assignment.card_id, 'a'
    )
    from public.visitor_assignments as assignment
    where assignment.response_id = '${responseId}';
  `);

  const firstSubmit = sqlProcess(`select public.submit_response(
    '${responseId}', decode('${sessionHash}', 'hex'),
    decode('${firstManagementHash}', 'hex')
  )->>'outcome'`);
  const secondSubmit = sqlProcess(`select public.submit_response(
    '${responseId}', decode('${sessionHash}', 'hex'),
    decode('${secondManagementHash}', 'hex')
  )->>'outcome'`);
  const submitResults = await Promise.all([
    firstSubmit.done,
    secondSubmit.done,
  ]);
  for (const result of submitResults)
    assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(submitResults.map(({ stdout }) => stdout.trim()).sort(), [
    "conflict",
    "submitted",
  ]);
  assert.equal(
    sql(`select status || ':' || (consumed_response_id = '${responseId}')::text
      from public.share_links where id = '${linkId}'`),
    "disabled:true",
  );
  assert.equal(
    sql(`select count(*) from public.analytics_events
      where visitor_response_id = '${responseId}'
        and event_name = 'visitor_required_submitted'`),
    "1",
  );

  for (const eventName of ["comparison_viewed", "same_pack_start_clicked"]) {
    const eventSql = `select public.record_visitor_response_event(
      '${responseId}', decode('${sessionHash}', 'hex'), '${eventName}'
    )->>'outcome'`;
    const eventResults = await Promise.all([
      sqlProcess(eventSql).done,
      sqlProcess(eventSql).done,
    ]);
    for (const result of eventResults) {
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stdout.trim(), "recorded");
    }
    assert.equal(
      sql(`select count(*) from public.analytics_events
        where visitor_response_id = '${responseId}'
          and event_name = '${eventName}'`),
      "1",
    );
  }
});
