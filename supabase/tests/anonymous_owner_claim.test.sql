begin;

select no_plan();

select has_table(
  'public',
  'anonymous_owners',
  'anonymous owner capability table exists'
);
select has_column(
  'public',
  'pack_plays',
  'anonymous_owner_id',
  'owner play references its anonymous owner'
);
select has_column(
  'public',
  'pack_plays',
  'owner_id',
  'owner play has the adopted Auth owner anchor'
);
select ok(
  not has_table_privilege('service_role', 'public.anonymous_owners', 'SELECT')
  and not has_table_privilege('anon', 'public.anonymous_owners', 'SELECT')
  and not has_table_privilege('authenticated', 'public.anonymous_owners', 'SELECT'),
  'API roles cannot read anonymous owner capabilities'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_anonymous_owner(uuid,bytea,uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.claim_anonymous_owner(uuid,bytea,uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.claim_anonymous_owner(uuid,bytea,uuid,jsonb)',
    'EXECUTE'
  ),
  'claim is exposed only through the internal server role'
);

insert into auth.users (
  id,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '32000000-0000-4000-8000-000000000001',
    'owner-one@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    clock_timestamp(),
    clock_timestamp()
  ),
  (
    '32000000-0000-4000-8000-000000000002',
    'owner-two@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    clock_timestamp(),
    clock_timestamp()
  );

set local role service_role;

select is(
  public.create_or_resume_play_with_source(
    'old-friend',
    null,
    null,
    '32000000-0000-4000-8000-000000000100',
    decode(repeat('41', 32), 'hex'),
    decode(repeat('42', 32), 'hex'),
    'home',
    null,
    null
  )->>'outcome',
  'created',
  'the first pack creates an anonymous owner and play'
);

select is(
  public.create_or_resume_play_with_source(
    'honest-self',
    '32000000-0000-4000-8000-000000000100',
    decode(repeat('41', 32), 'hex'),
    null,
    null,
    decode(repeat('43', 32), 'hex'),
    'home',
    null,
    null
  )->>'outcome',
  'created',
  'the same anonymous owner can start a second pack'
);

select is(
  public.create_or_resume_play_with_source(
    'old-friend',
    '32000000-0000-4000-8000-000000000100',
    decode(repeat('41', 32), 'hex'),
    null,
    null,
    decode(repeat('44', 32), 'hex'),
    'home',
    null,
    null
  )->>'outcome',
  'resumed',
  'returning to the first pack resumes it instead of replacing it'
);

select is(
  public.claim_anonymous_owner(
    '32000000-0000-4000-8000-000000000100',
    decode(repeat('41', 32), 'hex'),
    '32000000-0000-4000-8000-000000000001',
    '[{"keyVersion":"v1","hash":"fixture"}]'::jsonb
  )->>'outcome',
  'not_completed',
  'an owner without a completed pack cannot be claimed for sharing'
);

select is(
  public.create_claimed_share_link(
    '32000000-0000-4000-8000-000000000100',
    decode(repeat('41', 32), 'hex'),
    '32000000-0000-4000-8000-000000000200',
    'AAAAAAAAAAAAAAAAAAAAAA',
    decode(repeat('45', 32), 'hex'),
    'public',
    null
  )->>'outcome',
  'not_found',
  'an unclaimed owner cannot create a share link'
);

reset role;

select is(
  (
    select count(*)
    from public.pack_plays as play
    where play.anonymous_owner_id = '32000000-0000-4000-8000-000000000100'
  ),
  2::bigint,
  'both pack plays remain under the same anonymous owner'
);
select is(
  (
    select count(*)
    from public.share_links as link
    where link.pack_play_id = '32000000-0000-4000-8000-000000000100'
  ),
  0::bigint,
  'the rejected anonymous share attempt writes no row'
);

update public.pack_plays as play
set status = 'completed',
    current_position = 10,
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
where play.id = '32000000-0000-4000-8000-000000000100';

set local role service_role;

select is(
  public.claim_anonymous_owner(
    '32000000-0000-4000-8000-000000000100',
    decode(repeat('41', 32), 'hex'),
    '32000000-0000-4000-8000-000000000001',
    '[{"keyVersion":"v1","hash":"fixture"}]'::jsonb
  )->>'outcome',
  'claimed',
  'a completed anonymous owner is claimed without copying plays'
);
select is(
  public.claim_anonymous_owner(
    '32000000-0000-4000-8000-000000000100',
    decode(repeat('41', 32), 'hex'),
    '32000000-0000-4000-8000-000000000001',
    '[{"keyVersion":"v1","hash":"fixture"}]'::jsonb
  )->>'outcome',
  'claimed',
  'the same authenticated owner can retry claim idempotently'
);
select is(
  public.claim_anonymous_owner(
    '32000000-0000-4000-8000-000000000100',
    decode(repeat('41', 32), 'hex'),
    '32000000-0000-4000-8000-000000000002',
    '[{"keyVersion":"v1","hash":"fixture"}]'::jsonb
  )->>'outcome',
  'not_found',
  'a different authenticated owner cannot discover or take the claim'
);
select is(
  jsonb_array_length(
    public.list_authenticated_owner_plays(
      '32000000-0000-4000-8000-000000000001'
    )->'plays'
  ),
  2,
  'the authenticated owner lists both linked packs'
);
select is(
  public.get_authenticated_owner_play(
    '32000000-0000-4000-8000-000000000100',
    '32000000-0000-4000-8000-000000000002'
  )->>'outcome',
  'not_found',
  'a different authenticated owner cannot read the play'
);
select is(
  public.create_claimed_share_link(
    '32000000-0000-4000-8000-000000000100',
    decode(repeat('41', 32), 'hex'),
    '32000000-0000-4000-8000-000000000200',
    'AAAAAAAAAAAAAAAAAAAAAA',
    decode(repeat('45', 32), 'hex'),
    'public',
    null
  )->>'outcome',
  'created',
  'the claimed completed owner can create a share link'
);
select is(
  public.create_authenticated_share_link(
    '32000000-0000-4000-8000-000000000100',
    '32000000-0000-4000-8000-000000000002',
    '32000000-0000-4000-8000-000000000201',
    'BBBBBBBBBBBBBBBBBBBBBA',
    decode(repeat('46', 32), 'hex'),
    'public',
    null
  )->>'outcome',
  'not_found',
  'a different Auth actor cannot create a share link'
);
select is(
  public.create_authenticated_share_link(
    '32000000-0000-4000-8000-000000000100',
    '32000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000201',
    'BBBBBBBBBBBBBBBBBBBBBA',
    decode(repeat('46', 32), 'hex'),
    'public',
    null
  )->>'outcome',
  'created',
  'the fresh Auth actor can create a share link without a browser capability'
);

reset role;

update public.anonymous_owners as owner
set management_secret_hash = null,
    management_revoked_at = clock_timestamp(),
    updated_at = clock_timestamp()
where owner.id = '32000000-0000-4000-8000-000000000100';

set local role service_role;

select is(
  public.list_authenticated_share_links(
    '32000000-0000-4000-8000-000000000100',
    '32000000-0000-4000-8000-000000000001'
  )->>'outcome',
  'listed',
  'Auth access survives expiration or revocation of the anonymous capability'
);
select is(
  jsonb_array_length(
    public.list_authenticated_share_links(
      '32000000-0000-4000-8000-000000000100',
      '32000000-0000-4000-8000-000000000001'
    )->'links'
  ),
  2,
  'the authenticated owner lists both share links after capability recovery'
);

reset role;

select is(
  (
    select count(*)
    from public.pack_plays as play
    where play.anonymous_owner_id = '32000000-0000-4000-8000-000000000100'
      and play.owner_id = '32000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'claim atomically anchors every pack play to the same Auth user'
);
select is(
  (
    select count(*)
    from public.share_links as link
    where link.pack_play_id = '32000000-0000-4000-8000-000000000100'
  ),
  2::bigint,
  'the claimed capability and Auth paths create exactly their requested rows'
);

select * from finish();
rollback;
