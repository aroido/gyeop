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
  'profile_incomplete',
  'an authenticated owner must complete the public nickname first'
);
select is(
  public.get_authenticated_owner_public_profile(
    '32000000-0000-4000-8000-000000000001'
  )->>'outcome',
  'incomplete',
  'the owner profile gate distinguishes a confirmed missing profile'
);
select is(
  public.set_authenticated_owner_nickname(
    '32000000-0000-4000-8000-000000000001',
    'GYEOP 09'
  )->>'nickname',
  'GYEOP 09',
  'the saved nickname uses the canonical application-boundary value'
);
select is(
  public.get_authenticated_owner_public_profile(
    '32000000-0000-4000-8000-000000000001'
  )->>'outcome',
  'complete',
  'the profile gate becomes complete after nickname save'
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

select is(
  (
    select link.preview_nickname
    from public.share_links as link
    where link.id = '32000000-0000-4000-8000-000000000201'
  ),
  'GYEOP 09',
  'authenticated link creation snapshots the current nickname'
);
select ok(
  (
    select link.expires_at between
      clock_timestamp() + interval '29 days 23 hours'
      and clock_timestamp() + interval '30 days 1 minute'
    from public.share_links as link
    where link.id = '32000000-0000-4000-8000-000000000201'
  ),
  'a new authenticated public link stores a real 30-day expiry'
);
select is(
  public.get_invite_preview('BBBBBBBBBBBBBBBBBBBBBA')->>'previewNickname',
  'GYEOP 09',
  'the read-only preview returns only the snapshotted nickname context'
);
update public.share_links as link
set status = 'disabled'
where link.id = '32000000-0000-4000-8000-000000000201';
select is(
  (
    select link.preview_nickname
    from public.share_links as link
    where link.id = '32000000-0000-4000-8000-000000000201'
  ),
  null,
  'active-to-inactive state changes clear nickname material in the same update'
);
select is(
  public.get_invite_preview('BBBBBBBBBBBBBBBBBBBBBA')->>'outcome',
  'unavailable',
  'an inactive link has no public preview'
);

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
  public.save_authenticated_owner_answer(
    (
      select play.id
      from public.pack_plays as play
      where play.anonymous_owner_id = '32000000-0000-4000-8000-000000000100'
        and play.id <> '32000000-0000-4000-8000-000000000100'
    ),
    '32000000-0000-4000-8000-000000000002',
    'honest-self-v1-card-01',
    'a',
    2::smallint
  )->>'outcome',
  'not_found',
  'a different Auth actor cannot continue the linked draft'
);
select is(
  (
    select count(*)
    from (
      select public.save_authenticated_owner_answer(
        play.id,
        '32000000-0000-4000-8000-000000000001',
        card.id,
        'a',
        least(card.position + 1, 10)::smallint
      ) as result
      from public.pack_plays as play
      join public.pack_cards as card
        on card.pack_version_id = play.pack_version_id
      where play.anonymous_owner_id = '32000000-0000-4000-8000-000000000100'
        and play.id <> '32000000-0000-4000-8000-000000000100'
    ) as saved
    where saved.result->>'outcome' = 'saved'
  ),
  10::bigint,
  'the authenticated owner saves every answer in a linked draft'
);
select is(
  public.complete_authenticated_owner_play(
    (
      select play.id
      from public.pack_plays as play
      where play.anonymous_owner_id = '32000000-0000-4000-8000-000000000100'
        and play.id <> '32000000-0000-4000-8000-000000000100'
    ),
    '32000000-0000-4000-8000-000000000001'
  )->>'outcome',
  'completed',
  'the authenticated owner completes the linked draft without an anonymous cookie'
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
