begin;

select no_plan();

select has_function(
  'public',
  'list_owner_1to1_responses',
  array['uuid', 'bytea'],
  'owner private 1:1 list RPC has the exact signature'
);
select has_function(
  'public',
  'get_private_1to1_comparison',
  array['uuid', 'bytea', 'uuid'],
  'owner private 1:1 comparison RPC has the exact signature'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.list_owner_1to1_responses(uuid,bytea)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.get_private_1to1_comparison(uuid,bytea,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.list_owner_1to1_responses(uuid,bytea)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.get_private_1to1_comparison(uuid,bytea,uuid)',
    'EXECUTE'
  ),
  'only the service boundary can execute private 1:1 owner RPCs'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id, pack_version_id, management_secret_hash, management_expires_at,
  last_active_at, status, current_position, completed_at
) values
  (
    '28000000-0000-4000-8000-000000000001',
    '15151515-1515-4515-8515-151515151515',
    decode(repeat('a1', 32), 'hex'),
    (select value + interval '7 days' from fixed_time),
    (select value from fixed_time),
    'draft', 10, null
  ),
  (
    '28000000-0000-4000-8000-000000000002',
    '15151515-1515-4515-8515-151515151515',
    decode(repeat('a2', 32), 'hex'),
    (select value + interval '7 days' from fixed_time),
    (select value from fixed_time),
    'draft', 10, null
  );

insert into public.self_answers (
  pack_play_id, pack_version_id, card_id, choice
)
select
  play.id,
  play.pack_version_id,
  card.id,
  'a'
from public.pack_plays as play
join public.pack_cards as card
  on card.pack_version_id = play.pack_version_id
where play.id in (
  '28000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000002'
);

update public.pack_plays
set status = 'completed',
    completed_at = clock_timestamp()
where id in (
  '28000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000002'
);

insert into public.share_links (
  id, public_id, pack_play_id, kind, secret_hash, status
) values
  (
    '28100000-0000-4000-8000-000000000001',
    repeat('S', 21) || 'A',
    '28000000-0000-4000-8000-000000000001',
    'one_to_one', decode(repeat('b1', 32), 'hex'), 'active'
  ),
  (
    '28100000-0000-4000-8000-000000000002',
    repeat('T', 21) || 'A',
    '28000000-0000-4000-8000-000000000001',
    'one_to_one', decode(repeat('b2', 32), 'hex'), 'active'
  ),
  (
    '28100000-0000-4000-8000-000000000003',
    repeat('U', 21) || 'A',
    '28000000-0000-4000-8000-000000000001',
    'one_to_one', decode(repeat('b3', 32), 'hex'), 'active'
  );

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) select
  '28200000-0000-4000-8000-000000000001',
  '28100000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  'old_friend', 'ten_years_or_more', 'submitted',
  decode(repeat('c1', 32), 'hex'), value - interval '24 hours',
  decode(repeat('d1', 32), 'hex'), value - interval '48 hours',
  value - interval '2 days'
from fixed_time;

insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
)
select
  '28200000-0000-4000-8000-000000000001',
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

insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
)
select
  '28200000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  ranked.id,
  'optional',
  ranked.position::smallint
from (
  select card.id, row_number() over (order by card.position) as position
  from public.pack_cards as card
  where card.pack_version_id = '15151515-1515-4515-8515-151515151515'
    and not exists (
      select 1
      from public.visitor_assignments as required
      where required.response_id = '28200000-0000-4000-8000-000000000001'
        and required.card_id = card.id
    )
  order by card.position
  limit 2
) as ranked;

insert into public.visitor_answers (
  response_id, pack_version_id, card_id, choice
)
select
  assignment.response_id,
  assignment.pack_version_id,
  assignment.card_id,
  case when assignment.stage = 'required' and assignment.position = 1
    then 'b'
    else 'a'
  end
from public.visitor_assignments as assignment
where assignment.response_id = '28200000-0000-4000-8000-000000000001'
  and (assignment.stage = 'required' or assignment.position = 1);

update public.share_links
set status = 'disabled',
    consumed_response_id = '28200000-0000-4000-8000-000000000001',
    consumed_at = clock_timestamp()
where id = '28100000-0000-4000-8000-000000000001';

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at, withdrawn_at
) select
  '28200000-0000-4000-8000-000000000002',
  '28100000-0000-4000-8000-000000000002',
  null, null, null, 'withdrawn', null, null, null, null,
  value - interval '1 day', value
from fixed_time;

update public.share_links
set status = 'disabled',
    consumed_response_id = '28200000-0000-4000-8000-000000000002',
    consumed_at = clock_timestamp()
where id = '28100000-0000-4000-8000-000000000002';

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) select
  '28200000-0000-4000-8000-000000000003',
  '28100000-0000-4000-8000-000000000003',
  '15151515-1515-4515-8515-151515151515',
  'coworker', 'one_to_three_years', 'submitted',
  decode(repeat('c3', 32), 'hex'), value + interval '24 hours',
  decode(repeat('d3', 32), 'hex'), value, value
from fixed_time;

set local role service_role;

select is(
  public.list_owner_1to1_responses(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('ff', 32), 'hex')
  )->>'outcome',
  'not_found',
  'a wrong owner secret cannot list private 1:1 responses'
);
select is(
  public.list_owner_1to1_responses(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('a2', 32), 'hex')
  )->>'outcome',
  'not_found',
  'another play capability cannot cross-list private responses'
);
select is(
  public.list_owner_1to1_responses(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('a1', 32), 'hex')
  )->>'outcome',
  'listed',
  'the current play owner lists completed private 1:1 responses'
);
select is(
  jsonb_array_length(
    public.list_owner_1to1_responses(
      '28000000-0000-4000-8000-000000000001',
      decode(repeat('a1', 32), 'hex')
    )->'responses'
  ),
  2,
  'the list excludes the unconsumed one-to-one response'
);
select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(
      public.list_owner_1to1_responses(
        '28000000-0000-4000-8000-000000000001',
        decode(repeat('a1', 32), 'hex')
      )->'responses'->0
    ) as key
  ),
  array[
    'id', 'knownSinceCode', 'relationshipCode', 'shareLinkId',
    'status', 'submittedAt', 'withdrawnAt'
  ]::text[],
  'list rows expose only the sanitized exact field allowlist'
);
select is(
  public.list_owner_1to1_responses(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('a1', 32), 'hex')
  )#>>'{responses,0,status}',
  'withdrawn',
  'newest submitted timestamp sorts first even for a withdrawn tombstone'
);
select ok(
  public.list_owner_1to1_responses(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('a1', 32), 'hex')
  )#>'{responses,0,relationshipCode}' = 'null'::jsonb
  and public.list_owner_1to1_responses(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('a1', 32), 'hex')
  )#>'{responses,0,knownSinceCode}' = 'null'::jsonb,
  'withdrawn list rows retain no relationship context'
);

select is(
  public.get_private_1to1_comparison(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('a1', 32), 'hex'),
    '28200000-0000-4000-8000-000000000001'
  )->>'outcome',
  'authorized',
  'owner comparison works after the visitor session has expired'
);
select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(
      public.get_private_1to1_comparison(
        '28000000-0000-4000-8000-000000000001',
        decode(repeat('a1', 32), 'hex'),
        '28200000-0000-4000-8000-000000000001'
      )->'comparison'
    ) as key
  ),
  array[
    'allMatched', 'assignments', 'id', 'knownSinceCode', 'packTitle',
    'relationshipCode', 'submittedAt'
  ]::text[],
  'comparison exposes only the exact reviewed top-level fields'
);
select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(
      public.get_private_1to1_comparison(
        '28000000-0000-4000-8000-000000000001',
        decode(repeat('a1', 32), 'hex'),
        '28200000-0000-4000-8000-000000000001'
      )#>'{comparison,assignments,0}'
    ) as key
  ),
  array[
    'cardId', 'isHighlight', 'isSignature', 'matches', 'optionA', 'optionB',
    'ownerChoice', 'packPosition', 'position', 'stage', 'visitorChoice',
    'visitorPrompt'
  ]::text[],
  'comparison assignments expose only the exact reviewed fields'
);
select is(
  jsonb_array_length(
    public.get_private_1to1_comparison(
      '28000000-0000-4000-8000-000000000001',
      decode(repeat('a1', 32), 'hex'),
      '28200000-0000-4000-8000-000000000001'
    )#>'{comparison,assignments}'
  ),
  4,
  'detail includes required three and only the answered optional card'
);
select is(
  public.get_private_1to1_comparison(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('a1', 32), 'hex'),
    '28200000-0000-4000-8000-000000000001'
  )#>>'{comparison,assignments,0,isHighlight}',
  'true',
  'the signature mismatch is the highlighted required card'
);
select is(
  public.get_private_1to1_comparison(
    '28000000-0000-4000-8000-000000000002',
    decode(repeat('a2', 32), 'hex'),
    '28200000-0000-4000-8000-000000000001'
  )->>'outcome',
  'response_not_found',
  'another owner receives the same hidden response-not-found outcome'
);
select is(
  public.get_private_1to1_comparison(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('a1', 32), 'hex'),
    '28200000-0000-4000-8000-000000000002'
  )->>'outcome',
  'response_not_found',
  'a withdrawn tombstone has no owner detail'
);
select is(
  public.get_visitor_response(
    '28200000-0000-4000-8000-000000000001',
    decode(repeat('c1', 32), 'hex')
  )->>'outcome',
  'session_invalid',
  'the expired visitor session stays closed while owner access remains valid'
);
select is(
  public.get_owner_profile(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('a1', 32), 'hex')
  )#>>'{profile,sightCount}',
  '0',
  'private 1:1 responses do not contribute to owner profile aggregates'
);

select is(
  public.withdraw_response(decode(repeat('d1', 32), 'hex'))->>'outcome',
  'withdrawn',
  'visitor withdrawal removes a previously readable owner comparison'
);
select is(
  public.get_private_1to1_comparison(
    '28000000-0000-4000-8000-000000000001',
    decode(repeat('a1', 32), 'hex'),
    '28200000-0000-4000-8000-000000000001'
  )->>'outcome',
  'response_not_found',
  'owner detail closes immediately after withdrawal'
);
select is(
  jsonb_array_length(
    public.list_owner_1to1_responses(
      '28000000-0000-4000-8000-000000000001',
      decode(repeat('a1', 32), 'hex')
    )->'responses'
  ),
  2,
  'withdrawal preserves a sanitized list tombstone'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.visitor_answers
    where response_id = '28200000-0000-4000-8000-000000000001'
  ),
  0,
  'withdrawal deletes all private choices'
);
select is(
  (
    select count(*)::integer
    from public.visitor_assignments
    where response_id = '28200000-0000-4000-8000-000000000001'
  ),
  0,
  'withdrawal deletes all private assignments'
);
select ok(
  exists (
    select 1
    from public.share_links
    where id = '28100000-0000-4000-8000-000000000001'
      and status = 'disabled'
      and consumed_response_id = '28200000-0000-4000-8000-000000000001'
      and consumed_at is not null
  ),
  'withdrawal keeps the consumed one-to-one link closed'
);

select * from finish();
rollback;
