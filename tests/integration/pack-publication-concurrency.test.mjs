import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";

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
    child.once("exit", (code) => resolve({ code, stderr: child.errors })),
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

function waitForExit(child) {
  return child.done;
}

function createFixture() {
  const templateId = randomUUID();
  const versionId = randomUUID();
  const suffix = randomUUID().slice(0, 12);
  const barrierKey = randomInt(1_000_000, 2_000_000);
  sql(`
    insert into public.pack_templates (id, slug, title, target_relationship, sensitivity)
    values ('${templateId}', 'concurrency-${suffix}', 'Concurrency ${suffix}', 'old_friend', 'low');
    insert into public.pack_versions (id, template_id, version)
    values ('${versionId}', '${templateId}', 'concurrency-${suffix}-v1');
    insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b, is_signature)
    select '${versionId}', 'card-' || value, value, 'Owner ' || value, 'Visitor ' || value, 'A ' || value, 'B ' || value, value = 1
    from generate_series(1, 10) value;
  `);
  return { templateId, versionId, barrierKey };
}

test("mutate-first publication waits and freezes the committed card", async () => {
  const { versionId, barrierKey } = createFixture();
  const mutation = sqlProcess(`
    begin;
    update public.pack_cards set owner_prompt = 'Committed before publish'
    where pack_version_id = '${versionId}' and id = 'card-1';
    select pg_advisory_lock(${barrierKey});
    select pg_sleep(1.5);
    commit;
  `);
  await waitForAdvisoryHeld(barrierKey);

  const publication = sqlProcess(
    `select public.publish_pack_version('${versionId}')`,
  );
  const early = await Promise.race([
    waitForExit(publication).then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 300)),
  ]);
  assert.equal(early, false, "publish must wait for the card parent lock");

  assert.equal((await waitForExit(mutation)).code, 0);
  assert.equal((await waitForExit(publication)).code, 0);
  assert.equal(
    sql(
      `select owner_prompt from public.pack_cards where pack_version_id = '${versionId}' and id = 'card-1'`,
    ),
    "Committed before publish",
  );
  assert.match(
    sql(
      `select published_at::text from public.pack_versions where id = '${versionId}'`,
    ),
    /^20/,
  );
});

test("publish-first card mutation waits then rejects the published version", async () => {
  const { versionId, barrierKey } = createFixture();
  const publication = sqlProcess(`
    begin;
    select id from public.pack_versions where id = '${versionId}' for update;
    select pg_advisory_lock(${barrierKey});
    select pg_sleep(1.5);
    select public.publish_pack_version('${versionId}');
    commit;
  `);
  await waitForAdvisoryHeld(barrierKey);

  const mutation = sqlProcess(`
    update public.pack_cards set owner_prompt = 'Late mutation'
    where pack_version_id = '${versionId}' and id = 'card-1'
  `);
  const early = await Promise.race([
    waitForExit(mutation).then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 300)),
  ]);
  assert.equal(early, false, "card mutation must wait for publish lock");

  assert.equal((await waitForExit(publication)).code, 0);
  const rejected = await waitForExit(mutation);
  assert.notEqual(rejected.code, 0);
  assert.match(rejected.stderr, /published pack cards are immutable/);
  assert.equal(
    sql(
      `select owner_prompt from public.pack_cards where pack_version_id = '${versionId}' and id = 'card-1'`,
    ),
    "Owner 1",
  );
});
