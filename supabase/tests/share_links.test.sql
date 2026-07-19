begin;

select no_plan();

delete from public.analytics_events;

select has_table('public', 'share_links', 'share link table exists');
select has_function(
  'public',
  'create_share_link',
  array['uuid', 'bytea', 'uuid', 'text', 'bytea', 'text', 'timestamptz'],
  'create share link RPC has the exact signature'
);
select has_function(
  'public',
  'disable_share_link',
  array['uuid', 'bytea', 'uuid'],
  'disable share link RPC has the exact signature'
);
select has_function(
  'public',
  'rotate_share_link',
  array['uuid', 'bytea', 'uuid', 'uuid', 'text', 'bytea'],
  'rotate share link RPC has the exact signature'
);
select has_function(
  'public',
  'list_owner_share_links',
  array['uuid', 'bytea'],
  'list owner share links RPC has the exact signature'
);
select has_function(
  'public',
  'get_invite_metadata',
  array['text', 'bytea'],
  'invite metadata RPC has the exact signature'
);
select has_function(
  'public',
  'record_owner_share_action',
  array['uuid', 'bytea', 'uuid', 'text'],
  'record share action RPC has the exact signature'
);
select has_function(
  'public',
  'record_owner_share_action_with_source',
  array['uuid', 'bytea', 'uuid', 'text', 'text'],
  'source-aware share action RPC has a distinct exact signature'
);

select ok(
  not has_table_privilege('service_role', 'public.share_links', 'SELECT')
  and not has_table_privilege('service_role', 'public.share_links', 'INSERT')
  and not has_table_privilege('service_role', 'public.share_links', 'UPDATE')
  and not has_table_privilege('service_role', 'public.share_links', 'DELETE')
  and not has_table_privilege('anon', 'public.share_links', 'SELECT')
  and not has_table_privilege('authenticated', 'public.share_links', 'SELECT'),
  'API roles have no direct share link table access'
);
select ok(
  has_table_privilege('gyeop_internal_rpc', 'public.share_links', 'SELECT')
  and has_table_privilege('gyeop_internal_rpc', 'public.share_links', 'INSERT')
  and has_table_privilege('gyeop_internal_rpc', 'public.share_links', 'UPDATE')
  and not has_table_privilege('gyeop_internal_rpc', 'public.share_links', 'DELETE')
  and has_table_privilege('gyeop_internal_rpc', 'public.analytics_events', 'INSERT')
  and not has_table_privilege('gyeop_internal_rpc', 'public.analytics_events', 'SELECT')
  and not has_table_privilege('gyeop_internal_rpc', 'public.analytics_events', 'UPDATE')
  and not has_table_privilege('gyeop_internal_rpc', 'public.analytics_events', 'DELETE'),
  'internal share and analytics privileges are the exact allowlist'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_share_link(uuid,bytea,uuid,text,bytea,text,timestamptz)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.disable_share_link(uuid,bytea,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.rotate_share_link(uuid,bytea,uuid,uuid,text,bytea)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.list_owner_share_links(uuid,bytea)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.get_invite_metadata(text,bytea)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.record_owner_share_action(uuid,bytea,uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.record_owner_share_action_with_source(uuid,bytea,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.record_owner_share_action_with_source(uuid,bytea,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_invite_metadata(text,bytea)',
    'EXECUTE'
  ),
  'only service role executes share RPCs'
);

select is(
  (
    select array_agg(policyname order by policyname)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'share_links'
  ),
  array[
    'share_links_internal_insert',
    'share_links_internal_select',
    'share_links_internal_update'
  ]::name[],
  'share link RLS policy inventory is exact'
);

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
    '19000000-0000-4000-8000-000000000001',
    '15151515-1515-4515-8515-151515151515',
    decode(repeat('11', 32), 'hex'),
    timestamptz '2030-01-08 00:00:00+00',
    timestamptz '2030-01-01 00:00:00+00',
    'draft',
    10
  ),
  (
    '19000000-0000-4000-8000-000000000002',
    '15151515-1515-4515-8515-151515151515',
    decode(repeat('22', 32), 'hex'),
    timestamptz '2030-01-08 00:00:00+00',
    timestamptz '2030-01-01 00:00:00+00',
    'draft',
    10
  ),
  (
    '19000000-0000-4000-8000-000000000003',
    '15151515-1515-4515-8515-151515151515',
    decode(repeat('33', 32), 'hex'),
    timestamptz '2030-01-08 00:00:00+00',
    timestamptz '2030-01-01 00:00:00+00',
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
  play_id,
  '15151515-1515-4515-8515-151515151515',
  card.id,
  'a'
from unnest(array[
  '19000000-0000-4000-8000-000000000001'::uuid,
  '19000000-0000-4000-8000-000000000002'::uuid
]) play_id
cross join public.pack_cards card
where card.pack_version_id = '15151515-1515-4515-8515-151515151515';

update public.pack_plays
set status = 'completed',
    completed_at = timestamptz '2030-01-01 00:00:00+00'
where id in (
  '19000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000002'
);

insert into public.share_links (
  id,
  public_id,
  pack_play_id,
  kind,
  secret_hash,
  created_at,
  updated_at
) values
  (
    '19300000-0000-4000-8000-000000000003',
    'GGGGGGGGGGGGGGGGGGGGGg',
    '19000000-0000-4000-8000-000000000003',
    'public',
    decode(repeat('73', 32), 'hex'),
    timestamptz '2030-01-01 00:00:00+00',
    timestamptz '2030-01-01 00:00:00+00'
  ),
  (
    '19300000-0000-4000-8000-000000000004',
    'HHHHHHHHHHHHHHHHHHHHHA',
    '19000000-0000-4000-8000-000000000001',
    'public',
    decode(repeat('74', 32), 'hex'),
    timestamptz '2020-01-01 00:00:00+00',
    timestamptz '2020-01-01 00:00:00+00'
  );

update public.share_links
set expires_at = timestamptz '2020-01-02 00:00:00+00'
where id = '19300000-0000-4000-8000-000000000004';

set local role service_role;

select throws_ok(
  $$
    select public.create_share_link(
      '19000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex'),
      '19100000-0000-4000-8000-000000000005',
      'AAAAAAAAAAAAAAAAAAAAAB',
      decode(repeat('a5', 32), 'hex'),
      'public',
      null
    )
  $$,
  '22023',
  'invalid share link input',
  'non-canonical 22-character public ids are rejected'
);

select is(
  public.create_share_link(
    '19000000-0000-4000-8000-000000000003',
    decode(repeat('33', 32), 'hex'),
    '19100000-0000-4000-8000-000000000003',
    'CCCCCCCCCCCCCCCCCCCCCg',
    decode(repeat('c3', 32), 'hex'),
    'public',
    null
  )->>'outcome',
  'not_completed',
  'draft owner cannot create a share link'
);

select is(
  public.create_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('ff', 32), 'hex'),
    '19100000-0000-4000-8000-000000000004',
    'DDDDDDDDDDDDDDDDDDDDDw',
    decode(repeat('d4', 32), 'hex'),
    'public',
    null
  )->>'outcome',
  'not_found',
  'tampered owner capability cannot create a share link'
);

select is(
  public.create_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000001',
    'AAAAAAAAAAAAAAAAAAAAAA',
    decode(repeat('a1', 32), 'hex'),
    'public',
    null
  )->>'outcome',
  'created',
  'completed owner creates a public share link'
);

select is(
  public.create_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000002',
    'BBBBBBBBBBBBBBBBBBBBBQ',
    decode(repeat('b2', 32), 'hex'),
    'one_to_one',
    null
  )->>'outcome',
  'created',
  'owner override creates a one-to-one share link'
);

select ok(
  result->>'outcome' = 'recorded'
  and (result->>'managementTtlSeconds')::integer = 604800
  and (result->>'managementExpiresAt')::timestamptz
    > clock_timestamp() + interval '6 days 23 hours',
  'public share handoff records an event and returns a renewed owner TTL'
)
from (
  select public.record_owner_share_action(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000001',
    'share_handoff_succeeded'
  ) as result
) recorded;

select is(
  public.record_owner_share_action(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000002',
    'share_link_copied'
  )->>'outcome',
  'recorded',
  'browser-reported one-to-one copy records an event'
);

select is(
  public.record_owner_share_action_with_source(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000001',
    'share_handoff_succeeded',
    'profile_reshare'
  )->>'outcome',
  'recorded',
  'profile-entry public handoff records the fixed source'
);

select is(
  public.record_owner_share_action_with_source(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000002',
    'share_link_copied',
    'profile_reshare'
  )->>'outcome',
  'recorded',
  'profile-entry one-to-one copy records the fixed source'
);

select throws_ok(
  $$
    select public.record_owner_share_action_with_source(
      '19000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex'),
      '19100000-0000-4000-8000-000000000001',
      'share_link_copied',
      'anything_else'
    )
  $$,
  '22023',
  'invalid share action input',
  'arbitrary entry source values are rejected before mutation'
);

select is(
  public.record_owner_share_action(
    '19000000-0000-4000-8000-000000000003',
    decode(repeat('33', 32), 'hex'),
    '19300000-0000-4000-8000-000000000003',
    'share_link_copied'
  )->>'outcome',
  'not_completed',
  'draft play cannot record or mutate a share action'
);

select is(
  public.record_owner_share_action(
    '19000000-0000-4000-8000-000000000002',
    decode(repeat('22', 32), 'hex'),
    '19100000-0000-4000-8000-000000000001',
    'share_link_copied'
  )->>'outcome',
  'link_not_found',
  'cross-play action fails closed'
);

select is(
  public.record_owner_share_action(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('ff', 32), 'hex'),
    '19100000-0000-4000-8000-000000000001',
    'share_link_copied'
  )->>'outcome',
  'not_found',
  'tampered owner capability records no share action'
);

select is(
  public.record_owner_share_action(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19300000-0000-4000-8000-000000000004',
    'share_link_copied'
  )->>'outcome',
  'link_not_active',
  'expired link converges before recording a share action'
);

select throws_ok(
  $$
    select public.record_owner_share_action(
      '19000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex'),
      '19100000-0000-4000-8000-000000000001',
      'unknown_event'
    )
  $$,
  '22023',
  'invalid share action input',
  'arbitrary share action names are rejected'
);

select throws_ok(
  $$
    select public.record_owner_share_action(
      '19000000-0000-4000-8000-000000000001',
      decode(repeat('11', 32), 'hex'),
      '19100000-0000-4000-8000-000000000001',
      null
    )
  $$,
  '22023',
  'invalid share action input',
  'null share action names are rejected before mutation'
);

select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(
      public.list_owner_share_links(
        '19000000-0000-4000-8000-000000000001',
        decode(repeat('11', 32), 'hex')
      )->'links'->0
    ) key
  ),
  array['consumedAt', 'expiresAt', 'id', 'kind', 'publicId', 'status']::text[],
  'owner link list fields are the exact allowlist'
);

select is(
  public.list_owner_share_links(
    '19000000-0000-4000-8000-000000000002',
    decode(repeat('22', 32), 'hex')
  )->'links',
  '[]'::jsonb,
  'another owner cannot list the first owner links'
);

select is(
  public.disable_share_link(
    '19000000-0000-4000-8000-000000000002',
    decode(repeat('22', 32), 'hex'),
    '19100000-0000-4000-8000-000000000001'
  )->>'outcome',
  'link_not_found',
  'cross-play disable fails closed'
);

select is(
  public.get_invite_metadata(
    'AAAAAAAAAAAAAAAAAAAAAA',
    decode(repeat('a1', 32), 'hex')
  )->>'outcome',
  'active',
  'valid public link returns active metadata'
);

select is(
  public.get_invite_metadata(
    'AAAAAAAAAAAAAAAAAAAAAA',
    decode(repeat('ee', 32), 'hex')
  )->>'outcome',
  'invalid',
  'wrong invite secret is indistinguishable from unknown'
);

select is(
  public.rotate_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000002',
    '19200000-0000-4000-8000-000000000003',
    'AAAAAAAAAAAAAAAAAAAAAA',
    decode(repeat('a1', 32), 'hex')
  )->>'outcome',
  'collision',
  'one-to-one rotate collision rolls back before disabling the original'
);

reset role;

select is(
  (
    select status
    from public.share_links
    where id = '19100000-0000-4000-8000-000000000002'
  ),
  'active',
  'one-to-one original remains active after a replacement collision'
);

select is(
  (
    select count(*)
    from public.share_links
    where id = '19200000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'one-to-one replacement collision creates no partial row'
);

select is(
  (
    select count(*)
    from public.analytics_events
    where event_name = 'share_link_created'
  ),
  2::bigint,
  'one-to-one replacement collision creates no analytics event'
);

set local role service_role;

select is(
  public.rotate_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000001',
    '19200000-0000-4000-8000-000000000001',
    'EEEEEEEEEEEEEEEEEEEEEA',
    decode(repeat('e5', 32), 'hex')
  )->>'outcome',
  'rotated',
  'rotate disables the old link and creates a replacement'
);

select is(
  public.rotate_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000001',
    '19200000-0000-4000-8000-000000000002',
    'FFFFFFFFFFFFFFFFFFFFFQ',
    decode(repeat('f6', 32), 'hex')
  )->>'outcome',
  'link_not_active',
  'a second rotate cannot create another replacement'
);

select is(
  public.disable_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19200000-0000-4000-8000-000000000001'
  )->>'outcome',
  'disabled',
  'owner disables the replacement link'
);

select is(
  public.disable_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19200000-0000-4000-8000-000000000001'
  )->>'outcome',
  'disabled',
  'disable retry is idempotent'
);

select is(
  public.record_owner_share_action(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19200000-0000-4000-8000-000000000001',
    'share_link_copied'
  )->>'outcome',
  'link_not_active',
  'disabled link cannot record a share action'
);

select is(
  public.get_invite_metadata(
    'EEEEEEEEEEEEEEEEEEEEEA',
    decode(repeat('e5', 32), 'hex')
  )->>'outcome',
  'unavailable',
  'disabled invite is unavailable'
);

select is(
  jsonb_build_object(
    'outcome', result->>'outcome',
    'kind', result->'link'->>'kind',
    'status', result->'link'->>'status'
  ),
  jsonb_build_object(
    'outcome', 'rotated',
    'kind', 'one_to_one',
    'status', 'active'
  ),
  'one-to-one rotate preserves kind and returns an active replacement'
)
from (
  select public.rotate_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000002',
    '19200000-0000-4000-8000-000000000003',
    'GGGGGGGGGGGGGGGGGGGGGA',
    decode(repeat('b7', 32), 'hex')
  ) as result
) rotated;

select is(
  public.get_invite_metadata(
    'BBBBBBBBBBBBBBBBBBBBBQ',
    decode(repeat('b2', 32), 'hex')
  )->>'outcome',
  'unavailable',
  'rotated one-to-one original is unavailable'
);

select is(
  public.rotate_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19100000-0000-4000-8000-000000000002',
    '19200000-0000-4000-8000-000000000004',
    'HHHHHHHHHHHHHHHHHHHHHQ',
    decode(repeat('c8', 32), 'hex')
  )->>'outcome',
  'link_not_active',
  'a second one-to-one rotate cannot create another replacement'
);

select is(
  public.disable_share_link(
    '19000000-0000-4000-8000-000000000001',
    decode(repeat('11', 32), 'hex'),
    '19200000-0000-4000-8000-000000000003'
  )->>'outcome',
  'disabled',
  'owner disables the one-to-one replacement'
);

select is(
  public.get_invite_metadata(
    'GGGGGGGGGGGGGGGGGGGGGA',
    decode(repeat('b7', 32), 'hex')
  )->>'outcome',
  'unavailable',
  'disabled one-to-one replacement is unavailable'
);

reset role;

select is(
  (
    select count(*)
    from public.share_links
    where id in (
      '19100000-0000-4000-8000-000000000003',
      '19100000-0000-4000-8000-000000000004',
      '19200000-0000-4000-8000-000000000002',
      '19200000-0000-4000-8000-000000000004'
    )
  ),
  0::bigint,
  'draft, tampered, and second rotate attempts create no rows'
);

select is(
  (
    select jsonb_agg(properties order by occurred_at, id)
    from public.analytics_events
    where event_name = 'share_link_created'
  ),
  '[
    {"packVersion":"old-friend-v1","linkKind":"public"},
    {"packVersion":"old-friend-v1","linkKind":"one_to_one"},
    {"packVersion":"old-friend-v1","linkKind":"public"},
    {"packVersion":"old-friend-v1","linkKind":"one_to_one"}
  ]'::jsonb,
  'share creation events contain only pack version and kind'
);

select is(
  (
    select count(*)
    from public.analytics_events
    where event_name = 'invite_opened'
  ),
  0::bigint,
  'invite metadata remains read-only before eligibility confirmation'
);

select is(
  (
    select jsonb_agg(
      jsonb_build_object('event', event_name, 'properties', properties)
      order by occurred_at, id
    )
    from public.analytics_events
    where event_name in ('share_handoff_succeeded', 'share_link_copied')
  ),
  '[
    {"event":"share_handoff_succeeded","properties":{"packVersion":"old-friend-v1","linkKind":"public"}},
    {"event":"share_link_copied","properties":{"packVersion":"old-friend-v1","linkKind":"one_to_one"}},
    {"event":"share_handoff_succeeded","properties":{"packVersion":"old-friend-v1","linkKind":"public","entrySource":"profile_reshare"}},
    {"event":"share_link_copied","properties":{"packVersion":"old-friend-v1","linkKind":"one_to_one","entrySource":"profile_reshare"}}
  ]'::jsonb,
  'share actions preserve legacy properties and add only the fixed profile source'
);

select is(
  (
    select management_expires_at
    from public.pack_plays
    where id = '19000000-0000-4000-8000-000000000003'
  ),
  timestamptz '2030-01-08 00:00:00+00',
  'draft share action does not renew owner management TTL'
);

select ok(
  (
    select management_expires_at
    from public.pack_plays
    where id = '19000000-0000-4000-8000-000000000001'
  ) > clock_timestamp() + interval '6 days 23 hours',
  'successful share actions renew the persisted owner TTL'
);

select is(
  (
    select status
    from public.share_links
    where id = '19300000-0000-4000-8000-000000000004'
  ),
  'expired',
  'expired action converges the link status without an event'
);

select is(
  (
    select jsonb_build_object(
      'status', status,
      'updatedAt', updated_at,
      'expiresAt', expires_at
    )
    from public.share_links
    where id = '19300000-0000-4000-8000-000000000003'
  ),
  jsonb_build_object(
    'status', 'active',
    'updatedAt', timestamptz '2030-01-01 00:00:00+00',
    'expiresAt', null
  ),
  'draft share action leaves link state and expiry unchanged'
);

select ok(
  (
    select count(*) = 1
      and bool_and(policy.roles = array['gyeop_internal_rpc']::name[])
      and bool_and(policy.cmd = 'INSERT')
      and bool_and(position('share_link_created' in policy.with_check) > 0)
      and bool_and(position('invite_opened' in policy.with_check) > 0)
      and bool_and(position('share_handoff_succeeded' in policy.with_check) > 0)
      and bool_and(position('share_link_copied' in policy.with_check) > 0)
      and bool_and(position('packVersion' in policy.with_check) > 0)
      and bool_and(position('linkKind' in policy.with_check) > 0)
      and bool_and(position('owner_play_id IS NOT NULL' in policy.with_check) > 0)
      and bool_and(position('share_link_id IS NOT NULL' in policy.with_check) > 0)
      and bool_and(position('properties - ARRAY[''packVersion''' in policy.with_check) > 0)
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'analytics_events'
      and policy.policyname = 'analytics_internal_insert_allowlist'
  ),
  'analytics RLS retains subject-aware share events and exact property keys'
);

select ok(
  (
    select count(*) = 1
      and bool_and(policy.roles = array['gyeop_internal_rpc']::name[])
      and bool_and(policy.cmd = 'INSERT')
      and bool_and(policy.permissive = 'RESTRICTIVE')
      and bool_and(position('relationshipCode' in policy.with_check) > 0)
      and bool_and(position('knownSinceCode' in policy.with_check) > 0)
      and bool_and(position('choice' in policy.with_check) > 0)
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'analytics_events'
      and policy.policyname = 'analytics_forbidden_payload_contract'
  ),
  'analytics RLS adds the exact restrictive privacy contract'
);

select * from finish();
rollback;
