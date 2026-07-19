import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relative) {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

export function verifyPrivateOneToOne() {
  const migration = source(
    "supabase/migrations/20260719000400_private_one_to_one_comparison.sql",
  );
  for (const contract of [
    "create function public.list_owner_1to1_responses",
    "create function public.get_private_1to1_comparison",
    "private.authorize_owner_play_capability",
    "link.kind = 'one_to_one'",
    "link.consumed_response_id = response.id",
    "response.status in ('submitted', 'withdrawn')",
    "response.status = 'submitted'",
    "grant execute on function public.list_owner_1to1_responses",
    "grant execute on function public.get_private_1to1_comparison",
  ]) {
    assert.ok(
      migration.includes(contract),
      `missing private 1:1 SQL: ${contract}`,
    );
  }
  assert.equal(
    migration.match(/private\.authorize_owner_play_capability/g)?.length,
    2,
    "each owner RPC must authorize exactly once",
  );
  assert.doesNotMatch(migration, /visitor_name|owner_name|display_name/i);

  const listRoute = source("app/api/me/plays/[playId]/responses/route.ts");
  const detailRoute = source("app/api/me/responses/[responseId]/route.ts");
  for (const route of [listRoute, detailRoute]) {
    assert.match(route, /withPublicRequest\s*\(/);
    assert.match(route, /privateNoStore:\s*true/);
    assert.match(route, /action:\s*"owner_play_access"/);
    assert.match(route, /parseOwnerCookieHeader/);
    assert.match(route, /privateOneToOneMethodNotAllowed as HEAD/);
  }
  assert.match(listRoute, /query\.get\("kind"\) !== "one_to_one"/);
  assert.match(detailRoute, /isVisitorResponseId/);

  const adapter = source("lib/http/private-one-to-one.ts");
  assert.match(adapter, /ownerNotFoundResponse\(true\)/);
  assert.match(adapter, /Response\.json\(\{ responses: result\.responses \}\)/);
  assert.match(adapter, /Response\.json\(result\.comparison\)/);

  const core = source("lib/private-one-to-one/private-one-to-one-core.mjs");
  for (const leak of [
    "visitorName",
    "sessionExpiresAt",
    "publicId",
    "secretHash",
  ]) {
    assert.ok(
      !core.includes(`"${leak}"`),
      `private decoder must not allow ${leak}`,
    );
  }
  assert.match(core, /requiredCount !== 3/);
  assert.match(core, /highlightCount !== \(mismatchCount === 0 \? 0 : 1\)/);

  const panel = source("app/me/plays/[playId]/private-one-to-one-panel.tsx");
  for (const copy of [
    "1:1로 본 우리",
    "둘만 보는 1:1 비교",
    "내 실제 답",
    "친구가 본 나",
    "철회된 1:1 답변",
    "비교 내용은 남아 있지 않아요",
  ]) {
    assert.ok(panel.includes(copy), `missing private 1:1 UI: ${copy}`);
  }
  assert.doesNotMatch(panel, /이름을 입력|닉네임|방문자 이름/);

  const priority = source("docs/product/core-feature-priority.md");
  const decisions = source("docs/product/decision-log.md");
  assert.match(
    priority,
    /1:1 응답은 `\/me` 누적·관계 레이어·질문 표본에서 제외/,
  );
  assert.match(decisions, /1:1 응답은 두 참여자에게만 개별 비교 허용/);
  return true;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifyPrivateOneToOne();
  console.log("Private one-to-one source verification passed.");
}
