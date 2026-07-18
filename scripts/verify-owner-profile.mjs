import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relative) {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

export function verifyOwnerProfile() {
  const migration = source(
    "supabase/migrations/20260718000900_owner_profile.sql",
  );
  const reshareMigration = source(
    "supabase/migrations/20260718001000_profile_reshare.sql",
  );
  for (const contract of [
    "create or replace function public.get_owner_profile",
    "create or replace function public.record_owner_profile_event",
    "private.authorize_owner_play_capability",
    "link.kind = 'public'",
    "response.status = 'submitted'",
    "when coalesce(sample.sample_count, 0) < 3 then null",
    "'sightStatus'",
    "'profile_viewed'",
    "properties - array['packVersion']::text[] = '{}'::jsonb",
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
      .slice(
        profileFunction,
        migration.indexOf(
          "create or replace function public.record_owner_profile_event",
        ),
      )
      .match(/private\.authorize_owner_play_capability/g)?.length,
    1,
    "profile RPC must call the capability helper exactly once",
  );
  for (const contract of [
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
  assert.match(getRoute, /parseOwnerCookieHeader/);
  assert.doesNotMatch(getRoute, /params|searchParams|playId/);

  const eventRoute = source("app/api/me/profile/events/route.ts");
  assert.match(eventRoute, /ownerProfileEventSchema/);
  assert.match(eventRoute, /maximumBodyBytes:\s*64/);
  assert.match(eventRoute, /recordOwnerProfileEventResponse/);

  const core = source("lib/owner-profile/owner-profile-core.mjs");
  assert.match(core, /sampleCount < 3/);
  assert.match(core, /card\.counts !== null/);
  assert.match(core, /card\.counts\.a \+ card\.counts\.b/);
  assert.match(core, /OWNER_PROFILE_WATERMARK_KEY/);
  assert.doesNotMatch(core, /console\s*\./);

  const view = source("app/me/owner-profile-view.tsx");
  for (const contract of [
    "공개 링크로 도착한 시선",
    "시선을 모으는 중",
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
  assert.doesNotMatch(view, /console\s*\./);

  assert.match(source("app/play/[playId]/owner-play.tsx"), /내 시선 프로필/);
  assert.match(
    source("app/me/plays/[playId]/share-link-manager.tsx"),
    /href="\/me"[\s\S]*내 시선 프로필/,
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
