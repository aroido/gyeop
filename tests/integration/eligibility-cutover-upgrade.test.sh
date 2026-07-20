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
pnpm exec supabase db reset --local --version 20260719000400 >/dev/null

docker exec -i "$DATABASE_CONTAINER" psql \
  -U postgres -d postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $legacy$
declare
  v_now timestamptz := clock_timestamp();
  v_outcome text;
begin
  insert into public.pack_plays (
    id, pack_version_id, management_secret_hash, management_expires_at,
    last_active_at, status, current_position, completed_at
  ) values (
    '21600000-0000-4000-8000-000000000001',
    '15151515-1515-4515-8515-151515151515',
    decode(repeat('60', 32), 'hex'), v_now + interval '7 days',
    v_now, 'draft', 1, null
  );
  insert into public.self_answers (
    pack_play_id, pack_version_id, card_id, choice
  ) values (
    '21600000-0000-4000-8000-000000000001',
    '15151515-1515-4515-8515-151515151515', 'conflict', 'a'
  );
  insert into public.share_links (
    id, public_id, pack_play_id, kind, secret_hash
  ) values (
    '21610000-0000-4000-8000-000000000001',
    'EEEEEEEEEEEEEEEEEEEEEQ',
    '21600000-0000-4000-8000-000000000001',
    'public', decode(repeat('61', 32), 'hex')
  );

  select public.start_response(
    'EEEEEEEEEEEEEEEEEEEEEQ', decode(repeat('61', 32), 'hex'), 'start',
    null, null,
    '21620000-0000-4000-8000-000000000001',
    decode(repeat('62', 32), 'hex'),
    'old_friend', 'ten_years_or_more', decode(repeat('63', 32), 'hex')
  )->>'outcome' into v_outcome;

  if v_outcome <> 'created' then
    raise exception 'legacy visitor response fixture was not created';
  end if;

  insert into public.visitor_answers (
    response_id, pack_version_id, card_id, choice
  )
  select response_id, pack_version_id, card_id, 'b'
  from public.visitor_assignments
  where response_id = '21620000-0000-4000-8000-000000000001'
  order by position
  limit 1;

  update private.analytics_measurement_markers
  set started_at = '2000-01-01 00:00:00+00'
  where name = 'core_funnel_v1';

  if (select count(*) from public.pack_plays) <> 1
    or (select count(*) from public.self_answers) <> 1
    or (select count(*) from public.share_links) <> 1
    or (select count(*) from public.visitor_responses) <> 1
    or (select count(*) from public.visitor_assignments) <> 3
    or (select count(*) from public.visitor_answers) <> 1
    or (select count(*) from public.analytics_events) = 0
    or (select count(*) from public.rate_limit_buckets) = 0 then
    raise exception 'legacy eligibility fixture is incomplete';
  end if;
end
$legacy$;
SQL

if ! pnpm exec supabase migration up --local; then
  echo "Eligibility cutover migration failed." >&2
  exit 1
fi

docker exec -i "$DATABASE_CONTAINER" psql \
  -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $upgraded$
begin
  if (select count(*) from public.pack_plays) <> 0
    or (select count(*) from public.self_answers) <> 0
    or (select count(*) from public.share_links) <> 0
    or (select count(*) from public.visitor_responses) <> 0
    or (select count(*) from public.visitor_assignments) <> 0
    or (select count(*) from public.visitor_answers) <> 0
    or (select count(*) from public.analytics_events) <> 0
    or (select count(*) from public.rate_limit_buckets) <> 0 then
    raise exception 'eligibility cutover retained pre-policy product data';
  end if;

  if (select count(*) from public.pack_templates where is_active) <> 24
    or (select count(*) from public.pack_versions where published_at is not null) <> 24
    or (select count(*) from public.pack_cards) <> 240 then
    raise exception 'published pack catalog was not expanded to 24 packs';
  end if;

  if (select started_at from private.analytics_measurement_markers
      where name = 'core_funnel_v1') <= '2000-01-01 00:00:00+00' then
    raise exception 'eligibility cutover did not restart funnel measurement';
  end if;
end
$upgraded$;
SQL

echo "Eligibility cutover upgrade verification passed."
