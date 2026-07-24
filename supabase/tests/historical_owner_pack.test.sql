begin;

select no_plan();

insert into auth.users (
  id,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '15700000-0000-4000-8000-000000000001',
    'historical-owner@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    clock_timestamp(),
    clock_timestamp()
  ),
  (
    '15700000-0000-4000-8000-000000000002',
    'historical-other@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    clock_timestamp(),
    clock_timestamp()
  );

set local role service_role;

select is(
  public.create_or_resume_play(
    'old-friend',
    null,
    null,
    '15700000-0000-4000-8000-000000000101',
    decode(repeat('51', 32), 'hex'),
    decode(repeat('52', 32), 'hex')
  )->>'outcome',
  'created',
  'published current pack creates the historical fixture owner'
);

reset role;

update public.pack_plays
set owner_id = '15700000-0000-4000-8000-000000000001'
where id = '15700000-0000-4000-8000-000000000101';

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity
) values (
  '15700000-0000-4000-8000-000000000201',
  'historical-unpublished',
  '발행 전 질문팩',
  'old_friend',
  'low'
);

insert into public.pack_versions (id, template_id, version)
values (
  '15700000-0000-4000-8000-000000000202',
  '15700000-0000-4000-8000-000000000201',
  'historical-unpublished-v1'
);

insert into public.pack_cards (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
select
  '15700000-0000-4000-8000-000000000202',
  'unpublished-card-' || value,
  value,
  'Owner ' || value,
  'Visitor ' || value,
  'A ' || value,
  'B ' || value,
  value = 1
from generate_series(1, 10) as value;

with fixed_time as (select clock_timestamp() as value)
insert into public.pack_plays (
  id,
  pack_version_id,
  anonymous_owner_id,
  owner_id,
  management_expires_at,
  last_active_at,
  management_revoked_at,
  status,
  current_position
) select
  '15700000-0000-4000-8000-000000000102',
  '15700000-0000-4000-8000-000000000202',
  '15700000-0000-4000-8000-000000000101',
  '15700000-0000-4000-8000-000000000001',
  value + interval '7 days',
  value,
  value,
  'draft',
  1
from fixed_time;

set local role service_role;

select is(
  public.get_owner_play_pack(
    '15700000-0000-4000-8000-000000000101',
    decode(repeat('51', 32), 'hex')
  )->>'outcome',
  'authorized',
  'capability reads the exact published version attached to the play'
);

select is(
  public.get_owner_play_pack(
    '15700000-0000-4000-8000-000000000102',
    decode(repeat('51', 32), 'hex')
  )->>'outcome',
  'not_found',
  'capability fails closed for an unpublished exact version'
);

select is(
  public.get_authenticated_owner_play_pack(
    '15700000-0000-4000-8000-000000000101',
    '15700000-0000-4000-8000-000000000001'
  )->>'outcome',
  'authorized',
  'authenticated owner reads the exact published version'
);

select is(
  public.get_authenticated_owner_play_pack(
    '15700000-0000-4000-8000-000000000102',
    '15700000-0000-4000-8000-000000000001'
  )->>'outcome',
  'not_found',
  'authenticated owner fails closed for an unpublished exact version'
);

select is(
  public.get_authenticated_owner_play_pack(
    '15700000-0000-4000-8000-000000000101',
    '15700000-0000-4000-8000-000000000002'
  )->>'outcome',
  'not_found',
  'cross-owner authenticated read is indistinguishable from not found'
);

select is(
  public.get_authenticated_owner_play_pack(
    '15700000-0000-4000-8000-000000000199',
    '15700000-0000-4000-8000-000000000001'
  )->>'outcome',
  'not_found',
  'unknown authenticated read is indistinguishable from not found'
);

select is(
  public.get_published_pack('old-friend')->>'version',
  'old-friend-v3',
  'public slug lookup remains current-only'
);

reset role;

select * from finish();

rollback;
