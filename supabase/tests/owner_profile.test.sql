begin;

select no_plan();

delete from public.analytics_events
where event_name in ('profile_viewed', 'profile_reshare_clicked');

select has_function(
  'public',
  'get_owner_profile',
  array['uuid', 'bytea'],
  'owner profile RPC has the exact signature'
);
select has_function(
  'public',
  'record_owner_share_action_with_source',
  array['uuid', 'bytea', 'uuid', 'text', 'text'],
  'source-aware owner share action RPC has a distinct exact signature'
);
select has_function(
  'public',
  'record_owner_profile_event',
  array['uuid', 'bytea', 'text'],
  'owner profile event RPC has the exact signature'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_owner_profile(uuid,bytea)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.record_owner_profile_event(uuid,bytea,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.record_owner_share_action_with_source(uuid,bytea,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_owner_profile(uuid,bytea)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.record_owner_profile_event(uuid,bytea,text)',
    'EXECUTE'
  ),
  'only the service boundary can execute owner profile RPCs'
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
) values
  (
    '27000000-0000-4000-8000-000000000001',
    '15151515-1515-4515-8515-151515151515',
    decode(repeat('11', 32), 'hex'),
    (select value + interval '7 days' from fixed_time),
    (select value from fixed_time),
    'draft',
    10
  ),
  (
    '27000000-0000-4000-8000-000000000002',
    '15151515-1515-4515-8515-151515151515',
    decode(repeat('22', 32), 'hex'),
    (select value + interval '7 days' from fixed_time),
    (select value from fixed_time),
    'draft',
    10
  ),
  (
    '27000000-0000-4000-8000-000000000003',
    '15151515-1515-4515-8515-151515151515',
    decode(repeat('33', 32), 'hex'),
    (select value + interval '7 days' from fixed_time),
    (select value from fixed_time),
    'draft',
    1
  );

insert into public.self_answers (
  pack_play_id,
  pack_version_id,
  card_id,
  choice
)
select
  play.id,
  play.pack_version_id,
  card.id,
  case when card.position % 2 = 0 then 'b' else 'a' end
from public.pack_plays as play
join public.pack_cards as card
  on card.pack_version_id = play.pack_version_id
where play.id in (
  '27000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000002'
);

update public.pack_plays
set status = 'completed',
    completed_at = clock_timestamp()
where id in (
  '27000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000002'
);

insert into public.share_links (
  id,
  public_id,
  pack_play_id,
  kind,
  secret_hash,
  status
) values
  (
    '27100000-0000-4000-8000-000000000001',
    'PPPPPPPPPPPPPPPPPPPPPA',
    '27000000-0000-4000-8000-000000000001',
    'public',
    decode(repeat('41', 32), 'hex'),
    'active'
  ),
  (
    '27100000-0000-4000-8000-000000000002',
    'QQQQQQQQQQQQQQQQQQQQQQ',
    '27000000-0000-4000-8000-000000000001',
    'one_to_one',
    decode(repeat('42', 32), 'hex'),
    'active'
  ),
  (
    '27100000-0000-4000-8000-000000000003',
    'RRRRRRRRRRRRRRRRRRRRRQ',
    '27000000-0000-4000-8000-000000000002',
    'public',
    decode(repeat('43', 32), 'hex'),
    'active'
  );

set local role service_role;

select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('ff', 32), 'hex')
  )->>'outcome',
  'not_found',
  'a wrong secret cannot read an owner profile'
);
select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('22', 32), 'hex')
  )->>'outcome',
  'not_found',
  'a hash from another play cannot cross-read the profile'
);
select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000003',
    decode(repeat('33', 32), 'hex')
  )->>'outcome',
  'not_completed',
  'a valid draft capability returns the hidden incomplete outcome'
);
select is(
  (
    public.get_owner_profile(
      '27000000-0000-4000-8000-000000000003',
      decode(repeat('33', 32), 'hex')
    )->>'managementTtlSeconds'
  )::integer,
  604800,
  'a valid draft profile read returns the refreshed cookie TTL'
);

select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex')
  )->>'outcome',
  'authorized',
  'a completed owner can read the private profile'
);
select is(
  (
    public.get_owner_profile(
      '27000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex')
    )->'profile'->>'sightCount'
  )::integer,
  0,
  'a new profile starts with zero submitted public sights'
);
select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex')
  )->'profile'->>'sightStatus',
  'empty',
  'zero sights return the honest empty state'
);
select is(
  jsonb_array_length(
    public.get_owner_profile(
      '27000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex')
    )->'profile'->'cards'
  ),
  10,
  'the private profile returns exactly ten self cards'
);
select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex')
  )->'profile'->'relationshipLayers',
  '[]'::jsonb,
  'a zero-sight profile has no relationship layers'
);
select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(
      public.get_owner_profile(
        '27000000-0000-4000-8000-000000000001',
        decode(repeat('11', 32), 'hex')
      )->'profile'
    ) as key
  ),
  array[
    'cards',
    'packSlug',
    'packTitle',
    'packVersion',
    'playId',
    'relationshipLayers',
    'sightCount',
    'sightStatus'
  ]::text[],
  'profile projection exposes only the reviewed top-level fields'
);
select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(
      public.get_owner_profile(
        '27000000-0000-4000-8000-000000000001',
        decode(repeat('11', 32), 'hex')
      )->'profile'->'cards'->0
    ) as key
  ),
  array[
    'cardId',
    'counts',
    'optionA',
    'optionB',
    'ownerPrompt',
    'position',
    'sampleCount',
    'selfChoice'
  ]::text[],
  'card projection exposes no visitor, response, relation, or timestamp fields'
);

reset role;

select is(
  (
    select count(*)
    from public.analytics_events
    where event_name = 'profile_viewed'
  ),
  0::bigint,
  'profile reads alone do not record a viewed event'
);

set local role service_role;

select is(
  public.record_owner_profile_event(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    'profile_reshare_clicked'
  )->>'outcome',
  'not_eligible',
  'a completed zero-sight profile cannot record a reshare click'
);

reset role;

select is(
  (
    select count(*)
    from public.analytics_events
    where event_name = 'profile_reshare_clicked'
  ),
  0::bigint,
  'an ineligible reshare click stores no analytics row'
);

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
) values (
  '27200000-0000-4000-8000-000000000001',
  '27100000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  'old_friend',
  'ten_years_or_more',
  'submitted',
  decode(repeat('51', 32), 'hex'),
  transaction_timestamp() + interval '24 hours',
  decode(repeat('61', 32), 'hex'),
  transaction_timestamp(),
  transaction_timestamp()
);
insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
) values
  ('27200000-0000-4000-8000-000000000001', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('27200000-0000-4000-8000-000000000001', '15151515-1515-4515-8515-151515151515', 'reunion', 'required', 2),
  ('27200000-0000-4000-8000-000000000001', '15151515-1515-4515-8515-151515151515', 'plans', 'required', 3);
insert into public.visitor_answers (
  response_id, pack_version_id, card_id, choice
) select response_id, pack_version_id, card_id, 'a'
from public.visitor_assignments
where response_id = '27200000-0000-4000-8000-000000000001';

set local role service_role;

select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex')
  )->'profile'->'cards'->0->'counts',
  'null'::jsonb,
  'one sample hides both A and B counts at the SQL boundary'
);
select is(
  (
    public.get_owner_profile(
      '27000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex')
    )->'profile'->'cards'->0->>'sampleCount'
  )::integer,
  0,
  'one collecting relationship contributes nothing to the top-level projection'
);
select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex')
  )->'profile'->'relationshipLayers'->0,
  jsonb_build_object(
    'relationshipCode', 'old_friend',
    'sightCount', 1,
    'status', 'collecting',
    'cards', '[]'::jsonb
  ),
  'one relationship sight exposes only its collecting n of three state'
);

reset role;

insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) values (
  '27200000-0000-4000-8000-000000000002',
  '27100000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  'school_friend', 'five_to_ten_years', 'submitted',
  decode(repeat('52', 32), 'hex'), transaction_timestamp() + interval '24 hours',
  decode(repeat('62', 32), 'hex'), transaction_timestamp(), transaction_timestamp()
);
insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
) values
  ('27200000-0000-4000-8000-000000000002', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('27200000-0000-4000-8000-000000000002', '15151515-1515-4515-8515-151515151515', 'reunion', 'required', 2),
  ('27200000-0000-4000-8000-000000000002', '15151515-1515-4515-8515-151515151515', 'plans', 'required', 3);
insert into public.visitor_answers (
  response_id, pack_version_id, card_id, choice
) select response_id, pack_version_id, card_id, 'b'
from public.visitor_assignments
where response_id = '27200000-0000-4000-8000-000000000002';

set local role service_role;

select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex')
  )->'profile'->'cards'->0->'counts',
  'null'::jsonb,
  'two one-sight relationships cannot combine their card counts'
);
select is(
  (
    public.get_owner_profile(
      '27000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex')
    )->'profile'->'cards'->0->>'sampleCount'
  )::integer,
  0,
  'top-level sample stays zero while every relationship is collecting'
);

reset role;

insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) values (
  '27200000-0000-4000-8000-000000000003',
  '27100000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  'old_friend', 'three_to_five_years', 'submitted',
  decode(repeat('53', 32), 'hex'), transaction_timestamp() + interval '24 hours',
  decode(repeat('63', 32), 'hex'), transaction_timestamp(), transaction_timestamp()
);
insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
) values
  ('27200000-0000-4000-8000-000000000003', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('27200000-0000-4000-8000-000000000003', '15151515-1515-4515-8515-151515151515', 'reunion', 'required', 2),
  ('27200000-0000-4000-8000-000000000003', '15151515-1515-4515-8515-151515151515', 'plans', 'required', 3);
insert into public.visitor_answers (
  response_id, pack_version_id, card_id, choice
) select response_id, pack_version_id, card_id, 'a'
from public.visitor_assignments
where response_id = '27200000-0000-4000-8000-000000000003';

-- These rows must not affect owner A: one-to-one, another owner, public draft,
-- another pack version, and a withdrawn tombstone.
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) values
  (
    '27200000-0000-4000-8000-000000000004',
    '27100000-0000-4000-8000-000000000002',
    '15151515-1515-4515-8515-151515151515',
    'old_friend', 'ten_years_or_more', 'submitted',
    decode(repeat('54', 32), 'hex'), transaction_timestamp() + interval '24 hours',
    decode(repeat('64', 32), 'hex'), transaction_timestamp(), transaction_timestamp()
  ),
  (
    '27200000-0000-4000-8000-000000000005',
    '27100000-0000-4000-8000-000000000003',
    '15151515-1515-4515-8515-151515151515',
    'old_friend', 'ten_years_or_more', 'submitted',
    decode(repeat('55', 32), 'hex'), transaction_timestamp() + interval '24 hours',
    decode(repeat('65', 32), 'hex'), transaction_timestamp(), transaction_timestamp()
  ),
  (
    '27200000-0000-4000-8000-000000000006',
    '27100000-0000-4000-8000-000000000001',
    '15151515-1515-4515-8515-151515151515',
    'old_friend', 'ten_years_or_more', 'draft',
    decode(repeat('56', 32), 'hex'), transaction_timestamp() + interval '24 hours',
    null, transaction_timestamp(), null
  ),
  (
    '27200000-0000-4000-8000-000000000010',
    '27100000-0000-4000-8000-000000000001',
    'e05e6366-2a00-4798-8273-0af5f16aad10',
    'old_friend', 'ten_years_or_more', 'submitted',
    decode(repeat('5a', 32), 'hex'), transaction_timestamp() + interval '24 hours',
    decode(repeat('6a', 32), 'hex'), transaction_timestamp(), transaction_timestamp()
  );
insert into public.visitor_responses (
  id, share_link_id, status, created_at, submitted_at, withdrawn_at
) values (
  '27200000-0000-4000-8000-000000000011',
  '27100000-0000-4000-8000-000000000001',
  'withdrawn', null, transaction_timestamp(), transaction_timestamp()
);

set local role service_role;

select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex')
  )->'profile'->'cards'->0->'counts',
  'null'::jsonb,
  'collecting relationships with two plus one samples do not reveal top-level counts'
);
select is(
  (
    public.get_owner_profile(
      '27000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex')
    )->'profile'->'cards'->0->>'sampleCount'
  )::integer,
  0,
  'collecting relationships with two plus one samples project top-level zero'
);
select is(
  (
    select array_agg(
      (layer->>'relationshipCode') || ':' || (layer->>'sightCount')
      order by ordinal
    )
    from jsonb_array_elements(
      public.get_owner_profile(
        '27000000-0000-4000-8000-000000000001',
        decode(repeat('11', 32), 'hex')
      )->'profile'->'relationshipLayers'
    ) with ordinality as layers(layer, ordinal)
  ),
  array['old_friend:2', 'school_friend:1']::text[],
  'relationship layers follow the shared registry order'
);
select is(
  (
    public.get_owner_profile(
      '27000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex')
    )->'profile'->>'sightCount'
  )::integer,
  3,
  'total sight count excludes one-to-one, other-owner, draft, other-version, and withdrawn responses'
);
select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex')
  )->'profile'->>'sightStatus',
  'has_sight',
  'submitted public responses return the honest current sight state'
);

reset role;

insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) values
  (
    '27200000-0000-4000-8000-000000000007',
    '27100000-0000-4000-8000-000000000001',
    '15151515-1515-4515-8515-151515151515',
    'school_friend', 'not_sure', 'submitted',
    decode(repeat('57', 32), 'hex'), transaction_timestamp() + interval '24 hours',
    decode(repeat('67', 32), 'hex'), transaction_timestamp(), transaction_timestamp()
  );
insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
) values
  ('27200000-0000-4000-8000-000000000007', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('27200000-0000-4000-8000-000000000007', '15151515-1515-4515-8515-151515151515', 'reunion', 'required', 2),
  ('27200000-0000-4000-8000-000000000007', '15151515-1515-4515-8515-151515151515', 'plans', 'required', 3);
insert into public.visitor_answers (
  response_id, pack_version_id, card_id, choice
) select response_id, pack_version_id, card_id, 'b'
from public.visitor_assignments
where response_id = '27200000-0000-4000-8000-000000000007';

set local role service_role;

select is(
  (
    public.get_owner_profile(
      '27000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex')
    )->'profile'->'cards'->0->>'sampleCount'
  )::integer,
  0,
  'collecting relationships with two plus two samples still project zero'
);

reset role;

insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) values
  (
    '27200000-0000-4000-8000-000000000008',
    '27100000-0000-4000-8000-000000000001',
    '15151515-1515-4515-8515-151515151515',
    'old_friend', 'under_one_year', 'submitted',
    decode(repeat('58', 32), 'hex'), transaction_timestamp() + interval '24 hours',
    decode(repeat('68', 32), 'hex'), transaction_timestamp(), transaction_timestamp()
  ),
  (
    '27200000-0000-4000-8000-000000000009',
    '27100000-0000-4000-8000-000000000001',
    '15151515-1515-4515-8515-151515151515',
    'school_friend', 'one_to_three_years', 'submitted',
    decode(repeat('59', 32), 'hex'), transaction_timestamp() + interval '24 hours',
    decode(repeat('69', 32), 'hex'), transaction_timestamp(), transaction_timestamp()
  );
insert into public.visitor_assignments (
  response_id, pack_version_id, card_id, stage, position
) values
  ('27200000-0000-4000-8000-000000000008', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('27200000-0000-4000-8000-000000000008', '15151515-1515-4515-8515-151515151515', 'reunion', 'required', 2),
  ('27200000-0000-4000-8000-000000000008', '15151515-1515-4515-8515-151515151515', 'plans', 'required', 3),
  ('27200000-0000-4000-8000-000000000009', '15151515-1515-4515-8515-151515151515', 'conflict', 'required', 1),
  ('27200000-0000-4000-8000-000000000009', '15151515-1515-4515-8515-151515151515', 'reunion', 'required', 2),
  ('27200000-0000-4000-8000-000000000009', '15151515-1515-4515-8515-151515151515', 'plans', 'required', 3),
  ('27200000-0000-4000-8000-000000000001', '15151515-1515-4515-8515-151515151515', 'comfort', 'optional', 1),
  ('27200000-0000-4000-8000-000000000003', '15151515-1515-4515-8515-151515151515', 'comfort', 'optional', 1),
  ('27200000-0000-4000-8000-000000000002', '15151515-1515-4515-8515-151515151515', 'comfort', 'optional', 1);
insert into public.visitor_answers (
  response_id, pack_version_id, card_id, choice
) select
  assignment.response_id,
  assignment.pack_version_id,
  assignment.card_id,
  case
    when assignment.response_id in (
      '27200000-0000-4000-8000-000000000001',
      '27200000-0000-4000-8000-000000000009'
    ) then 'a'
    else 'b'
  end
from public.visitor_assignments as assignment
where assignment.response_id in (
  '27200000-0000-4000-8000-000000000008',
  '27200000-0000-4000-8000-000000000009'
)
or (
  assignment.card_id = 'comfort'
  and assignment.response_id in (
    '27200000-0000-4000-8000-000000000001',
    '27200000-0000-4000-8000-000000000002',
    '27200000-0000-4000-8000-000000000003'
  )
);

set local role service_role;

select is(
  (
    public.get_owner_profile(
      '27000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex')
    )->'profile'->'cards'->0->>'sampleCount'
  )::integer,
  6,
  'available relationship cards contribute their safe samples'
);
select is(
  public.get_owner_profile(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex')
  )->'profile'->'cards'->0->'counts',
  jsonb_build_object('a', 3, 'b', 3),
  'safe top-level counts equal the available relationship card sum'
);
select is(
  (
    select card
    from jsonb_array_elements(
      public.get_owner_profile(
        '27000000-0000-4000-8000-000000000001',
        decode(repeat('11', 32), 'hex')
      )->'profile'->'cards'
    ) as card
    where card->>'cardId' = 'comfort'
  ),
  jsonb_build_object(
    'cardId', 'comfort',
    'position', 4,
    'ownerPrompt', '친구가 고민을 털어놓으면 나는?',
    'optionA', '먼저 끝까지 들어준다',
    'optionB', '해결 방법부터 같이 찾는다',
    'selfChoice', 'b',
    'sampleCount', 0,
    'counts', null
  ),
  'available relationships with hidden card samples two plus one still project zero'
);
select is(
  (
    select array_agg(
      (card->>'sampleCount')::integer
      order by ordinal
    )
    from jsonb_array_elements(
      public.get_owner_profile(
        '27000000-0000-4000-8000-000000000001',
        decode(repeat('11', 32), 'hex')
      )->'profile'->'relationshipLayers'
    ) with ordinality as layers(layer, ordinal)
    cross join lateral jsonb_array_elements(layer->'cards') as card
    where card->>'cardId' = 'comfort'
  ),
  array[2, 1]::integer[],
  'required and optional actual answers stay separated inside their available relationships'
);

select is(
  public.record_owner_profile_event(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('ff', 32), 'hex'),
    'profile_viewed'
  )->>'outcome',
  'not_found',
  'an invalid capability cannot record a profile event'
);
select is(
  public.record_owner_profile_event(
    '27000000-0000-4000-8000-000000000003',
    decode(repeat('33', 32), 'hex'),
    'profile_viewed'
  )->>'outcome',
  'not_completed',
  'a valid draft cannot record a profile event'
);
select is(
  public.record_owner_profile_event(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    'profile_viewed'
  )->>'outcome',
  'recorded',
  'a completed owner records the render event explicitly'
);
select is(
  public.record_owner_profile_event(
    '27000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    'profile_reshare_clicked'
  )->>'outcome',
  'recorded',
  'an eligible owner records the profile reshare click'
);

reset role;

select is(
  (
    select count(*)
    from public.analytics_events
    where event_name = 'profile_viewed'
  ),
  2::bigint,
  'render and eligible click store the explicit and atomic view events'
);
select ok(
  (
    select bool_and(
      properties = jsonb_build_object('packVersion', 'old-friend-v1')
    )
    from public.analytics_events
    where event_name = 'profile_viewed'
  ),
  'every profile view event contains only the pack version'
);
select ok(
  (
    select bool_and(visitor_response_id is null)
    from public.analytics_events
    where event_name = 'profile_viewed'
  ),
  'profile view events have no visitor response identifier'
);
select ok(
  (
    select max(viewed.occurred_at) <= min(clicked.occurred_at)
    from public.analytics_events as viewed
    cross join public.analytics_events as clicked
    where viewed.event_name = 'profile_viewed'
      and clicked.event_name = 'profile_reshare_clicked'
      and viewed.owner_play_id = clicked.owner_play_id
  ),
  'eligible profile click atomically follows its guaranteed view event'
);
select is(
  (
    select properties
    from public.analytics_events
    where event_name = 'profile_reshare_clicked'
  ),
  jsonb_build_object(
    'packVersion', 'old-friend-v1',
    'entrySource', 'profile_reshare'
  ),
  'profile reshare click stores only pack version and fixed entry source'
);
select ok(
  (
    select visitor_response_id is null
    from public.analytics_events
    where event_name = 'profile_reshare_clicked'
  ),
  'profile reshare click has no visitor response identifier'
);

select * from finish();

rollback;
