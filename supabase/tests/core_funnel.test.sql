begin;

select no_plan();

delete from public.analytics_events;
update public.pack_templates set is_active = true where slug = 'old-friend';

select has_column(
  'public', 'analytics_events', 'owner_play_id',
  'analytics events have an owner subject'
);
select has_column(
  'public', 'analytics_events', 'share_link_id',
  'analytics events have a share-link subject'
);
select has_function(
  'public',
  'create_or_resume_play_with_source',
  array['text', 'uuid', 'bytea', 'uuid', 'bytea', 'bytea', 'text', 'uuid', 'bytea'],
  'source-aware owner creation has the exact signature'
);
select ok(
  to_regclass('private.core_funnel_stage_counts') is not null
  and not has_table_privilege(
    'service_role', 'private.core_funnel_stage_counts', 'SELECT'
  )
  and not has_schema_privilege('service_role', 'private', 'USAGE'),
  'core funnel counts stay private'
);

set local role service_role;

select is(
  public.create_or_resume_play(
    'old-friend', null, null,
    '31000000-0000-4000-8000-000000000001',
    decode(repeat('01', 32), 'hex'),
    decode(repeat('a1', 32), 'hex')
  )->>'outcome',
  'created',
  'legacy owner creation remains a home entry'
);

reset role;

select is(
  (
    select jsonb_build_object(
      'owner', owner_play_id,
      'response', visitor_response_id,
      'properties', properties
    )
    from public.analytics_events
    where event_name = 'pack_opened'
      and owner_play_id = '31000000-0000-4000-8000-000000000001'
  ),
  jsonb_build_object(
    'owner', '31000000-0000-4000-8000-000000000001'::uuid,
    'response', null,
    'properties', jsonb_build_object(
      'packVersion', 'old-friend-v2', 'entrySource', 'home'
    )
  ),
  'home pack-open records only the owner subject and safe properties'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id, pack_version_id, management_secret_hash, management_expires_at,
  last_active_at, status, current_position, completed_at
) select
  '31000000-0000-4000-8000-000000000002',
  'e05e6366-2a00-4798-8273-0af5f16aad10',
  decode(repeat('02', 32), 'hex'), value + interval '7 days', value,
  'completed', 10, value
from fixed_time;

insert into public.share_links (
  id, public_id, pack_play_id, kind, secret_hash, status
) values (
  '31100000-0000-4000-8000-000000000001',
  'IIIIIIIIIIIIIIIIIIIIIA',
  '31000000-0000-4000-8000-000000000002',
  'public', decode(repeat('03', 32), 'hex'), 'active'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) select
  '31200000-0000-4000-8000-000000000001',
  '31100000-0000-4000-8000-000000000001',
  'e05e6366-2a00-4798-8273-0af5f16aad10',
  'old_friend', 'ten_years_or_more', 'submitted',
  decode(repeat('04', 32), 'hex'), value + interval '24 hours',
  decode(repeat('05', 32), 'hex'), value, value
from fixed_time;

set local role service_role;

select is(
  public.create_or_resume_play_with_source(
    'old-friend', null, null,
    '31000000-0000-4000-8000-000000000003',
    decode(repeat('06', 32), 'hex'), decode(repeat('a2', 32), 'hex'),
    'same_pack_cta', '31200000-0000-4000-8000-000000000001',
    decode(repeat('04', 32), 'hex')
  )->>'outcome',
  'created',
  'a valid submitted response attributes same-pack owner creation'
);

select is(
  public.create_or_resume_play_with_source(
    'old-friend', null, null,
    '31000000-0000-4000-8000-000000000004',
    decode(repeat('07', 32), 'hex'), decode(repeat('a3', 32), 'hex'),
    'same_pack_cta', '31200000-0000-4000-8000-000000000001',
    decode(repeat('ff', 32), 'hex')
  )->>'outcome',
  'created',
  'an invalid response capability safely falls back to home'
);

reset role;

select is(
  (
    select count(*)
    from public.analytics_events
    where event_name = 'pack_opened'
      and owner_play_id = '31000000-0000-4000-8000-000000000003'
      and visitor_response_id = '31200000-0000-4000-8000-000000000001'
      and properties->>'entrySource' = 'same_pack_cta'
  ),
  1::bigint,
  'same-pack pack-open binds the validated response subject'
);
select is(
  (
    select count(*)
    from public.analytics_events
    where event_name = 'pack_opened'
      and owner_play_id = '31000000-0000-4000-8000-000000000004'
      and visitor_response_id is null
      and properties->>'entrySource' = 'home'
  ),
  1::bigint,
  'invalid same-pack attribution stores no response subject'
);

insert into public.self_answers (
  pack_play_id, pack_version_id, card_id, choice
)
select
  '31000000-0000-4000-8000-000000000001',
  'e05e6366-2a00-4798-8273-0af5f16aad10', card.id, 'a'
from public.pack_cards as card
where card.pack_version_id = 'e05e6366-2a00-4798-8273-0af5f16aad10';

set local role service_role;

select is(
  public.complete_owner_play(
    '31000000-0000-4000-8000-000000000001',
    decode(repeat('01', 32), 'hex')
  )->>'outcome',
  'completed',
  'owner completion succeeds'
);
select is(
  public.complete_owner_play(
    '31000000-0000-4000-8000-000000000001',
    decode(repeat('01', 32), 'hex')
  )->>'outcome',
  'completed',
  'owner completion remains idempotent'
);
select is(
  public.create_share_link(
    '31000000-0000-4000-8000-000000000001',
    decode(repeat('01', 32), 'hex'),
    '31100000-0000-4000-8000-000000000002',
    'EEEEEEEEEEEEEEEEEEEEEA', decode(repeat('08', 32), 'hex'),
    'public', null
  )->>'outcome',
  'created',
  'public share link creation succeeds'
);
select is(
  public.record_owner_share_action(
    '31000000-0000-4000-8000-000000000001',
    decode(repeat('01', 32), 'hex'),
    '31100000-0000-4000-8000-000000000002',
    'share_handoff_succeeded'
  )->>'outcome',
  'recorded',
  'public share success records'
);

reset role;

select is(
  (
    select count(*)
    from public.analytics_events
    where event_name = 'self_pack_completed'
      and owner_play_id = '31000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'owner completion emits exactly one lifecycle event'
);
select is(
  (
    select count(*)
    from public.analytics_events
    where owner_play_id = '31000000-0000-4000-8000-000000000001'
      and share_link_id = '31100000-0000-4000-8000-000000000002'
      and event_name in ('share_link_created', 'share_handoff_succeeded')
  ),
  2::bigint,
  'share creation and success carry both owner and link subjects'
);

insert into public.analytics_events (
  event_name, visitor_response_id, properties
) values (
  'relationship_selected',
  '31200000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'packVersion', 'old-friend-v2', 'linkKind', 'public',
    'relationshipCode', 'old_friend', 'knownSinceCode', 'ten_years_or_more'
  )
);

select is(
  (
    select properties
    from public.analytics_events
    where event_name = 'relationship_selected'
      and visitor_response_id = '31200000-0000-4000-8000-000000000001'
  ),
  jsonb_build_object('packVersion', 'old-friend-v2', 'linkKind', 'public'),
  'legacy relationship metadata is normalized out before storage'
);

select throws_ok(
  $$
    insert into public.analytics_events (event_name, properties)
    values (
      'invite_opened',
      jsonb_build_object(
        'packVersion', 'old-friend-v2', 'linkKind', 'public',
        'email', 'private@example.com'
      )
    )
  $$,
  '22023',
  'forbidden analytics property',
  'forbidden analytics payloads fail closed'
);

set local role service_role;

select is(
  public.record_visitor_response_event(
    '31200000-0000-4000-8000-000000000001',
    decode(repeat('04', 32), 'hex'),
    'same_pack_start_clicked'
  )->>'outcome',
  'recorded',
  'same-pack click records without waiting for navigation'
);

reset role;

select ok(
  (
    select min(occurred_at) filter (where event_name = 'comparison_viewed')
      <= min(occurred_at) filter (where event_name = 'same_pack_start_clicked')
    from public.analytics_events
    where visitor_response_id = '31200000-0000-4000-8000-000000000001'
  ),
  'same-pack click transaction commits comparison first'
);

set local role service_role;

select is(
  public.withdraw_response(decode(repeat('05', 32), 'hex'))->>'outcome',
  'withdrawn',
  'withdrawal uses the private management capability'
);

reset role;

select is(
  (
    select count(*)
    from public.analytics_events
    where event_name in (
      'relationship_selected', 'comparison_viewed', 'same_pack_start_clicked'
    )
      and visitor_response_id is null
  ),
  3::bigint,
  'response withdrawal scrubs every analytics subject binding'
);

with fixed_time as (select clock_timestamp() as value)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, created_at
) select
  '31200000-0000-4000-8000-000000000002',
  '31100000-0000-4000-8000-000000000001',
  'e05e6366-2a00-4798-8273-0af5f16aad10',
  'old_friend', 'not_sure', 'draft', decode(repeat('09', 32), 'hex'),
  value + interval '24 hours', value
from fixed_time;

insert into public.analytics_events (
  event_name, visitor_response_id, properties
) values (
  'comparison_viewed',
  '31200000-0000-4000-8000-000000000002',
  jsonb_build_object('packVersion', 'old-friend-v2', 'linkKind', 'public')
);
delete from public.visitor_responses
where id = '31200000-0000-4000-8000-000000000002';

select is(
  (
    select count(*)
    from public.analytics_events
    where event_name = 'comparison_viewed'
      and visitor_response_id is null
  ),
  2::bigint,
  'response deletion scrubs the analytics subject through its foreign key'
);

delete from public.analytics_events;
update private.analytics_measurement_markers
set started_at = clock_timestamp() - interval '1 hour'
where name = 'core_funnel_v1';

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id, pack_version_id, management_secret_hash, management_expires_at,
  last_active_at, status, current_position, completed_at
) select
  fixture.id, 'e05e6366-2a00-4798-8273-0af5f16aad10', fixture.secret,
  value + interval '7 days', value, fixture.status, 10,
  case when fixture.status = 'completed' then value else null end
from fixed_time
cross join (
  values
    ('31000000-0000-4000-8000-000000000005'::uuid, decode(repeat('0a', 32), 'hex'), 'draft'),
    ('31000000-0000-4000-8000-000000000006'::uuid, decode(repeat('0b', 32), 'hex'), 'completed')
) as fixture(id, secret, status);

with fixed_time as (select clock_timestamp() as value),
fixture(id, submitted_offset, token, management) as (
  values
    ('31200000-0000-4000-8000-000000000003'::uuid, interval '-40 seconds', '0c', '0d'),
    ('31200000-0000-4000-8000-000000000004'::uuid, interval '-35 seconds', '0e', '0f'),
    ('31200000-0000-4000-8000-000000000005'::uuid, interval '0 seconds', '10', '11')
)
insert into public.visitor_responses (
  id, share_link_id, pack_version_id, relationship_code, known_since_code,
  status, session_token_hash, session_expires_at, management_token_hash,
  created_at, submitted_at
) select
  fixture.id, '31100000-0000-4000-8000-000000000002',
  'e05e6366-2a00-4798-8273-0af5f16aad10', 'old_friend', 'not_sure',
  'submitted', decode(repeat(fixture.token, 32), 'hex'),
  value + fixture.submitted_offset + interval '24 hours',
  decode(repeat(fixture.management, 32), 'hex'),
  value, value + fixture.submitted_offset
from fixed_time cross join fixture;

insert into public.analytics_events (
  event_name, owner_play_id, share_link_id, visitor_response_id,
  properties, occurred_at
) values
  ('self_pack_completed', '31000000-0000-4000-8000-000000000001', null, null,
    '{"packVersion":"old-friend-v2"}', clock_timestamp() - interval '50 seconds'),
  ('share_link_created', '31000000-0000-4000-8000-000000000001',
    '31100000-0000-4000-8000-000000000002', null,
    '{"packVersion":"old-friend-v2","linkKind":"public"}',
    clock_timestamp() - interval '45 seconds'),
  ('share_handoff_succeeded', '31000000-0000-4000-8000-000000000001',
    '31100000-0000-4000-8000-000000000002', null,
    '{"packVersion":"old-friend-v2","linkKind":"public"}',
    clock_timestamp() - interval '40 seconds'),
  ('visitor_required_submitted', null, null,
    '31200000-0000-4000-8000-000000000003',
    '{"packVersion":"old-friend-v2","linkKind":"public"}',
    clock_timestamp() - interval '40 seconds'),
  ('comparison_viewed', null, null, '31200000-0000-4000-8000-000000000003',
    '{"packVersion":"old-friend-v2","linkKind":"public"}',
    clock_timestamp() - interval '35 seconds'),
  ('same_pack_start_clicked', null, null, '31200000-0000-4000-8000-000000000003',
    '{"packVersion":"old-friend-v2","linkKind":"public"}',
    clock_timestamp() - interval '25 seconds'),
  ('pack_opened', '31000000-0000-4000-8000-000000000003', null,
    '31200000-0000-4000-8000-000000000003',
    '{"packVersion":"old-friend-v2","entrySource":"same_pack_cta"}',
    clock_timestamp() - interval '30 seconds'),
  ('visitor_required_submitted', null, null,
    '31200000-0000-4000-8000-000000000004',
    '{"packVersion":"old-friend-v2","linkKind":"public"}',
    clock_timestamp() - interval '35 seconds'),
  ('comparison_viewed', null, null, '31200000-0000-4000-8000-000000000004',
    '{"packVersion":"old-friend-v2","linkKind":"public"}',
    clock_timestamp() - interval '40 seconds'),
  ('same_pack_start_clicked', null, null, '31200000-0000-4000-8000-000000000004',
    '{"packVersion":"old-friend-v2","linkKind":"public"}',
    clock_timestamp() - interval '30 seconds'),
  ('pack_opened', '31000000-0000-4000-8000-000000000005', null,
    '31200000-0000-4000-8000-000000000004',
    '{"packVersion":"old-friend-v2","entrySource":"same_pack_cta"}',
    clock_timestamp() - interval '25 seconds'),
  ('profile_viewed', '31000000-0000-4000-8000-000000000001', null, null,
    '{"packVersion":"old-friend-v2"}', clock_timestamp() - interval '20 seconds'),
  ('profile_reshare_clicked', '31000000-0000-4000-8000-000000000001', null, null,
    '{"packVersion":"old-friend-v2","entrySource":"profile_reshare"}',
    clock_timestamp() - interval '15 seconds'),
  ('share_link_copied', '31000000-0000-4000-8000-000000000001',
    '31100000-0000-4000-8000-000000000002', null,
    '{"packVersion":"old-friend-v2","linkKind":"public","entrySource":"profile_reshare"}',
    clock_timestamp() - interval '10 seconds'),
  ('self_pack_completed', '31000000-0000-4000-8000-000000000006', null, null,
    '{"packVersion":"old-friend-v2"}', clock_timestamp() - interval '2 hours');

select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'owner_share' and stage = 'self_pack_completed'),
  1::bigint,
  'measurement marker excludes old owner completions'
);
select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'owner_share' and stage = 'public_link_created'),
  1::bigint,
  'owner public-link stage is cohort ordered'
);
select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'owner_share' and stage = 'public_share_succeeded'),
  1::bigint,
  'owner public-share stage is cohort ordered'
);
select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'visitor_same_pack' and stage = 'visitor_required_submitted'),
  2::bigint,
  'visitor funnel starts from both submitted responses'
);
select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'visitor_same_pack' and stage = 'comparison_viewed'),
  1::bigint,
  'comparison before submission is excluded'
);
select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'visitor_same_pack' and stage = 'same_pack_start_clicked'),
  1::bigint,
  'same-pack click counts only the ordered cohort'
);
select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'visitor_same_pack' and stage = 'new_owner_pack_opened'),
  1::bigint,
  'new owner pack-open tolerates click and navigation arrival order'
);
select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'profile_reshare' and stage = 'profile_viewed'),
  1::bigint,
  'profile view starts one eligible profile cohort'
);
select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'profile_reshare' and stage = 'profile_reshare_clicked'),
  1::bigint,
  'profile reshare click is ordered after its view'
);
select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'profile_reshare' and stage = 'profile_share_succeeded'),
  1::bigint,
  'profile share success requires the profile source'
);
select is(
  (select subjects from private.core_funnel_stage_counts
   where funnel = 'profile_reshare' and stage = 'downstream_visitor_submitted'),
  1::bigint,
  'profile reshare counts a later submitted visitor on the shared link'
);

select * from finish();
rollback;
