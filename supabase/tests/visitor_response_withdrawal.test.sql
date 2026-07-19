begin;

select no_plan();

select has_function(
  'public',
  'withdraw_response',
  array['bytea'],
  'visitor withdrawal RPC has the exact signature'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.withdraw_response(bytea)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.withdraw_response(bytea)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.withdraw_response(bytea)',
    'EXECUTE'
  ),
  'only the service boundary can execute visitor withdrawal'
);
select ok(
  not has_table_privilege('service_role', 'public.visitor_responses', 'SELECT')
  and not has_table_privilege('service_role', 'public.visitor_answers', 'DELETE')
  and not has_table_privilege('service_role', 'public.analytics_events', 'UPDATE'),
  'service role cannot bypass the withdrawal RPC with direct table access'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id, pack_version_id, management_secret_hash, management_expires_at,
  last_active_at, status, current_position, completed_at
) select
  '26000000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  decode(repeat('10', 32), 'hex'), value + interval '7 days', value,
  'draft', 10, null
from fixed_time;

insert into public.self_answers (
  pack_play_id, pack_version_id, card_id, choice
)
select
  '26000000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  card.id,
  'a'
from public.pack_cards as card
where card.pack_version_id = '15151515-1515-4515-8515-151515151515';

update public.pack_plays
set status = 'completed',
    completed_at = clock_timestamp()
where id = '26000000-0000-4000-8000-000000000001';

insert into public.share_links (
  id, public_id, pack_play_id, kind, secret_hash, status
) values (
  '26100000-0000-4000-8000-000000000001',
  'MMMMMMMMMMMMMMMMMMMMMA',
  '26000000-0000-4000-8000-000000000001',
  'public', decode(repeat('11', 32), 'hex'), 'active'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) select
  '26200000-0000-4000-8000-000000000001',
  '26100000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  'old_friend', 'ten_years_or_more', 'submitted',
  decode(repeat('21', 32), 'hex'), value + interval '24 hours',
  decode(repeat('41', 32), 'hex'), value, value
from fixed_time;

insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
)
select
  '26200000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  ranked.id,
  'required',
  ranked.position::smallint
from (
  select card.id, row_number() over (order by card.position) as position
  from public.pack_cards as card
  where card.pack_version_id = '15151515-1515-4515-8515-151515151515'
  order by card.position
  limit 3
) as ranked;

insert into public.visitor_answers (
  response_id, pack_version_id, card_id, choice
)
select response_id, pack_version_id, card_id, 'a'
from public.visitor_assignments
where response_id = '26200000-0000-4000-8000-000000000001';

insert into public.analytics_events (
  event_name, owner_play_id, share_link_id, visitor_response_id, properties
) values
  (
    'visitor_required_submitted', null, null,
    '26200000-0000-4000-8000-000000000001',
    '{"packVersion":"old-friend-v1","linkKind":"public"}'::jsonb
  ),
  (
    'pack_opened', '26000000-0000-4000-8000-000000000001', null,
    '26200000-0000-4000-8000-000000000001',
    '{"packVersion":"old-friend-v1","entrySource":"same_pack_cta"}'::jsonb
  ),
  (
    'relationship_selected', null,
    '26100000-0000-4000-8000-000000000001',
    '26200000-0000-4000-8000-000000000001',
    '{"packVersion":"old-friend-v1","linkKind":"public"}'::jsonb
  );

create temporary table withdrawal_event_snapshot
on commit drop
as
select id, event_name, occurred_at
from public.analytics_events
where visitor_response_id = '26200000-0000-4000-8000-000000000001';

set local role service_role;

select is(
  public.get_owner_profile(
    '26000000-0000-4000-8000-000000000001',
    decode(repeat('10', 32), 'hex')
  )#>>'{profile,sightCount}',
  '1',
  'submitted public response contributes one profile sight before withdrawal'
);

reset role;

select is(
  (
    select subjects
    from private.core_funnel_stage_counts
    where funnel = 'visitor_same_pack'
      and stage = 'visitor_required_submitted'
  ),
  1::bigint,
  'submitted response contributes one visitor funnel subject before withdrawal'
);

set local role service_role;

select is(
  public.withdraw_response(decode(repeat('41', 32), 'hex'))->>'outcome',
  'withdrawn',
  'the first valid management capability withdraws the response'
);

select is(
  public.withdraw_response(decode(repeat('41', 32), 'hex'))->>'outcome',
  'unavailable',
  'a sequential replay reveals no response state'
);

select is(
  public.withdraw_response(decode(repeat('ff', 32), 'hex'))->>'outcome',
  'unavailable',
  'a wrong capability converges on the same unavailable outcome'
);

select is(
  public.get_visitor_response(
    '26200000-0000-4000-8000-000000000001',
    decode(repeat('21', 32), 'hex')
  )->>'outcome',
  'session_invalid',
  'the old response session cannot read a withdrawn response'
);

reset role;

select is(
  (
    select count(*)
    from public.visitor_answers
    where response_id = '26200000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'visitor answers are physically deleted'
);
select is(
  (
    select count(*)
    from public.visitor_assignments
    where response_id = '26200000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'visitor assignments are physically deleted'
);
select is(
  (
    select jsonb_build_object(
      'status', status,
      'shareLinkId', share_link_id,
      'submitted', submitted_at is not null,
      'withdrawn', withdrawn_at is not null,
      'privateFields', num_nonnulls(
        pack_version_id, relationship_code, known_since_code,
        session_token_hash, session_expires_at, management_token_hash,
        created_at
      )
    )
    from public.visitor_responses
    where id = '26200000-0000-4000-8000-000000000001'
  ),
  jsonb_build_object(
    'status', 'withdrawn',
    'shareLinkId', '26100000-0000-4000-8000-000000000001'::uuid,
    'submitted', true,
    'withdrawn', true,
    'privateFields', 0
  ),
  'withdrawn response retains only the replay tombstone contract'
);
select is(
  (
    select count(*)
    from withdrawal_event_snapshot as snapshot
    join public.analytics_events as event using (id, event_name, occurred_at)
    where event.owner_play_id is null
      and event.share_link_id is null
      and event.visitor_response_id is null
      and event.properties = '{}'::jsonb
  ),
  (select count(*) from withdrawal_event_snapshot),
  'linked analytics retain only immutable event identity and time'
);
select is(
  (
    select count(*)
    from public.analytics_events
    where event_name = 'response_withdrawn'
      and owner_play_id is null
      and share_link_id is null
      and visitor_response_id is null
      and properties = '{}'::jsonb
  ),
  1::bigint,
  'withdrawal emits one subjectless counter event'
);

set local role service_role;

select is(
  public.get_owner_profile(
    '26000000-0000-4000-8000-000000000001',
    decode(repeat('10', 32), 'hex')
  )#>>'{profile,sightCount}',
  '0',
  'withdrawal immediately removes the profile sight'
);

reset role;

select is(
  (
    select subjects
    from private.core_funnel_stage_counts
    where funnel = 'visitor_same_pack'
      and stage = 'visitor_required_submitted'
  ),
  0::bigint,
  'withdrawal immediately removes the visitor funnel subject'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id, pack_version_id, management_secret_hash, management_expires_at,
  last_active_at, status, current_position, completed_at
) select
  '26000000-0000-4000-8000-000000000002',
  '15151515-1515-4515-8515-151515151515',
  decode(repeat('12', 32), 'hex'), value + interval '7 days', value,
  'completed', 10, value
from fixed_time;

insert into public.share_links (
  id, public_id, pack_play_id, kind, secret_hash, status
) values (
  '26100000-0000-4000-8000-000000000002',
  'NNNNNNNNNNNNNNNNNNNNNA',
  '26000000-0000-4000-8000-000000000002',
  'one_to_one', decode(repeat('13', 32), 'hex'), 'active'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) select
  '26200000-0000-4000-8000-000000000002',
  '26100000-0000-4000-8000-000000000002',
  '15151515-1515-4515-8515-151515151515',
  'coworker', 'one_to_three_years', 'submitted',
  decode(repeat('22', 32), 'hex'), value + interval '24 hours',
  decode(repeat('42', 32), 'hex'), value, value
from fixed_time;

update public.share_links
set status = 'disabled',
    consumed_response_id = '26200000-0000-4000-8000-000000000002',
    consumed_at = clock_timestamp()
where id = '26100000-0000-4000-8000-000000000002';

set local role service_role;

select is(
  public.withdraw_response(decode(repeat('42', 32), 'hex'))->>'outcome',
  'withdrawn',
  'a consumed one-to-one response can be withdrawn'
);

reset role;

select is(
  (
    select jsonb_build_object(
      'status', status,
      'consumedAt', consumed_at is not null,
      'response', consumed_response_id
    )
    from public.share_links
    where id = '26100000-0000-4000-8000-000000000002'
  ),
  jsonb_build_object(
    'status', 'disabled',
    'consumedAt', true,
    'response', '26200000-0000-4000-8000-000000000002'::uuid
  ),
  'one-to-one link keeps its disabled consumed binding after withdrawal'
);

set local role service_role;

select is(
  public.start_required_response(
    'NNNNNNNNNNNNNNNNNNNNNA', decode(repeat('13', 32), 'hex'), 'start',
    null, null,
    '26200000-0000-4000-8000-000000000004', decode(repeat('24', 32), 'hex'),
    'coworker', 'one_to_three_years', decode(repeat('34', 32), 'hex')
  )->>'outcome',
  'unavailable',
  'the consumed source URL remains unavailable after withdrawal'
);

reset role;

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) select
  '26200000-0000-4000-8000-000000000003',
  '26100000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  'family', 'five_to_ten_years', 'submitted',
  decode(repeat('23', 32), 'hex'), value + interval '24 hours',
  decode(repeat('43', 32), 'hex'), value, value
from fixed_time;

insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
)
select
  '26200000-0000-4000-8000-000000000003',
  '15151515-1515-4515-8515-151515151515',
  ranked.id,
  'required',
  ranked.position::smallint
from (
  select card.id, row_number() over (order by card.position) as position
  from public.pack_cards as card
  where card.pack_version_id = '15151515-1515-4515-8515-151515151515'
  order by card.position
  limit 3
) as ranked;

insert into public.visitor_answers (
  response_id, pack_version_id, card_id, choice
)
select response_id, pack_version_id, card_id, 'b'
from public.visitor_assignments
where response_id = '26200000-0000-4000-8000-000000000003';

insert into public.analytics_events (
  event_name, visitor_response_id, properties
) values (
  'visitor_required_submitted',
  '26200000-0000-4000-8000-000000000003',
  '{"packVersion":"old-friend-v1","linkKind":"public"}'::jsonb
);

create function private.force_withdrawal_failure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.event_name = 'response_withdrawn' then
    raise exception 'forced withdrawal failure';
  end if;
  return new;
end
$function$;

create trigger force_withdrawal_failure
before insert on public.analytics_events
for each row execute function private.force_withdrawal_failure();

set local role service_role;

select throws_ok(
  $$select public.withdraw_response(decode(repeat('43', 32), 'hex'))$$,
  'P0001',
  'forced withdrawal failure',
  'an analytics failure aborts the whole withdrawal statement'
);

reset role;

drop trigger force_withdrawal_failure on public.analytics_events;
drop function private.force_withdrawal_failure();

select is(
  (
    select status
    from public.visitor_responses
    where id = '26200000-0000-4000-8000-000000000003'
  ),
  'submitted',
  'failed withdrawal rolls the response state back'
);
select is(
  (
    select count(*)
    from public.visitor_answers
    where response_id = '26200000-0000-4000-8000-000000000003'
  ),
  3::bigint,
  'failed withdrawal rolls physical answer deletion back'
);
select is(
  (
    select count(*)
    from public.analytics_events
    where visitor_response_id = '26200000-0000-4000-8000-000000000003'
      and properties <> '{}'::jsonb
  ),
  1::bigint,
  'failed withdrawal rolls analytics scrubbing back'
);

select * from finish();

rollback;
