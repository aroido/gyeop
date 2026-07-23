import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relative) {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

export function verifyOwnerProfile() {
  const migration = source(
    "supabase/migrations/20260723000200_owner_profile_relationship_layers.sql",
  );
  const optionalAnswersMigration = source(
    "supabase/migrations/20260719000200_visitor_optional_answers.sql",
  );
  const authenticatedOwnerMigration = source(
    "supabase/migrations/20260720000100_anonymous_owner_claim.sql",
  );
  const reshareMigration = source(
    "supabase/migrations/20260718001000_profile_reshare.sql",
  );
  for (const contract of [
    "create or replace function public.get_owner_profile",
    "private.authorize_owner_play_capability",
    "link.kind = 'public'",
    "response.status = 'submitted'",
    "'relationshipLayers'",
    "'relationshipCode'",
    "'status', 'collecting'",
    "'status', 'available'",
    "'sightStatus'",
  ]) {
    assert.ok(
      migration.includes(contract),
      `missing owner profile migration contract: ${contract}`,
    );
  }
  const profileFunction = migration.indexOf(
    "create or replace function public.get_owner_profile",
  );
  const profileAuthorize = migration.indexOf(
    "private.authorize_owner_play_capability",
    profileFunction,
  );
  const profileRead = migration.indexOf(
    "from public.pack_plays as play",
    profileFunction,
  );
  assert.ok(
    profileAuthorize > profileFunction && profileAuthorize < profileRead,
    "profile RPC must authorize before reading owner state",
  );
  assert.equal(
    migration
      .slice(profileFunction)
      .match(/private\.authorize_owner_play_capability/g)?.length,
    1,
    "profile RPC must call the capability helper exactly once",
  );
  const sightCountQuery = migration.slice(
    migration.indexOf("select count(*)::bigint", profileRead),
    migration.indexOf("select jsonb_agg(", profileRead),
  );
  for (const contract of [
    "link.pack_play_id = p_play_id",
    "link.kind = 'public'",
    "response.pack_version_id = v_pack_version_id",
    "response.status = 'submitted'",
  ]) {
    assert.ok(
      sightCountQuery.includes(contract),
      `owner profile sight count must stay scoped: ${contract}`,
    );
  }

  const topLevelProjection = migration.slice(
    migration.indexOf("select jsonb_agg(", profileRead),
    migration.indexOf("select coalesce(", profileRead),
  );
  for (const contract of [
    "link.pack_play_id = p_play_id",
    "link.kind = 'public'",
    "response.pack_version_id = v_pack_version_id",
    "response.status = 'submitted'",
    "where relation_sample.sample_count >= 3",
    "as relation_sight",
    "on relation_sight.relationship_code = relation_sample.relationship_code",
    "and relation_sight.sight_count >= 3",
    "'sampleCount', coalesce(sample.sample_count, 0)",
    "when sample.sample_count is null then null",
  ]) {
    assert.ok(
      topLevelProjection.includes(contract),
      `owner profile safe projection must preserve: ${contract}`,
    );
  }
  const relationSampleEnd = topLevelProjection.indexOf(") as relation_sample");
  const relationSightEnd = topLevelProjection.indexOf(") as relation_sight");
  assert.ok(
    relationSampleEnd >= 0 && relationSightEnd > relationSampleEnd,
    "top-level projection must join one relationship sight aggregate",
  );
  const relationshipSightAggregate = topLevelProjection.slice(
    topLevelProjection.indexOf("join (", relationSampleEnd),
    relationSightEnd,
  );
  for (const contract of [
    "from public.visitor_responses as response",
    "join public.share_links as link",
    "link.pack_play_id = p_play_id",
    "link.kind = 'public'",
    "response.pack_version_id = v_pack_version_id",
    "response.status = 'submitted'",
    "group by response.relationship_code",
  ]) {
    assert.ok(
      relationshipSightAggregate.includes(contract),
      `relationship sight aggregate must stay scoped: ${contract}`,
    );
  }

  const relationshipProjection = migration.slice(
    migration.indexOf("select coalesce(", profileRead),
    migration.indexOf(
      "if jsonb_array_length(coalesce(v_cards",
      profileRead,
    ),
  );
  for (const contract of [
    "link.pack_play_id = p_play_id",
    "link.kind = 'public'",
    "response.pack_version_id = v_pack_version_id",
    "response.status = 'submitted'",
    "when sight.sight_count < 3 then 'collecting'",
    "when sight.sight_count < 3 then '[]'::jsonb",
    "when coalesce(sample.sample_count, 0) < 3",
    "'status', 'available'",
    "order by array_position(",
    "'old_friend'",
    "'school_friend'",
    "'coworker'",
    "'romantic'",
    "'family'",
    "'online_friend'",
    "'social_follower'",
    "'other'",
  ]) {
    assert.ok(
      relationshipProjection.includes(contract),
      `owner profile relationship projection must preserve: ${contract}`,
    );
  }
  assert.doesNotMatch(
    migration,
    /assignment\.stage\s*=/,
    "profile aggregation must include actual required and optional answers",
  );
  assert.match(
    optionalAnswersMigration,
    /create or replace function public\.get_owner_profile/,
  );
  assert.match(
    authenticatedOwnerMigration,
    /return public\.get_owner_profile\(p_play_id, v_hash\)/,
  );
  for (const contract of [
    "create or replace function public.record_owner_profile_event",
    "'profile_reshare_clicked'",
    "'entrySource', 'profile_reshare'",
    "response.status = 'submitted'",
    "link.kind = 'public'",
    "record_owner_share_action_with_source",
    "analytics_profile_reshare_internal_insert",
  ]) {
    assert.ok(
      reshareMigration.includes(contract),
      `missing profile reshare migration contract: ${contract}`,
    );
  }

  const getRoute = source("app/api/me/profile/route.ts");
  assert.match(getRoute, /withPublicRequest\s*\(/);
  assert.match(getRoute, /privateNoStore:\s*true/);
  assert.match(getRoute, /action:\s*"owner_play_access"/);
  assert.match(getRoute, /new URL\(request\.url\)\.searchParams/);
  assert.match(getRoute, /query\.getAll\("playId"\)\.length !== 1/);
  assert.match(getRoute, /isOwnerPlayId\(playId\)/);
  assert.match(getRoute, /readOwnerProfileResponse\(\{ playId, signal \}\)/);
  assert.doesNotMatch(getRoute, /parseOwnerCookieHeader/);

  const profileHttp = source("lib/http/owner-profile.ts");
  assert.match(profileHttp, /getAuthenticatedOwnerProfile/);
  assert.match(profileHttp, /recordAuthenticatedOwnerProfileEvent/);
  assert.match(profileHttp, /authenticatedOwnerFailureResponse/);
  assert.doesNotMatch(profileHttp, /\.catch\(\(\) => null\)/);

  const eventRoute = source("app/api/me/profile/events/route.ts");
  assert.match(eventRoute, /ownerProfileEventSchema/);
  assert.match(eventRoute, /maximumBodyBytes:\s*128/);
  assert.match(eventRoute, /const playId = input\?\.playId/);
  assert.match(eventRoute, /recordOwnerProfileEventResponse/);

  const core = source("lib/owner-profile/owner-profile-core.mjs");
  assert.match(core, /RELATIONSHIP_OPTIONS/);
  assert.match(core, /relationshipSightCount !== value\.sightCount/);
  assert.match(core, /relationshipCard\.status !== "available"/);
  assert.match(core, /card\.sampleCount !== sampleCount/);
  assert.match(core, /card\.counts\.a !== a/);
  assert.match(core, /OWNER_PROFILE_WATERMARK_KEY/);
  assert.doesNotMatch(core, /console\s*\./);

  const view = source("app/me/owner-profile-view.tsx");
  for (const contract of [
    "공개 링크로 도착한 시선",
    "관계별로 보는 나",
    "시선을 모으는 중",
    "이름과 개별 답변은 공개되지 않아요",
    "새 시선 도착",
    "시선이 쌓여 있어요",
    "시선 더 모으기",
    "recordOwnerProfileViewed",
    "recordOwnerProfileReshareClicked",
    "entry_source=profile_reshare",
  ]) {
    assert.ok(view.includes(contract), `missing profile UI: ${contract}`);
  }
  assert.doesNotMatch(view, /팔로워|팔로잉|친밀도|순위|AI 요약/);
  assert.doesNotMatch(view, /이 시선 카드 공유하기/);
  assert.doesNotMatch(view, /console\s*\./);

  const mockup = readFileSync(
    path.join(
      ROOT,
      "docs/assets/mockups/owner-profile-relationship-layers-v1.png",
    ),
  );
  assert.equal(
    createHash("sha256").update(mockup).digest("hex"),
    "6521916f8b5c40fbf81b82374ffb326ece1c89b69abed7d804605c882c35264c",
    "approved owner profile mockup must stay byte-identical",
  );

  const ownerPlay = source("app/play/[playId]/owner-play.tsx");
  assert.match(ownerPlay, /내 질문팩 저장하고 공유하기/);
  assert.match(ownerPlay, /\/auth\/sign-in\?playId=/);
  assert.match(
    source("app/me/plays/[playId]/share-link-manager.tsx"),
    /href=\{`\/me\/profile\/\$\{playId\}`\}[\s\S]*내 시선 프로필/,
  );
  return true;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifyOwnerProfile();
  console.log("Owner profile source verification passed.");
}
