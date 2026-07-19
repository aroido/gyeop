#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATABASE_CONTAINER="supabase_db_gyeop"

restore_latest() {
  local original_status=$?
  trap - EXIT
  if ! pnpm exec supabase db reset --local >/dev/null 2>&1; then
    echo "Failed to restore the latest local Supabase schema." >&2
    exit 1
  fi
  exit "$original_status"
}
trap restore_latest EXIT

cd "$ROOT"
pnpm exec supabase db reset --local --version 20260718000600 >/dev/null

docker exec -i "$DATABASE_CONTAINER" psql \
  -U postgres -d postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $legacy$
declare
  v_now timestamptz := clock_timestamp();
  v_outcome text;
begin
  if to_regclass('public.visitor_assignments') is not null then
    raise exception 'visitor assignments unexpectedly exist before upgrade';
  end if;

  insert into public.pack_plays (
    id, pack_version_id, management_secret_hash, management_expires_at,
    last_active_at, status, current_position, completed_at
  ) values (
    '23700000-0000-4000-8000-000000000001',
    '15151515-1515-4515-8515-151515151515',
    decode(repeat('70', 32), 'hex'), v_now + interval '7 days',
    v_now, 'completed', 10, v_now
  );
  insert into public.share_links (
    id, public_id, pack_play_id, kind, secret_hash
  ) values (
    '23710000-0000-4000-8000-000000000001',
    'GGGGGGGGGGGGGGGGGGGGGQ',
    '23700000-0000-4000-8000-000000000001',
    'public', decode(repeat('71', 32), 'hex')
  );

  select public.start_response(
    'GGGGGGGGGGGGGGGGGGGGGQ', decode(repeat('71', 32), 'hex'), 'start',
    null, null,
    '23720000-0000-4000-8000-000000000001',
    decode(repeat('72', 32), 'hex'),
    'old_friend', 'ten_years_or_more', decode(repeat('73', 32), 'hex')
  )->>'outcome' into v_outcome;

  if v_outcome <> 'created'
    or (select count(*) from public.visitor_responses) <> 1
    or (select count(*) from public.analytics_events
        where visitor_response_id = '23720000-0000-4000-8000-000000000001') <> 2
    or (select count from public.rate_limit_buckets
        where key_hash = decode(repeat('73', 32), 'hex')
          and action = 'response_start') <> 1 then
    raise exception 'legacy response fixture was not created exactly once';
  end if;
end
$legacy$;
SQL

docker exec -i "$DATABASE_CONTAINER" psql \
  -U supabase_admin -d postgres -v ON_ERROR_STOP=1 >/dev/null \
  <"$ROOT/supabase/migrations/20260718000700_visitor_required_assignments.sql"

docker exec -i "$DATABASE_CONTAINER" psql \
  -U postgres -d postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $upgraded$
declare
  v_result jsonb;
begin
  if (select count(*) from public.visitor_assignments
      where response_id = '23720000-0000-4000-8000-000000000001') <> 3
    or (select array_agg(position order by position)
        from public.visitor_assignments
        where response_id = '23720000-0000-4000-8000-000000000001')
        <> array[1, 2, 3]::smallint[]
    or (select count(*)
        from public.visitor_assignments assignment
        join public.pack_cards card
          on card.pack_version_id = assignment.pack_version_id
          and card.id = assignment.card_id
        where assignment.response_id = '23720000-0000-4000-8000-000000000001'
          and assignment.position = 1
          and card.is_signature) <> 1 then
    raise exception 'legacy response was not backfilled with exact assignments';
  end if;

  select public.start_response(
    'GGGGGGGGGGGGGGGGGGGGGQ', decode(repeat('71', 32), 'hex'), 'resume',
    '23720000-0000-4000-8000-000000000001', decode(repeat('72', 32), 'hex'),
    null, null, null, null, decode(repeat('73', 32), 'hex')
  ) into v_result;

  if v_result->>'outcome' <> 'resumed'
    or jsonb_array_length(v_result->'response'->'assignments') <> 3
    or (select count(*) from public.visitor_responses) <> 1
    or (select count(*) from public.analytics_events
        where visitor_response_id = '23720000-0000-4000-8000-000000000001') <> 2
    or (select count from public.rate_limit_buckets
        where key_hash = decode(repeat('73', 32), 'hex')
          and action = 'response_start') <> 1 then
    raise exception 'upgrade changed the legacy response, quota, event, or resume invariant';
  end if;
end
$upgraded$;
SQL

echo "Visitor assignment upgrade verification passed."
