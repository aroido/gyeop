begin;

select no_plan();

select has_function(
  'public',
  'run_local_retention_cleanup',
  array[]::text[],
  'local retention cleanup RPC has the exact signature'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.run_local_retention_cleanup()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.run_local_retention_cleanup()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.run_local_retention_cleanup()',
    'EXECUTE'
  ),
  'cleanup RPC is internal-only'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.anonymous_owners (
  id,
  management_secret_hash,
  management_expires_at,
  last_active_at,
  management_revoked_at,
  created_at,
  updated_at
) select
  '32000000-0000-4000-8000-000000000010',
  decode(repeat('01', 32), 'hex'),
  value - interval '1 minute',
  value - interval '7 days 1 minute',
  null,
  value - interval '7 days 1 minute',
  value - interval '7 days 1 minute'
from fixed_time;

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id,
  pack_version_id,
  anonymous_owner_id,
  owner_id,
  management_secret_hash,
  management_expires_at,
  last_active_at,
  management_revoked_at,
  status,
  current_position,
  created_at,
  updated_at,
  completed_at
) select
  '32000000-0000-4000-8000-000000000011',
  '15151515-1515-4515-8515-151515151515',
  '32000000-0000-4000-8000-000000000010',
  null,
  null,
  value - interval '1 minute',
  value - interval '7 days 1 minute',
  value - interval '1 minute',
  'draft',
  1,
  value - interval '7 days 1 minute',
  value - interval '1 minute',
  null
from fixed_time;

insert into auth.users (
  id,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '32000000-0000-4000-8000-000000000020',
  'cleanup-claimed@example.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  clock_timestamp(),
  clock_timestamp()
);

with fixed_time as (select clock_timestamp() as value)
insert into public.anonymous_owners (
  id,
  management_secret_hash,
  management_expires_at,
  last_active_at,
  management_revoked_at,
  created_at,
  updated_at
) select
  '32000000-0000-4000-8000-000000000021',
  decode(repeat('02', 32), 'hex'),
  value - interval '1 minute',
  value - interval '7 days 1 minute',
  null,
  value - interval '7 days 1 minute',
  value - interval '7 days 1 minute'
from fixed_time;

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id,
  pack_version_id,
  anonymous_owner_id,
  owner_id,
  management_secret_hash,
  management_expires_at,
  last_active_at,
  management_revoked_at,
  status,
  current_position,
  created_at,
  updated_at,
  completed_at
) select
  '32000000-0000-4000-8000-000000000022',
  '15151515-1515-4515-8515-151515151515',
  '32000000-0000-4000-8000-000000000021',
  '32000000-0000-4000-8000-000000000020',
  null,
  value - interval '1 minute',
  value - interval '7 days 1 minute',
  value - interval '1 minute',
  'completed',
  10,
  value - interval '7 days 1 minute',
  value - interval '1 minute',
  value - interval '1 day'
from fixed_time;

with fixed_time as (select clock_timestamp() as value)
insert into public.anonymous_owners (
  id,
  management_secret_hash,
  management_expires_at,
  last_active_at,
  management_revoked_at,
  created_at,
  updated_at
) select
  '32000000-0000-4000-8000-000000000023',
  decode(repeat('03', 32), 'hex'),
  value - interval '1 minute',
  value - interval '7 days 1 minute',
  null,
  value - interval '7 days 1 minute',
  value - interval '7 days 1 minute'
from fixed_time;

insert into public.share_links (
  id,
  public_id,
  pack_play_id,
  kind,
  secret_hash,
  status
) values (
  '32000000-0000-4000-8000-000000000030',
  'CCCCCCCCCCCCCCCCCCCCCA',
  '32000000-0000-4000-8000-000000000022',
  'public',
  decode(repeat('04', 32), 'hex'),
  'active'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id,
  share_link_id,
  pack_version_id,
  relationship_code,
  known_since_code,
  status,
  session_token_hash,
  session_expires_at,
  management_token_hash,
  created_at,
  submitted_at,
  withdrawn_at
) select
  '32000000-0000-4000-8000-000000000031',
  '32000000-0000-4000-8000-000000000030',
  '15151515-1515-4515-8515-151515151515',
  'old_friend',
  'ten_years_or_more',
  'draft',
  decode(repeat('05', 32), 'hex'),
  value - interval '1 minute',
  null,
  value - interval '24 hours 1 minute',
  null,
  null
from fixed_time;

insert into public.visitor_assignments (
  response_id,
  pack_version_id,
  card_id,
  stage,
  position
)
select
  '32000000-0000-4000-8000-000000000031',
  '15151515-1515-4515-8515-151515151515',
  ranked.id,
  'required',
  ranked.position::smallint
from (
  select card.id, row_number() over (order by card.position) as position
  from public.pack_cards as card
  where card.pack_version_id = '15151515-1515-4515-8515-151515151515'
  order by card.position
  limit 1
) as ranked;

insert into public.visitor_answers (
  response_id,
  pack_version_id,
  card_id,
  choice
)
select
  assignment.response_id,
  assignment.pack_version_id,
  assignment.card_id,
  'a'
from public.visitor_assignments as assignment
where assignment.response_id = '32000000-0000-4000-8000-000000000031';

insert into public.analytics_events (
  id,
  event_name,
  owner_play_id,
  share_link_id,
  visitor_response_id,
  properties,
  occurred_at
) values (
  '32000000-0000-4000-8000-000000000032',
  'relationship_selected',
  null,
  '32000000-0000-4000-8000-000000000030',
  '32000000-0000-4000-8000-000000000031',
  '{"packVersion":"old-friend-v1","linkKind":"public"}'::jsonb,
  clock_timestamp()
);

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id,
  share_link_id,
  pack_version_id,
  relationship_code,
  known_since_code,
  status,
  session_token_hash,
  session_expires_at,
  management_token_hash,
  created_at,
  submitted_at,
  withdrawn_at
) select
  '32000000-0000-4000-8000-000000000033',
  '32000000-0000-4000-8000-000000000030',
  '15151515-1515-4515-8515-151515151515',
  'family',
  'three_to_five_years',
  'submitted',
  decode(repeat('06', 32), 'hex'),
  value - interval '1 minute',
  decode(repeat('07', 32), 'hex'),
  value - interval '24 hours 1 minute',
  value - interval '24 hours 1 minute',
  null
from fixed_time;

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id,
  share_link_id,
  pack_version_id,
  relationship_code,
  known_since_code,
  status,
  session_token_hash,
  session_expires_at,
  management_token_hash,
  created_at,
  submitted_at,
  withdrawn_at
) select
  '32000000-0000-4000-8000-000000000034',
  '32000000-0000-4000-8000-000000000030',
  '15151515-1515-4515-8515-151515151515',
  'coworker',
  'one_to_three_years',
  'submitted',
  decode(repeat('08', 32), 'hex'),
  value + interval '23 hours',
  decode(repeat('09', 32), 'hex'),
  value - interval '1 hour',
  value - interval '1 hour',
  null
from fixed_time;

insert into public.rate_limit_buckets (
  key_hash,
  action,
  window_start,
  count,
  expires_at
) values
  (
    decode(repeat('0a', 32), 'hex'),
    'response_start',
    clock_timestamp() - interval '2 days',
    1,
    clock_timestamp() - interval '25 hours'
  ),
  (
    decode(repeat('0b', 32), 'hex'),
    'response_start',
    clock_timestamp(),
    1,
    clock_timestamp() + interval '1 hour'
  );

insert into public.analytics_events (
  id,
  event_name,
  properties,
  occurred_at
) values
  (
    '32000000-0000-4000-8000-000000000040',
    'invite_opened',
    '{"packVersion":"old-friend-v1","linkKind":"public"}'::jsonb,
    clock_timestamp() - interval '31 days'
  ),
  (
    '32000000-0000-4000-8000-000000000041',
    'invite_opened',
    '{"packVersion":"old-friend-v1","linkKind":"public"}'::jsonb,
    clock_timestamp() - interval '29 days'
  );

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id,
  share_link_id,
  pack_version_id,
  relationship_code,
  known_since_code,
  status,
  session_token_hash,
  session_expires_at,
  management_token_hash,
  created_at,
  submitted_at,
  withdrawn_at
) select
  '32000000-0000-4000-8000-000000000050',
  '32000000-0000-4000-8000-000000000030',
  '15151515-1515-4515-8515-151515151515',
  'other',
  'not_sure',
  'draft',
  decode(repeat('0c', 32), 'hex'),
  value + interval '23 hours',
  null,
  value - interval '1 hour',
  null,
  null
from fixed_time;

insert into public.visitor_assignments (
  response_id,
  pack_version_id,
  card_id,
  stage,
  position
)
select
  '32000000-0000-4000-8000-000000000050',
  '15151515-1515-4515-8515-151515151515',
  ranked.id,
  'required',
  ranked.position::smallint
from (
  select card.id, row_number() over (order by card.position) as position
  from public.pack_cards as card
  where card.pack_version_id = '15151515-1515-4515-8515-151515151515'
  order by card.position
  limit 1
) as ranked;

create temporary table answer_touch_cutoffs (
  first_touch timestamptz,
  same_choice_touch timestamptz,
  changed_choice_touch timestamptz
) on commit drop;

insert into public.visitor_answers (
  response_id,
  pack_version_id,
  card_id,
  choice
)
select
  assignment.response_id,
  assignment.pack_version_id,
  assignment.card_id,
  'a'
from public.visitor_assignments as assignment
where assignment.response_id = '32000000-0000-4000-8000-000000000050';

insert into answer_touch_cutoffs (first_touch)
select session_expires_at
from public.visitor_responses
where id = '32000000-0000-4000-8000-000000000050';

select pg_sleep(0.01);

update public.visitor_answers
set choice = 'a'
where response_id = '32000000-0000-4000-8000-000000000050';

update answer_touch_cutoffs
set same_choice_touch = (
  select session_expires_at
  from public.visitor_responses
  where id = '32000000-0000-4000-8000-000000000050'
);

select pg_sleep(0.01);

update public.visitor_answers
set choice = 'b'
where response_id = '32000000-0000-4000-8000-000000000050';

update answer_touch_cutoffs
set changed_choice_touch = (
  select session_expires_at
  from public.visitor_responses
  where id = '32000000-0000-4000-8000-000000000050'
);

select ok(
  (
    select first_touch > clock_timestamp() + interval '23 hours 50 minutes'
    from answer_touch_cutoffs
  ),
  'first draft answer write extends the cutoff to about now plus 24 hours'
);
select ok(
  (
    select same_choice_touch = first_touch
    from answer_touch_cutoffs
  ),
  'same-choice retry does not extend the draft cutoff'
);
select ok(
  (
    select changed_choice_touch > same_choice_touch
    from answer_touch_cutoffs
  ),
  'actual choice change extends the draft cutoff again'
);

set local role service_role;

create temporary table cleanup_result
on commit drop
as
select public.run_local_retention_cleanup() as payload;

reset role;

select is(
  (select payload->>'outcome' from cleanup_result),
  'ok',
  'cleanup returns ok when it acquires the lock'
);
select ok(
  (
    select payload ?& array[
      'anonymous_owner_trees',
      'visitor_drafts',
      'submitted_sessions',
      'rate_limit_buckets',
      'analytics_events'
    ]
    from cleanup_result
  ),
  'cleanup returns every category result'
);
select is(
  (select payload#>>'{anonymous_owner_trees,deleted_count}' from cleanup_result),
  '2',
  'cleanup deletes due unclaimed and orphan anonymous owners'
);
select is(
  (select count(*) from public.pack_plays where id = '32000000-0000-4000-8000-000000000011'),
  0::bigint,
  'anonymous owner cleanup cascades its unclaimed play'
);
select is(
  (select count(*) from public.anonymous_owners where id = '32000000-0000-4000-8000-000000000021'),
  1::bigint,
  'claimed anonymous owner tree is preserved'
);
select is(
  (select count(*) from public.anonymous_owners where id = '32000000-0000-4000-8000-000000000023'),
  0::bigint,
  'expired orphan anonymous owner is also cleaned'
);
select is(
  (select payload#>>'{visitor_drafts,deleted_count}' from cleanup_result),
  '1',
  'cleanup deletes one expired draft visitor response'
);
select is(
  (
    select jsonb_build_object(
      'responses', (select count(*) from public.visitor_responses where id = '32000000-0000-4000-8000-000000000031'),
      'assignments', (select count(*) from public.visitor_assignments where response_id = '32000000-0000-4000-8000-000000000031'),
      'answers', (select count(*) from public.visitor_answers where response_id = '32000000-0000-4000-8000-000000000031')
    )
  ),
  jsonb_build_object('responses', 0, 'assignments', 0, 'answers', 0),
  'draft cleanup removes the draft response and its child rows'
);
select is(
  (
    select jsonb_build_object(
      'id', id,
      'event_name', event_name,
      'occurred_at', occurred_at,
      'owner_play_id', owner_play_id,
      'share_link_id', share_link_id,
      'visitor_response_id', visitor_response_id,
      'properties', properties
    )
    from public.analytics_events
    where id = '32000000-0000-4000-8000-000000000032'
  ),
  (
    select jsonb_build_object(
      'id', id,
      'event_name', event_name,
      'occurred_at', occurred_at,
      'owner_play_id', null,
      'share_link_id', null,
      'visitor_response_id', null,
      'properties', '{}'::jsonb
    )
    from public.analytics_events
    where id = '32000000-0000-4000-8000-000000000032'
  ),
  'draft cleanup preserves raw analytics identity and scrubs only the subjects'
);
select is(
  (select payload#>>'{submitted_sessions,updated_count}' from cleanup_result),
  '1',
  'cleanup nulls one expired submitted session hash'
);
select ok(
  (
    select session_token_hash is null
      and management_token_hash = decode(repeat('07', 32), 'hex')
      and submitted_at is not null
    from public.visitor_responses
    where id = '32000000-0000-4000-8000-000000000033'
  ),
  'submitted cleanup preserves the row and only nulls the expired session hash'
);
select ok(
  (
    select session_token_hash = decode(repeat('08', 32), 'hex')
    from public.visitor_responses
    where id = '32000000-0000-4000-8000-000000000034'
  ),
  'non-due submitted session remains unchanged'
);
select is(
  (select payload#>>'{rate_limit_buckets,deleted_count}' from cleanup_result),
  '1',
  'cleanup deletes one rate-limit bucket past expires_at plus 24 hours'
);
select is(
  (
    select count(*)
    from public.rate_limit_buckets
    where key_hash = decode(repeat('0b', 32), 'hex')
  ),
  1::bigint,
  'non-due rate-limit bucket is preserved'
);
select is(
  (select payload#>>'{analytics_events,deleted_count}' from cleanup_result),
  '1',
  'cleanup deletes one analytics row older than 30 days'
);
select is(
  (
    select count(*)
    from public.analytics_events
    where id = '32000000-0000-4000-8000-000000000041'
  ),
  1::bigint,
  'recent analytics row is preserved'
);

set local role service_role;

create temporary table cleanup_second_result
on commit drop
as
select public.run_local_retention_cleanup() as payload;

reset role;

select is(
  (
    select jsonb_build_object(
      'owners', payload#>>'{anonymous_owner_trees,deleted_count}',
      'drafts', payload#>>'{visitor_drafts,deleted_count}',
      'submitted', payload#>>'{submitted_sessions,updated_count}',
      'buckets', payload#>>'{rate_limit_buckets,deleted_count}',
      'analytics', payload#>>'{analytics_events,deleted_count}'
    )
    from cleanup_second_result
  ),
  jsonb_build_object(
    'owners', '0',
    'drafts', '0',
    'submitted', '0',
    'buckets', '0',
    'analytics', '0'
  ),
  'cleanup is idempotent on a second run'
);

select throws_ok(
  $$
    insert into public.visitor_responses (
      id,
      share_link_id,
      pack_version_id,
      relationship_code,
      known_since_code,
      status,
      session_token_hash,
      session_expires_at,
      management_token_hash,
      created_at,
      submitted_at,
      withdrawn_at
    )
    values (
      '32000000-0000-4000-8000-000000000060',
      '32000000-0000-4000-8000-000000000030',
      '15151515-1515-4515-8515-151515151515',
      'family',
      'one_to_three_years',
      'draft',
      null,
      clock_timestamp() + interval '24 hours',
      null,
      clock_timestamp(),
      null,
      null
    )
  $$,
  '23514',
  null,
  'draft rows still require a non-null session token hash'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id,
  share_link_id,
  pack_version_id,
  relationship_code,
  known_since_code,
  status,
  session_token_hash,
  session_expires_at,
  management_token_hash,
  created_at,
  submitted_at,
  withdrawn_at
) select
  '32000000-0000-4000-8000-000000000061',
  '32000000-0000-4000-8000-000000000030',
  '15151515-1515-4515-8515-151515151515',
  'family',
  'one_to_three_years',
  'submitted',
  null,
  value + interval '24 hours',
  decode(repeat('0d', 32), 'hex'),
  value,
  value,
  null
from fixed_time;

select ok(
  exists (
    select 1
    from public.visitor_responses
    where id = '32000000-0000-4000-8000-000000000061'
      and status = 'submitted'
      and session_token_hash is null
  ),
  'submitted rows allow a null session token hash'
);

select ok(
  position(
    'pg_try_advisory_xact_lock' in pg_get_functiondef(
      'public.run_local_retention_cleanup()'::regprocedure
    )
  ) > 0,
  'cleanup uses a non-blocking transaction advisory lock'
);

insert into public.rate_limit_buckets (
  key_hash,
  action,
  window_start,
  count,
  expires_at
) values (
  decode(repeat('0e', 32), 'hex'),
  'response_start',
  clock_timestamp() - interval '2 days',
  1,
  clock_timestamp() - interval '25 hours'
);

insert into public.analytics_events (
  id,
  event_name,
  properties,
  occurred_at
) values (
  '32000000-0000-4000-8000-000000000070',
  'invite_opened',
  '{"packVersion":"old-friend-v1","linkKind":"public"}'::jsonb,
  clock_timestamp() - interval '31 days'
);

revoke delete on table public.analytics_events from gyeop_internal_rpc;

set local role service_role;

create temporary table cleanup_isolation_result
on commit drop
as
select public.run_local_retention_cleanup() as payload;

reset role;

grant delete on table public.analytics_events to gyeop_internal_rpc;

select is(
  (select payload#>>'{analytics_events,outcome}' from cleanup_isolation_result),
  'error',
  'one failing category returns an allowlisted error outcome'
);
select is(
  (select payload#>>'{analytics_events,error_code}' from cleanup_isolation_result),
  'category_failed',
  'category errors expose only the fixed non-secret error code'
);
select is(
  (
    select count(*)
    from public.rate_limit_buckets
    where key_hash = decode(repeat('0e', 32), 'hex')
  ),
  0::bigint,
  'a failing analytics category does not roll back the successful rate-limit category'
);
select is(
  (
    select count(*)
    from public.analytics_events
    where id = '32000000-0000-4000-8000-000000000070'
  ),
  1::bigint,
  'the failed category leaves its due row untouched for retry'
);

select * from finish();

rollback;
