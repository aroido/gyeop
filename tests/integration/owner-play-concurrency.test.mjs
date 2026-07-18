import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import test from "node:test";

const versionId = "15151515-1515-4515-8515-151515151515";
const cardIds = [
  "conflict",
  "reunion",
  "plans",
  "comfort",
  "gathering",
  "reconnect",
  "memory",
  "travel",
  "celebration",
  "hard-day",
];

function psqlArgs(sql) {
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
    sql,
  ];
}

function sql(sqlText) {
  return execFileSync("docker", psqlArgs(sqlText), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sqlProcess(sqlText) {
  const child = spawn("docker", psqlArgs(sqlText), {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.output = "";
  child.errors = "";
  child.stdout.on("data", (chunk) => {
    child.output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    child.errors += chunk.toString();
  });
  child.done = new Promise((resolve) =>
    child.once("exit", (code) =>
      resolve({ code, stdout: child.output, stderr: child.errors }),
    ),
  );
  return child;
}

async function waitForAdvisoryHeld(key) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (sql(`select not pg_try_advisory_lock(${key})`) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for advisory lock ${key}`);
}

function createFixture(answerCount) {
  const playId = randomUUID();
  const hash = randomBytes(32).toString("hex");
  sql(`
    with fixed_time as (select clock_timestamp() as value)
    insert into public.pack_plays (
      id, pack_version_id, management_secret_hash,
      last_active_at, management_expires_at, created_at, updated_at
    )
    select
      '${playId}', '${versionId}', decode('${hash}', 'hex'),
      value, value + interval '7 days', value, value
    from fixed_time;
    insert into public.self_answers (
      pack_play_id, pack_version_id, card_id, choice
    )
    select '${playId}', '${versionId}', card.id, 'a'
    from public.pack_cards as card
    where card.pack_version_id = '${versionId}'
      and card.position <= ${answerCount};
  `);
  return {
    playId,
    hash,
    barrierKey: randomInt(2_000_000, 3_000_000),
  };
}

function saveSql({ playId, hash, cardId, choice = "b", position = 10 }) {
  return `select public.save_owner_answer(
    '${playId}', decode('${hash}', 'hex'), '${cardId}', '${choice}', ${position}::smallint
  )->>'outcome'`;
}

function completeSql({ playId, hash }) {
  return `select public.complete_owner_play(
    '${playId}', decode('${hash}', 'hex')
  )->>'outcome'`;
}

async function assertBlocks(child, message) {
  const early = await Promise.race([
    child.done.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 300)),
  ]);
  assert.equal(early, false, message);
}

test("ten-card save-first includes the edit before completion", async () => {
  const fixture = createFixture(10);
  const save = sqlProcess(`
    begin;
    ${saveSql({ ...fixture, cardId: cardIds[0] })};
    select pg_advisory_lock(${fixture.barrierKey});
    select pg_sleep(1.2);
    commit;
  `);
  await waitForAdvisoryHeld(fixture.barrierKey);
  const complete = sqlProcess(completeSql(fixture));
  await assertBlocks(
    complete,
    "complete must wait for the save-held play lock",
  );
  assert.equal((await save.done).code, 0);
  const completed = await complete.done;
  assert.equal(completed.code, 0, completed.stderr);
  assert.match(completed.stdout, /completed/);
  assert.equal(
    sql(`
      select play.status || ':' || answer.choice
      from public.pack_plays play
      join public.self_answers answer on answer.pack_play_id = play.id
      where play.id = '${fixture.playId}' and answer.card_id = '${cardIds[0]}'
    `),
    "completed:b",
  );
});

test("ten-card complete-first rejects the late edit", async () => {
  const fixture = createFixture(10);
  const complete = sqlProcess(`
    begin;
    ${completeSql(fixture)};
    select pg_advisory_lock(${fixture.barrierKey});
    select pg_sleep(1.2);
    commit;
  `);
  await waitForAdvisoryHeld(fixture.barrierKey);
  const save = sqlProcess(saveSql({ ...fixture, cardId: cardIds[0] }));
  await assertBlocks(save, "save must wait for the completion-held play lock");
  assert.equal((await complete.done).code, 0);
  const rejected = await save.done;
  assert.equal(rejected.code, 0, rejected.stderr);
  assert.match(rejected.stdout, /completed/);
  assert.equal(
    sql(`
      select play.status || ':' || answer.choice
      from public.pack_plays play
      join public.self_answers answer on answer.pack_play_id = play.id
      where play.id = '${fixture.playId}' and answer.card_id = '${cardIds[0]}'
    `),
    "completed:a",
  );
});

test("nine-card final-save-first lets completion observe all ten", async () => {
  const fixture = createFixture(9);
  const save = sqlProcess(`
    begin;
    ${saveSql({ ...fixture, cardId: cardIds[9] })};
    select pg_advisory_lock(${fixture.barrierKey});
    select pg_sleep(1.2);
    commit;
  `);
  await waitForAdvisoryHeld(fixture.barrierKey);
  const complete = sqlProcess(completeSql(fixture));
  await assertBlocks(complete, "complete must wait for the final save");
  assert.equal((await save.done).code, 0);
  const completed = await complete.done;
  assert.equal(completed.code, 0, completed.stderr);
  assert.match(completed.stdout, /completed/);
  assert.equal(
    sql(
      `select status || ':' || (select count(*) from public.self_answers where pack_play_id = '${fixture.playId}') from public.pack_plays where id = '${fixture.playId}'`,
    ),
    "completed:10",
  );
});

test("nine-card complete-first returns incomplete then allows the final save", async () => {
  const fixture = createFixture(9);
  const complete = sqlProcess(`
    begin;
    ${completeSql(fixture)};
    select pg_advisory_lock(${fixture.barrierKey});
    select pg_sleep(1.2);
    commit;
  `);
  await waitForAdvisoryHeld(fixture.barrierKey);
  const save = sqlProcess(saveSql({ ...fixture, cardId: cardIds[9] }));
  await assertBlocks(
    save,
    "final save must wait for the incomplete transaction",
  );
  const incomplete = await complete.done;
  assert.equal(incomplete.code, 0, incomplete.stderr);
  assert.match(incomplete.stdout, /incomplete/);
  const saved = await save.done;
  assert.equal(saved.code, 0, saved.stderr);
  assert.match(saved.stdout, /saved/);
  assert.equal(
    sql(
      `select status || ':' || (select count(*) from public.self_answers where pack_play_id = '${fixture.playId}') from public.pack_plays where id = '${fixture.playId}'`,
    ),
    "draft:10",
  );
});
