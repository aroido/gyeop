begin;

select no_plan();

select has_table(
  'public',
  'visitor_assignments',
  'visitor assignment table exists'
);
select has_function(
  'private',
  'assign_required_response_cards',
  array['uuid', 'uuid', 'uuid'],
  'required assignment helper has the exact signature'
);
select ok(
  not has_table_privilege('service_role', 'public.visitor_assignments', 'SELECT')
  and not has_table_privilege('service_role', 'public.visitor_assignments', 'INSERT')
  and not has_table_privilege('anon', 'public.visitor_assignments', 'SELECT')
  and not has_table_privilege('authenticated', 'public.visitor_assignments', 'SELECT'),
  'API roles have no direct visitor assignment access'
);
select ok(
  has_table_privilege('gyeop_internal_rpc', 'public.visitor_assignments', 'SELECT')
  and has_table_privilege('gyeop_internal_rpc', 'public.visitor_assignments', 'INSERT')
  and not has_table_privilege('gyeop_internal_rpc', 'public.visitor_assignments', 'UPDATE')
  and not has_table_privilege('gyeop_internal_rpc', 'public.visitor_assignments', 'DELETE'),
  'internal role has the exact visitor assignment table allowlist'
);
select ok(
  not has_function_privilege(
    'service_role',
    'private.assign_required_response_cards(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'private.assign_required_response_cards(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'gyeop_internal_rpc',
    'private.assign_required_response_cards(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'only the internal RPC role executes the private assignment helper'
);
select is(
  (
    select array_agg(policyname order by policyname)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'visitor_assignments'
  ),
  array[
    'visitor_assignments_internal_insert',
    'visitor_assignments_internal_select'
  ]::name[],
  'visitor assignment RLS policy inventory is exact'
);
select is(
  (
    select array_agg(constraint_name::text order by constraint_name)
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'visitor_assignments'
      and constraint_type in ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
  ),
  array[
    'visitor_assignments_pack_version_id_card_id_fkey',
    'visitor_assignments_pkey',
    'visitor_assignments_response_id_pack_version_id_fkey',
    'visitor_assignments_response_id_stage_position_key',
    'visitor_assignments_response_pack_card_key'
  ]::text[],
  'assignment identity and composite FK inventory is exact'
);
select ok(
  exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'visitor_responses'
      and constraint_name = 'visitor_responses_id_pack_version_key'
      and constraint_type = 'UNIQUE'
  ),
  'visitor response exposes the named composite parent key'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id,
  pack_version_id,
  management_secret_hash,
  management_expires_at,
  last_active_at,
  status,
  current_position,
  completed_at
) select
  '23000000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  decode(repeat('50', 32), 'hex'),
  value + interval '7 days',
  value,
  'completed',
  10,
  value
from fixed_time;

insert into public.share_links (
  id,
  public_id,
  pack_play_id,
  kind,
  secret_hash,
  status
) values
  (
    '23100000-0000-4000-8000-000000000001',
    'CCCCCCCCCCCCCCCCCCCCCA',
    '23000000-0000-4000-8000-000000000001',
    'public',
    decode(repeat('51', 32), 'hex'),
    'active'
  ),
  (
    '23100000-0000-4000-8000-000000000002',
    'DDDDDDDDDDDDDDDDDDDDDQ',
    '23000000-0000-4000-8000-000000000001',
    'one_to_one',
    decode(repeat('52', 32), 'hex'),
    'active'
  ),
  (
    '23100000-0000-4000-8000-000000000003',
    'EEEEEEEEEEEEEEEEEEEEEA',
    '23000000-0000-4000-8000-000000000001',
    'public',
    decode(repeat('53', 32), 'hex'),
    'disabled'
  );

select is(
  public.start_response(
    'CCCCCCCCCCCCCCCCCCCCCA', decode(repeat('51', 32), 'hex'), 'start',
    null, null,
    '23200000-0000-4000-8000-000000000001',
    decode(repeat('54', 32), 'hex'),
    'old_friend', 'ten_years_or_more', decode(repeat('55', 32), 'hex')
  )->>'outcome',
  'created',
  'public response and required assignments are created together'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_object(
        'cardId', assignment.card_id,
        'position', assignment.position,
        'signature', card.is_signature
      ) order by assignment.position
    )
    from public.visitor_assignments as assignment
    join public.pack_cards as card
      on card.pack_version_id = assignment.pack_version_id
      and card.id = assignment.card_id
    where assignment.response_id = '23200000-0000-4000-8000-000000000001'
  ),
  jsonb_build_array(
    jsonb_build_object('cardId', 'conflict', 'position', 1, 'signature', true),
    jsonb_build_object('cardId', 'hard-day', 'position', 2, 'signature', false),
    jsonb_build_object('cardId', 'plans', 'position', 3, 'signature', false)
  ),
  'fixed response UUID has the reviewed hash vector and Signature first'
);
select is(
  jsonb_array_length(
    public.start_response(
      'CCCCCCCCCCCCCCCCCCCCCA', decode(repeat('51', 32), 'hex'), 'start',
      '23200000-0000-4000-8000-000000000001', decode(repeat('54', 32), 'hex'),
      '23200000-0000-4000-8000-000000000002', decode(repeat('56', 32), 'hex'),
      'family', 'under_one_year', decode(repeat('55', 32), 'hex')
    )->'response'->'assignments'
  ),
  3,
  'duplicate start returns the stored three assignments'
);
select is(
  (
    select jsonb_build_object(
      'responses', count(distinct response.id),
      'assignments', count(distinct assignment.card_id),
      'quota', max(bucket.count),
      'events', count(distinct event.id)
    )
    from public.visitor_responses as response
    left join public.visitor_assignments as assignment
      on assignment.response_id = response.id
    left join public.analytics_events as event
      on event.visitor_response_id = response.id
    left join public.rate_limit_buckets as bucket
      on bucket.key_hash = decode(repeat('55', 32), 'hex')
      and bucket.action = 'response_start'
    where response.id = '23200000-0000-4000-8000-000000000001'
  ),
  jsonb_build_object('responses', 1, 'assignments', 3, 'quota', 1, 'events', 2),
  'duplicate start changes no response, quota, assignment, or event row'
);

select is(
  public.start_response(
    'DDDDDDDDDDDDDDDDDDDDDQ', decode(repeat('52', 32), 'hex'), 'start',
    null, null,
    '23200000-0000-4000-8000-000000000002',
    decode(repeat('56', 32), 'hex'),
    'online_friend', 'not_sure', decode(repeat('57', 32), 'hex')
  )->>'outcome',
  'created',
  'active one-to-one link starts a response with assignments'
);
select is(
  (
    select jsonb_build_object(
      'assignments', count(*),
      'signature', count(*) filter (where card.is_signature),
      'linkKind', max(event.properties->>'linkKind')
    )
    from public.visitor_assignments as assignment
    join public.pack_cards as card
      on card.pack_version_id = assignment.pack_version_id
      and card.id = assignment.card_id
    join public.analytics_events as event
      on event.visitor_response_id = assignment.response_id
      and event.event_name = 'visitor_response_started'
    where assignment.response_id = '23200000-0000-4000-8000-000000000002'
  ),
  jsonb_build_object('assignments', 3, 'signature', 1, 'linkKind', 'one_to_one'),
  'one-to-one response has three cards and exact analytics kind'
);
select is(
  public.start_response(
    'DDDDDDDDDDDDDDDDDDDDDQ', decode(repeat('52', 32), 'hex'), 'resume',
    '23200000-0000-4000-8000-000000000002', decode(repeat('56', 32), 'hex'),
    null, null, null, null, decode(repeat('57', 32), 'hex')
  )->>'outcome',
  'resumed',
  'one-to-one response resumes through the same stored assignment contract'
);
select is(
  public.start_response(
    'EEEEEEEEEEEEEEEEEEEEEA', decode(repeat('53', 32), 'hex'), 'start',
    null, null,
    '23200000-0000-4000-8000-000000000003',
    decode(repeat('58', 32), 'hex'),
    'other', 'not_sure', decode(repeat('59', 32), 'hex')
  )->>'outcome',
  'unavailable',
  'disabled link cannot start assignments'
);

alter table public.visitor_responses
  drop constraint visitor_responses_status_check;

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
  submitted_at,
  created_at
)
with fixed_time as (
  select clock_timestamp() - interval '48 hours' as created_at
)
select
  ('23300000-0000-4000-8000-' || lpad(series.value::text, 12, '0'))::uuid,
  '23100000-0000-4000-8000-000000000003',
  '15151515-1515-4515-8515-151515151515',
  'old_friend',
  'ten_years_or_more',
  'submitted',
  decode(lpad(to_hex(series.value + 96), 2, '0') || repeat('00', 31), 'hex'),
  fixed_time.created_at + interval '24 hours',
  decode(lpad(to_hex(series.value + 112), 2, '0') || repeat('00', 31), 'hex'),
  fixed_time.created_at + interval '12 hours',
  fixed_time.created_at
from generate_series(1, 4) as series(value)
cross join fixed_time;

insert into public.visitor_assignments (
  response_id,
  pack_version_id,
  card_id,
  stage,
  position
) values
  ('23300000-0000-4000-8000-000000000001', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('23300000-0000-4000-8000-000000000001', '15151515-1515-4515-8515-151515151515', 'plans', 'required', 2),
  ('23300000-0000-4000-8000-000000000001', '15151515-1515-4515-8515-151515151515', 'comfort', 'required', 3),
  ('23300000-0000-4000-8000-000000000002', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('23300000-0000-4000-8000-000000000002', '15151515-1515-4515-8515-151515151515', 'gathering', 'required', 2),
  ('23300000-0000-4000-8000-000000000002', '15151515-1515-4515-8515-151515151515', 'reconnect', 'required', 3),
  ('23300000-0000-4000-8000-000000000003', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('23300000-0000-4000-8000-000000000003', '15151515-1515-4515-8515-151515151515', 'memory', 'required', 2),
  ('23300000-0000-4000-8000-000000000003', '15151515-1515-4515-8515-151515151515', 'travel', 'required', 3),
  ('23300000-0000-4000-8000-000000000004', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('23300000-0000-4000-8000-000000000004', '15151515-1515-4515-8515-151515151515', 'celebration', 'required', 2),
  ('23300000-0000-4000-8000-000000000004', '15151515-1515-4515-8515-151515151515', 'hard-day', 'required', 3);

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id,
  pack_version_id,
  management_secret_hash,
  management_expires_at,
  last_active_at,
  status,
  current_position,
  completed_at
) select
  '23000000-0000-4000-8000-000000000002',
  '15151515-1515-4515-8515-151515151515',
  decode(repeat('70', 32), 'hex'),
  value + interval '7 days',
  value,
  'completed',
  10,
  value
from fixed_time;

insert into public.share_links (
  id, public_id, pack_play_id, kind, secret_hash
) values (
  '23100000-0000-4000-8000-000000000004',
  'FFFFFFFFFFFFFFFFFFFFFQ',
  '23000000-0000-4000-8000-000000000002',
  'public',
  decode(repeat('71', 32), 'hex')
);
with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  submitted_at, created_at
) select
  '23300000-0000-4000-8000-000000000005',
  '23100000-0000-4000-8000-000000000004',
  '15151515-1515-4515-8515-151515151515',
  'other', 'not_sure', 'submitted', decode(repeat('72', 32), 'hex'),
  value + interval '24 hours', decode(repeat('74', 32), 'hex'), value, value
from fixed_time;
insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
) values
  ('23300000-0000-4000-8000-000000000005', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('23300000-0000-4000-8000-000000000005', '15151515-1515-4515-8515-151515151515', 'reunion', 'required', 2),
  ('23300000-0000-4000-8000-000000000005', '15151515-1515-4515-8515-151515151515', 'plans', 'required', 3);

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, created_at
) select
  '23300000-0000-4000-8000-000000000006',
  '23100000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  'family', 'not_sure', 'draft', decode(repeat('73', 32), 'hex'),
  value + interval '24 hours', value
from fixed_time;
insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
) values
  ('23300000-0000-4000-8000-000000000006', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('23300000-0000-4000-8000-000000000006', '15151515-1515-4515-8515-151515151515', 'reunion', 'required', 2),
  ('23300000-0000-4000-8000-000000000006', '15151515-1515-4515-8515-151515151515', 'plans', 'required', 3);

select is(
  public.start_response(
    'CCCCCCCCCCCCCCCCCCCCCA', decode(repeat('51', 32), 'hex'), 'start',
    null, null,
    '23200000-0000-4000-8000-000000000010',
    decode(repeat('74', 32), 'hex'),
    'school_friend', 'one_to_three_years', decode(repeat('75', 32), 'hex')
  )->>'outcome',
  'created',
  'skewed submitted samples create a response'
);
select is(
  (
    select jsonb_agg(assignment.card_id order by assignment.position)
    from public.visitor_assignments as assignment
    where assignment.response_id = '23200000-0000-4000-8000-000000000010'
  ),
  jsonb_build_array('conflict', 'reunion', 'plans'),
  'singleton minimum is selected first then the next hash-ranked minimum'
);

insert into public.pack_templates (
  id, slug, title, target_relationship, sensitivity
) values (
  '23400000-0000-4000-8000-000000000001',
  'assignment-fixture',
  'Assignment fixture',
  'old_friend',
  'low'
);
insert into public.pack_versions (id, template_id, version)
values (
  '23410000-0000-4000-8000-000000000001',
  '23400000-0000-4000-8000-000000000001',
  'assignment-fixture-v1'
);
insert into public.pack_cards (
  pack_version_id, id, position, owner_prompt, visitor_prompt,
  option_a, option_b, is_signature
) values (
  '23410000-0000-4000-8000-000000000001',
  'foreign-card',
  1,
  'Owner fixture',
  'Visitor fixture',
  'A',
  'B',
  true
);

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, created_at
) select
  '23500000-0000-4000-8000-000000000001',
  '23100000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  'other', 'not_sure', 'draft', decode(repeat('78', 32), 'hex'),
  value + interval '24 hours', value
from fixed_time;

select throws_ok(
  $$
    insert into public.visitor_assignments (
      response_id, pack_version_id, card_id, stage, position
    ) values (
      '23500000-0000-4000-8000-000000000001',
      '23410000-0000-4000-8000-000000000001',
      'foreign-card',
      'required',
      1
    )
  $$,
  '23503',
  null,
  'response and card from different pack versions are rejected'
);

create unique index visitor_assignments_forced_unique_test
  on public.visitor_assignments (response_id)
  where response_id = '23200000-0000-4000-8000-000000000020';

select throws_ok(
  $$
    select public.start_response(
      'CCCCCCCCCCCCCCCCCCCCCA', decode(repeat('51', 32), 'hex'), 'start',
      null, null,
      '23200000-0000-4000-8000-000000000020',
      decode(repeat('76', 32), 'hex'),
      'coworker', 'three_to_five_years', decode(repeat('77', 32), 'hex')
    )
  $$,
  '23505',
  null,
  'assignment unique failure is not misclassified as credential collision'
);
select is(
  (
    select jsonb_build_object(
      'responses', (
        select count(*)
        from public.visitor_responses
        where id = '23200000-0000-4000-8000-000000000020'
      ),
      'assignments', (
        select count(*)
        from public.visitor_assignments
        where response_id = '23200000-0000-4000-8000-000000000020'
      ),
      'buckets', (
        select count(*)
        from public.rate_limit_buckets
        where key_hash = decode(repeat('77', 32), 'hex')
          and action = 'response_start'
      ),
      'events', (
        select count(*)
        from public.analytics_events
        where visitor_response_id = '23200000-0000-4000-8000-000000000020'
      )
    )
  ),
  jsonb_build_object('responses', 0, 'assignments', 0, 'buckets', 0, 'events', 0),
  'assignment failure rolls back response, assignment, quota, and events'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id, pack_version_id, management_secret_hash, management_expires_at,
  last_active_at, status, current_position, completed_at
) select
  '23600000-0000-4000-8000-000000000001',
  '23410000-0000-4000-8000-000000000001',
  decode(repeat('80', 32), 'hex'),
  value + interval '7 days',
  value,
  'completed',
  10,
  value
from fixed_time;
insert into public.share_links (
  id, public_id, pack_play_id, kind, secret_hash
) values (
  '23610000-0000-4000-8000-000000000001',
  'HHHHHHHHHHHHHHHHHHHHHA',
  '23600000-0000-4000-8000-000000000001',
  'public',
  decode(repeat('81', 32), 'hex')
);

select throws_ok(
  $$
    select public.start_response(
      'HHHHHHHHHHHHHHHHHHHHHA', decode(repeat('81', 32), 'hex'), 'start',
      null, null,
      '23620000-0000-4000-8000-000000000001',
      decode(repeat('82', 32), 'hex'),
      'other', 'not_sure', decode(repeat('83', 32), 'hex')
    )
  $$,
  'P2301',
  'required assignment invariant failed',
  'malformed pack cardinality fails closed instead of returning a typed collision'
);
select is(
  (
    select jsonb_build_object(
      'responses', count(*) filter (
        where response.id = '23620000-0000-4000-8000-000000000001'
      ),
      'assignments', (
        select count(*) from public.visitor_assignments
        where response_id = '23620000-0000-4000-8000-000000000001'
      ),
      'buckets', (
        select count(*) from public.rate_limit_buckets
        where key_hash = decode(repeat('83', 32), 'hex')
          and action = 'response_start'
      ),
      'events', (
        select count(*) from public.analytics_events
        where visitor_response_id = '23620000-0000-4000-8000-000000000001'
      )
    )
    from public.visitor_responses as response
  ),
  jsonb_build_object('responses', 0, 'assignments', 0, 'buckets', 0, 'events', 0),
  'malformed pack failure leaves no partial response, assignment, quota, or event'
);

with fixed_window as (
  select date_bin(
    interval '600 seconds',
    clock_timestamp(),
    timestamptz '1970-01-01 00:00:00+00'
  ) as value
)
insert into public.rate_limit_buckets (
  key_hash, action, window_start, count, expires_at
) select
  decode(repeat('84', 32), 'hex'),
  'response_start',
  value,
  10,
  value + interval '600 seconds'
from fixed_window;
select is(
  public.start_response(
    'CCCCCCCCCCCCCCCCCCCCCA', decode(repeat('51', 32), 'hex'), 'start',
    null, null,
    '23620000-0000-4000-8000-000000000002',
    decode(repeat('85', 32), 'hex'),
    'other', 'not_sure', decode(repeat('84', 32), 'hex')
  )->>'outcome',
  'rate_limited',
  'eleventh response start is typed rate limited'
);
select is(
  (
    select jsonb_build_object(
      'responses', (
        select count(*) from public.visitor_responses
        where id = '23620000-0000-4000-8000-000000000002'
      ),
      'assignments', (
        select count(*) from public.visitor_assignments
        where response_id = '23620000-0000-4000-8000-000000000002'
      ),
      'bucketCount', (
        select count from public.rate_limit_buckets
        where key_hash = decode(repeat('84', 32), 'hex')
          and action = 'response_start'
      ),
      'events', (
        select count(*) from public.analytics_events
        where visitor_response_id = '23620000-0000-4000-8000-000000000002'
      )
    )
  ),
  jsonb_build_object('responses', 0, 'assignments', 0, 'bucketCount', 10, 'events', 0),
  'rate limit rollback keeps bucket ten and leaves no response-side mutation'
);

select is(
  public.start_response(
    'CCCCCCCCCCCCCCCCCCCCCA', decode(repeat('51', 32), 'hex'), 'start',
    null, null,
    '23620000-0000-4000-8000-000000000003',
    decode(repeat('54', 32), 'hex'),
    'other', 'not_sure', decode(repeat('86', 32), 'hex')
  )->>'outcome',
  'collision',
  'session hash credential constraint is a typed collision'
);
select is(
  (
    select jsonb_build_object(
      'responses', (
        select count(*) from public.visitor_responses
        where id = '23620000-0000-4000-8000-000000000003'
      ),
      'buckets', (
        select count(*) from public.rate_limit_buckets
        where key_hash = decode(repeat('86', 32), 'hex')
          and action = 'response_start'
      )
    )
  ),
  jsonb_build_object('responses', 0, 'buckets', 0),
  'session hash collision rolls back the attempted response and quota'
);

alter table public.share_links
  drop constraint share_links_consumed_response_binding_fkey;
alter table public.visitor_responses
  drop constraint visitor_responses_id_share_link_key;
alter table public.visitor_responses
  drop constraint visitor_responses_id_pack_version_key cascade;
select is(
  public.start_response(
    'CCCCCCCCCCCCCCCCCCCCCA', decode(repeat('51', 32), 'hex'), 'start',
    null, null,
    '23200000-0000-4000-8000-000000000001',
    decode(repeat('87', 32), 'hex'),
    'other', 'not_sure', decode(repeat('88', 32), 'hex')
  )->>'outcome',
  'collision',
  'response primary-key credential constraint is a typed collision'
);
select is(
  (
    select count(*) from public.rate_limit_buckets
    where key_hash = decode(repeat('88', 32), 'hex')
      and action = 'response_start'
  ),
  0::bigint,
  'response primary-key collision rolls back quota'
);

alter table public.visitor_responses
  add constraint visitor_responses_id_pack_version_key
  unique (id, pack_version_id);
alter table public.visitor_assignments
  add constraint visitor_assignments_response_id_pack_version_id_fkey
  foreign key (response_id, pack_version_id)
  references public.visitor_responses (id, pack_version_id)
  on update restrict
  on delete cascade;
alter table public.visitor_responses
  drop constraint visitor_responses_pkey cascade;
select is(
  public.start_response(
    'CCCCCCCCCCCCCCCCCCCCCA', decode(repeat('51', 32), 'hex'), 'start',
    null, null,
    '23200000-0000-4000-8000-000000000001',
    decode(repeat('89', 32), 'hex'),
    'other', 'not_sure', decode(repeat('8a', 32), 'hex')
  )->>'outcome',
  'collision',
  'response composite credential constraint is a typed collision'
);
select is(
  (
    select count(*) from public.rate_limit_buckets
    where key_hash = decode(repeat('8a', 32), 'hex')
      and action = 'response_start'
  ),
  0::bigint,
  'response composite collision rolls back quota'
);

select * from finish();
rollback;
