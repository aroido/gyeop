#!/usr/bin/env bash

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DB_CONTAINER="supabase_db_gyeop"

if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo "Local Supabase database is not running." >&2
  exit 1
fi

actual=$(
  docker exec "$DB_CONTAINER" psql \
    -U postgres \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -At \
    -c "
      select count(*) from public.pack_templates;
      select count(*) from public.pack_versions;
      select count(*) from public.pack_cards;
      select count(*) from public.pack_versions where concept_version = 1;
      select count(*) from public.pack_cards where concept_context is not null and concept_signals is not null;
      select count(*) from public.pack_versions where concept_version is null;
      select count(*) from public.pack_cards where concept_context is null and concept_signals is null;
      select count(*)
      from public.pack_templates as template
      join public.pack_versions as version on version.id = template.published_version_id
      where version.concept_version = 1;
      select count(*)
      from pg_catalog.pg_tables
      where schemaname = 'private' and tablename like 'seed_expected_%';
    " |
    paste -sd' ' -
)

expected="24 69 690 24 240 45 450 24 0"
if [[ "$actual" != "$expected" ]]; then
  echo "Concept graph catalog counts drifted." >&2
  echo "expected: $expected" >&2
  echo "actual:   $actual" >&2
  exit 1
fi

node "$ROOT/scripts/verify-pack-catalog.mjs"
node "$ROOT/scripts/verify-supabase-types.mjs"
echo "Concept graph upgrade check passed: $actual"
