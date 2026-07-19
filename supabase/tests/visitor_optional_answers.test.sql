begin;

select no_plan();

select has_function(
  'public',
  'assign_optional_cards',
  array['uuid', 'bytea'],
  'optional assignment RPC has the exact signature'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.assign_optional_cards(uuid,bytea)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.assign_optional_cards(uuid,bytea)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.assign_optional_cards(uuid,bytea)',
    'EXECUTE'
  ),
  'only the service boundary can execute optional assignment RPC'
);
select ok(
  pg_get_functiondef('public.assign_optional_cards(uuid,bytea)'::regprocedure)
    like '%prior_link.pack_play_id = v_pack_play_id%',
  'optional sample counts are isolated to the current owner play'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id,
  pack_version_id,
  management_secret_hash,
  management_expires_at,
  last_active_at,
  status,
  current_position
) select
  '25000000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  decode(repeat('10', 32), 'hex'),
  value + interval '7 days',
  value,
  'draft',
  10
from fixed_time;

insert into public.self_answers (
  pack_play_id,
  pack_version_id,
  card_id,
  choice
)
select
  '25000000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  card.id,
  'a'
from public.pack_cards as card
where card.pack_version_id = '15151515-1515-4515-8515-151515151515';

update public.pack_plays
set status = 'completed',
    completed_at = clock_timestamp()
where id = '25000000-0000-4000-8000-000000000001';

insert into public.share_links (
  id,
  public_id,
  pack_play_id,
  kind,
  secret_hash,
  status
) values (
  '25100000-0000-4000-8000-000000000001',
  'KKKKKKKKKKKKKKKKKKKKKA',
  '25000000-0000-4000-8000-000000000001',
  'public',
  decode(repeat('11', 32), 'hex'),
  'active'
);

select is(
  public.start_required_response(
    'KKKKKKKKKKKKKKKKKKKKKA', decode(repeat('11', 32), 'hex'), 'start',
    null, null,
    '25200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    'old_friend', 'ten_years_or_more', decode(repeat('31', 32), 'hex')
  )->>'outcome',
  'created',
  'required response starts before optional branch'
);

select is(
  public.assign_optional_cards(
    '25200000-0000-4000-8000-000000000001',
    decode(repeat('21', 32), 'hex')
  )->>'outcome',
  'not_submitted',
  'draft response cannot assign optional cards'
);

select public.save_response_answer(
  '25200000-0000-4000-8000-000000000001',
  decode(repeat('21', 32), 'hex'),
  assignment.card_id,
  'a'
)
from public.visitor_assignments as assignment
where assignment.response_id = '25200000-0000-4000-8000-000000000001'
  and assignment.stage = 'required'
order by assignment.position;

select is(
  public.submit_response(
    '25200000-0000-4000-8000-000000000001',
    decode(repeat('21', 32), 'hex'),
    decode(repeat('41', 32), 'hex')
  )->>'outcome',
  'submitted',
  'required response submits before optional assignment'
);

create temporary table expected_optional_cards (
  card_id text primary key,
  position smallint not null unique
) on commit drop;

insert into expected_optional_cards (card_id, position)
select ranked.id, ranked.selection_position::smallint
from (
  select
    card.id,
    row_number() over (
      order by
        pg_catalog.sha256(
          convert_to('gyeop-optional-assignment-v1', 'UTF8')
          || decode('00', 'hex')
          || convert_to('25200000-0000-4000-8000-000000000001', 'UTF8')
          || decode('00', 'hex')
          || convert_to(card.id, 'UTF8')
        ),
        card.position,
        card.id
    ) as selection_position
  from public.pack_cards as card
  where card.pack_version_id = '15151515-1515-4515-8515-151515151515'
    and not exists (
      select 1
      from public.visitor_assignments as assignment
      where assignment.response_id = '25200000-0000-4000-8000-000000000001'
        and assignment.card_id = card.id
    )
) as ranked
where ranked.selection_position <= 3;

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
  '25000000-0000-4000-8000-000000000002',
  '15151515-1515-4515-8515-151515151515',
  decode(repeat('12', 32), 'hex'),
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
) values (
  '25100000-0000-4000-8000-000000000002',
  'LLLLLLLLLLLLLLLLLLLLLA',
  '25000000-0000-4000-8000-000000000002',
  'public',
  decode(repeat('13', 32), 'hex'),
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
  submitted_at
) select
  '25200000-0000-4000-8000-000000000002',
  '25100000-0000-4000-8000-000000000002',
  '15151515-1515-4515-8515-151515151515',
  'coworker',
  'one_to_three_years',
  'submitted',
  decode(repeat('22', 32), 'hex'),
  value + interval '24 hours',
  decode(repeat('42', 32), 'hex'),
  value,
  value
from fixed_time;

insert into public.visitor_assignments (
  response_id,
  pack_version_id,
  card_id,
  stage,
  position
)
select
  '25200000-0000-4000-8000-000000000002',
  '15151515-1515-4515-8515-151515151515',
  expected.card_id,
  'required',
  expected.position
from expected_optional_cards as expected;

select is(
  public.assign_optional_cards(
    '25200000-0000-4000-8000-000000000001',
    decode(repeat('ff', 32), 'hex')
  )->>'outcome',
  'session_invalid',
  'cross-session optional assignment is unavailable'
);

select is(
  public.assign_optional_cards(
    '25200000-0000-4000-8000-000000000001',
    decode(repeat('21', 32), 'hex')
  )->>'outcome',
  'assigned',
  'submitted response receives optional assignments'
);

select is(
  public.record_visitor_response_event(
    '25200000-0000-4000-8000-000000000001',
    decode(repeat('21', 32), 'hex'),
    'comparison_viewed'
  )->>'outcome',
  'recorded',
  'late comparison event still records after the optional start request'
);

select is(
  (
    select array_agg(assignment.card_id order by assignment.position)
    from public.visitor_assignments as assignment
    where assignment.response_id = '25200000-0000-4000-8000-000000000001'
      and assignment.stage = 'optional'
  ),
  (
    select array_agg(expected.card_id order by expected.position)
    from expected_optional_cards as expected
    where expected.position <= 2
  ),
  'another owner play sample history cannot change optional selection'
);

select is(
  (
    select jsonb_build_object(
      'total', count(*),
      'required', count(*) filter (where assignment.stage = 'required'),
      'optional', count(*) filter (where assignment.stage = 'optional'),
      'cards', count(distinct assignment.card_id),
      'optionalPositions', array_agg(assignment.position order by assignment.position)
        filter (where assignment.stage = 'optional')
    )
    from public.visitor_assignments as assignment
    where assignment.response_id = '25200000-0000-4000-8000-000000000001'
  ),
  jsonb_build_object(
    'total', 5,
    'required', 3,
    'optional', 2,
    'cards', 5,
    'optionalPositions', array[1, 2]::smallint[]
  ),
  'optional assignments are exactly two distinct cards after the required three'
);

select ok(
  (
    select bool_and(
      item->'visitorChoice' = 'null'::jsonb
      and item->'ownerChoice' = 'null'::jsonb
      and item->'matches' = 'null'::jsonb
      and item->>'isHighlight' = 'false'
    )
    from jsonb_array_elements(
      public.get_visitor_response(
        '25200000-0000-4000-8000-000000000001',
        decode(repeat('21', 32), 'hex')
      )->'response'->'assignments'
    ) as state(item)
    where item->>'stage' = 'optional'
  ),
  'unanswered optional cards reveal no owner choice or comparison'
);

select is(
  public.assign_optional_cards(
    '25200000-0000-4000-8000-000000000001',
    decode(repeat('21', 32), 'hex')
  )->>'outcome',
  'assigned',
  'duplicate optional assignment is idempotent'
);
select is(
  (
    select count(*)
    from public.analytics_events
    where visitor_response_id = '25200000-0000-4000-8000-000000000001'
      and event_name = 'optional_answers_started'
  ),
  1::bigint,
  'optional start event records once'
);

select is(
  public.save_response_answer(
    '25200000-0000-4000-8000-000000000001',
    decode(repeat('21', 32), 'hex'),
    assignment.card_id,
    'b'
  )->>'outcome',
  'saved',
  'first optional answer saves on a submitted response'
)
from public.visitor_assignments as assignment
where assignment.response_id = '25200000-0000-4000-8000-000000000001'
  and assignment.stage = 'optional'
  and assignment.position = 1;

select is(
  (
    select count(*)
    from public.analytics_events
    where visitor_response_id = '25200000-0000-4000-8000-000000000001'
      and event_name = 'optional_answers_completed'
  ),
  0::bigint,
  'one optional answer does not complete the branch'
);

select ok(
  (
    select item->>'ownerChoice' = 'a'
      and item->>'visitorChoice' = 'b'
      and item->>'matches' = 'false'
    from jsonb_array_elements(
      public.get_visitor_response(
        '25200000-0000-4000-8000-000000000001',
        decode(repeat('21', 32), 'hex')
      )->'response'->'assignments'
    ) as state(item)
    where item->>'stage' = 'optional'
      and item->>'position' = '1'
  ),
  'saved optional card reveals only its own comparison'
);

select is(
  public.save_response_answer(
    '25200000-0000-4000-8000-000000000001',
    decode(repeat('21', 32), 'hex'),
    assignment.card_id,
    'a'
  )->>'outcome',
  'saved',
  'second optional answer saves'
)
from public.visitor_assignments as assignment
where assignment.response_id = '25200000-0000-4000-8000-000000000001'
  and assignment.stage = 'optional'
  and assignment.position = 2;

select is(
  (
    select count(*)
    from public.analytics_events
    where visitor_response_id = '25200000-0000-4000-8000-000000000001'
      and event_name = 'optional_answers_completed'
      and properties = jsonb_build_object(
        'packVersion', 'old-friend-v1',
        'linkKind', 'public'
      )
  ),
  1::bigint,
  'optional completion records once with the exact safe payload'
);

select public.save_response_answer(
  '25200000-0000-4000-8000-000000000001',
  decode(repeat('21', 32), 'hex'),
  assignment.card_id,
  'b'
)
from public.visitor_assignments as assignment
where assignment.response_id = '25200000-0000-4000-8000-000000000001'
  and assignment.stage = 'optional'
  and assignment.position = 2;

select is(
  (
    select count(*)
    from public.analytics_events
    where visitor_response_id = '25200000-0000-4000-8000-000000000001'
      and event_name = 'optional_answers_completed'
  ),
  1::bigint,
  'optional completion update does not duplicate the event'
);

select is(
  (
    select sum((card->>'sampleCount')::integer)
    from jsonb_array_elements(
      public.get_owner_profile(
        '25000000-0000-4000-8000-000000000001',
        decode(repeat('10', 32), 'hex')
      )->'profile'->'cards'
    ) as profile(card)
  ),
  5::bigint,
  'public profile samples include three required and two optional answers'
);
select is(
  public.get_owner_profile(
    '25000000-0000-4000-8000-000000000001',
    decode(repeat('10', 32), 'hex')
  )->'profile'->>'sightCount',
  '1',
  'optional answers do not increase sight count'
);

select is(
  (
    select subjects
    from private.core_funnel_stage_counts
    where funnel = 'visitor_optional'
      and stage = 'optional_answers_started'
  ),
  1::bigint,
  'optional funnel counts the started subject'
);
select is(
  (
    select subjects
    from private.core_funnel_stage_counts
    where funnel = 'visitor_optional'
      and stage = 'optional_answers_completed'
  ),
  1::bigint,
  'optional funnel counts the completed subject'
);

select * from finish();

rollback;
