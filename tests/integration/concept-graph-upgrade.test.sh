#!/usr/bin/env bash

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DB_CONTAINER="supabase_db_gyeop"
BASE_VERSION="20260724000100"
MIGRATION="$ROOT/supabase/migrations/20260724000200_pack_content_concepts_v1.sql"
SEED="$ROOT/supabase/seed.sql"
TEMP_DIR=$(mktemp -d)

if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo "Local Supabase database is not running." >&2
  exit 1
fi

restore_latest() {
  local original_status=$?
  trap - EXIT
  rm -rf "$TEMP_DIR"
  if ! pnpm exec supabase db reset --local >/dev/null 2>&1; then
    echo "Failed to restore the latest local Supabase schema." >&2
    exit 1
  fi
  exit "$original_status"
}
trap restore_latest EXIT

cd "$ROOT"

reset_base() {
  pnpm exec supabase db reset \
    --local \
    --version "$BASE_VERSION" \
    --no-seed \
    >/dev/null
}

psql_command() {
  docker exec "$DB_CONTAINER" psql \
    -U postgres \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    "$@"
}

psql_file() {
  docker exec -i "$DB_CONTAINER" psql \
    -U supabase_admin \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    <"$1"
}

catalog_state() {
  psql_command -At -c "
    select json_build_object(
      'templates', (select count(*) from public.pack_templates),
      'versions', (select count(*) from public.pack_versions),
      'cards', (select count(*) from public.pack_cards),
      'conceptVersions', (
        select count(*) from public.pack_versions where concept_version = 1
      ),
      'conceptCards', (
        select count(*) from public.pack_cards
        where concept_context is not null and concept_signals is not null
      ),
      'pointerDigest', (
        select md5(string_agg(
          template.id::text || ':' || coalesce(template.published_version_id::text, ''),
          ',' order by template.id
        ))
        from public.pack_templates as template
      )
    )::text
  "
}

assert_latest_counts() {
  local actual
  actual=$(
    psql_command -At -c "
      select count(*) from public.pack_templates;
      select count(*) from public.pack_versions;
      select count(*) from public.pack_cards;
      select count(*) from public.pack_versions where concept_version = 1;
      select count(*) from public.pack_cards
        where concept_context is not null and concept_signals is not null;
      select count(*) from public.pack_versions where concept_version is null;
      select count(*) from public.pack_cards
        where concept_context is null and concept_signals is null;
      select count(*)
      from public.pack_templates as template
      join public.pack_versions as version
        on version.id = template.published_version_id
      where version.concept_version = 1;
      select count(*)
      from pg_catalog.pg_tables
      where schemaname = 'private' and tablename like 'seed_expected_%';
    " | paste -sd' ' -
  )
  if [[ "$actual" != "24 69 690 24 240 45 450 24 0" ]]; then
    echo "Concept graph catalog counts drifted: $actual" >&2
    exit 1
  fi
}

assert_failed_atomically() {
  local label=$1
  local file=$2
  local before
  local after
  before=$(catalog_state)
  if psql_file "$file" >"$TEMP_DIR/$label.log" 2>&1; then
    echo "$label unexpectedly succeeded." >&2
    exit 1
  fi
  after=$(catalog_state)
  if [[ "$after" != "$before" ]]; then
    echo "$label changed catalog rows or published pointers." >&2
    echo "before: $before" >&2
    echo "after:  $after" >&2
    exit 1
  fi
}

insert_uuid_conflict() {
  psql_command -c "
    insert into public.pack_versions (
      id, template_id, version, concept_version
    ) values (
      '870126e1-572b-4ccc-a5e4-c10ef30c6dca',
      '630c20b9-460b-443b-b74b-865d1dfdf5fb',
      'after-work-conflict',
      1
    )
  " >/dev/null
}

insert_partial_row() {
  psql_command -c "
    insert into public.pack_versions (
      id, template_id, version, concept_version
    ) values (
      '870126e1-572b-4ccc-a5e4-c10ef30c6dca',
      '630c20b9-460b-443b-b74b-865d1dfdf5fb',
      'after-work-v3',
      1
    );
    insert into public.pack_cards (
      pack_version_id, id, position, owner_prompt, visitor_prompt,
      option_a, option_b, is_signature, concept_context, concept_signals
    ) values (
      '870126e1-572b-4ccc-a5e4-c10ef30c6dca',
      'clock-out',
      1,
      'conflicting partial prompt',
      '할 일을 마친 직후 이 사람은?',
      '바로 다음 즐거움으로 전환한다',
      '잠깐 멍하니 속도를 늦춘다',
      true,
      '퇴근·전환',
      '[{\"conceptId\":\"reg.transition\",\"directionForOptionA\":\"a\"}]'::jsonb
    )
  " >/dev/null
}

# Content migration: clean apply and an exact idempotent rerun.
reset_base
psql_file "$MIGRATION" >/dev/null
assert_latest_counts
first_migration_state=$(catalog_state)
psql_file "$MIGRATION" >/dev/null
[[ "$(catalog_state)" == "$first_migration_state" ]]

# Deterministic UUID conflict and a pre-existing partial row both fail before
# publication and leave every pre-upgrade row and pointer unchanged.
reset_base
insert_uuid_conflict
assert_failed_atomically "migration-uuid-conflict" "$MIGRATION"

reset_base
insert_partial_row
assert_failed_atomically "migration-partial-row" "$MIGRATION"

# Failures during publication or after the publication postcheck roll back the
# entire explicit migration transaction, including every pointer update.
perl -0pe '
  s/perform public\.publish_pack_version\(publication\.id\);/perform public.publish_pack_version(publication.id);\n      raise exception '\''forced publication failure'\'';/
' "$MIGRATION" >"$TEMP_DIR/publish-failure.sql"
reset_base
assert_failed_atomically "migration-publish-failure" "$TEMP_DIR/publish-failure.sql"

perl -0pe '
  s/\ncommit;\s*\z/\ndo \$forced_postcheck\$ begin\n  raise exception '\''forced postcheck failure'\'';\nend \$forced_postcheck\$;\n\ncommit;\n/
' "$MIGRATION" >"$TEMP_DIR/postcheck-failure.sql"
reset_base
assert_failed_atomically "migration-postcheck-failure" "$TEMP_DIR/postcheck-failure.sql"

# The generated seed has the same clean/rerun/conflict rollback contract when
# applied to the concept schema before the content migration.
reset_base
psql_file "$SEED" >/dev/null
assert_latest_counts
first_seed_state=$(catalog_state)
psql_file "$SEED" >/dev/null
[[ "$(catalog_state)" == "$first_seed_state" ]]

reset_base
insert_uuid_conflict
assert_failed_atomically "seed-uuid-conflict" "$SEED"

reset_base
insert_partial_row
assert_failed_atomically "seed-partial-row" "$SEED"

node "$ROOT/scripts/verify-pack-catalog.mjs"
echo "Concept graph upgrade fixtures passed: clean rerun conflict partial publish postcheck seed rollback"
