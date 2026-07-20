begin;

select no_plan();

select has_table('public', 'pack_plays', 'owner play table exists');
select has_table('public', 'self_answers', 'self answer table exists');
select has_function(
  'public',
  'create_or_resume_play',
  array['text', 'uuid', 'bytea', 'uuid', 'bytea', 'bytea'],
  'create/resume RPC has the exact signature'
);
select has_function(
  'private',
  'authorize_owner_play_capability',
  array['uuid', 'bytea', 'boolean'],
  'private capability helper has the exact signature'
);

select ok(
  not has_schema_privilege('service_role', 'private', 'USAGE')
  and not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'private schema is not exposed to API roles'
);
select ok(
  has_schema_privilege('gyeop_internal_rpc', 'private', 'USAGE'),
  'only the internal RPC role can use private owner helpers'
);
select ok(
  not has_function_privilege(
    'service_role',
    'private.authorize_owner_play_capability(uuid,bytea,boolean)',
    'EXECUTE'
  )
  and has_function_privilege(
    'gyeop_internal_rpc',
    'private.authorize_owner_play_capability(uuid,bytea,boolean)',
    'EXECUTE'
  ),
  'capability helper execution is internal-only'
);

select ok(
  not has_table_privilege('service_role', 'public.pack_plays', 'SELECT')
  and not has_table_privilege('service_role', 'public.pack_plays', 'INSERT')
  and not has_table_privilege('service_role', 'public.pack_plays', 'UPDATE')
  and not has_table_privilege('service_role', 'public.pack_plays', 'DELETE')
  and not has_table_privilege('anon', 'public.self_answers', 'SELECT')
  and not has_table_privilege('authenticated', 'public.self_answers', 'UPDATE'),
  'API roles have no direct owner table privileges'
);
select ok(
  has_table_privilege('gyeop_internal_rpc', 'public.pack_plays', 'SELECT')
  and has_table_privilege('gyeop_internal_rpc', 'public.pack_plays', 'INSERT')
  and has_table_privilege('gyeop_internal_rpc', 'public.pack_plays', 'UPDATE')
  and not has_table_privilege('gyeop_internal_rpc', 'public.pack_plays', 'DELETE')
  and has_table_privilege('gyeop_internal_rpc', 'public.self_answers', 'SELECT')
  and has_table_privilege('gyeop_internal_rpc', 'public.self_answers', 'INSERT')
  and has_table_privilege('gyeop_internal_rpc', 'public.self_answers', 'UPDATE')
  and not has_table_privilege('gyeop_internal_rpc', 'public.self_answers', 'DELETE'),
  'internal owner table privileges are the exact allowlist'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.create_or_resume_play(text,uuid,bytea,uuid,bytea,bytea)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.create_or_resume_play(text,uuid,bytea,uuid,bytea,bytea)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_or_resume_play(text,uuid,bytea,uuid,bytea,bytea)',
    'EXECUTE'
  ),
  'only service_role can execute the public owner RPC'
);

set local role service_role;

select is(
  public.create_or_resume_play(
    'missing-pack',
    null,
    null,
    '17000000-0000-4000-8000-000000000001',
    decode(repeat('01', 32), 'hex'),
    decode(repeat('a1', 32), 'hex')
  )->>'outcome',
  'pack_not_found',
  'unknown pack returns the exact pack_not_found outcome'
);

reset role;

select is(
  (
    select count(*)
    from public.rate_limit_buckets
    where action = 'owner_draft_create'
      and key_hash = decode(repeat('a1', 32), 'hex')
  ),
  0::bigint,
  'pack_not_found does not consume the create bucket'
);
select is(
  (
    select count(*)
    from public.pack_plays
    where id = '17000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'pack_not_found does not create an owner play'
);

update public.pack_templates
set is_active = true
where slug = 'old-friend';

set local role service_role;

select is(
  (
    select count(*)
    from generate_series(1, 5) as attempt(number)
    where public.create_or_resume_play(
      'old-friend',
      null,
      null,
      md5('owner-quota-' || attempt.number::text)::uuid,
      decode(lpad(to_hex(attempt.number), 64, '0'), 'hex'),
      decode(repeat('b1', 32), 'hex')
    )->>'outcome' = 'created'
  ),
  5::bigint,
  'valid pack creates five plays inside the hourly quota'
);
select is(
  public.create_or_resume_play(
    'old-friend',
    null,
    null,
    '17000000-0000-4000-8000-000000000006',
    decode(repeat('06', 32), 'hex'),
    decode(repeat('b1', 32), 'hex')
  )->>'outcome',
  'rate_limited',
  'the sixth create returns rate_limited without raising'
);

reset role;

select is(
  (
    select count
    from public.rate_limit_buckets
    where action = 'owner_draft_create'
      and key_hash = decode(repeat('b1', 32), 'hex')
  ),
  5,
  'the blocked increment rolls back and leaves bucket count at five'
);
select is(
  (
    select count(*)
    from public.pack_plays
    where id = '17000000-0000-4000-8000-000000000006'
  ),
  0::bigint,
  'the blocked create leaves no play row'
);

set local role service_role;

select is(
  public.create_or_resume_play(
    'old-friend',
    null,
    null,
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('10', 32), 'hex'),
    decode(repeat('c1', 32), 'hex')
  )->>'outcome',
  'created',
  'a main owner play is created'
);
select is(
  (
    public.get_owner_play(
      '17000000-0000-4000-8000-000000000100',
      decode(repeat('10', 32), 'hex')
    )->'play'->>'managementTtlSeconds'
  )::integer,
  604800,
  'authorized touch returns exact seven-day TTL'
);
select is(
  public.create_or_resume_play(
    'old-friend',
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('10', 32), 'hex'),
    null,
    null,
    decode(repeat('c1', 32), 'hex')
  )->>'outcome',
  'resumed',
  'a valid same-play credential resumes the existing play'
);
select is(
  public.create_or_resume_play(
    'another-pack',
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('10', 32), 'hex'),
    null,
    null,
    decode(repeat('c1', 32), 'hex')
  )->>'outcome',
  'pack_not_found',
  'a valid capability still reports an unknown pack without replacing data'
);
select is(
  public.get_owner_play(
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('11', 32), 'hex')
  )->>'outcome',
  'not_found',
  'a wrong secret cannot read an existing play'
);
select is(
  public.save_owner_answer(
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('10', 32), 'hex'),
    'unknown-card',
    'a',
    1::smallint
  )->>'outcome',
  'invalid_card',
  'an unknown card fails without creating an answer'
);
select is(
  public.save_owner_answer(
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('10', 32), 'hex'),
    'conflict',
    'a',
    2::smallint
  )->>'outcome',
  'saved',
  'a valid card saves idempotently'
);
select is(
  public.complete_owner_play(
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('10', 32), 'hex')
  )->>'outcome',
  'incomplete',
  'fewer than ten answers cannot complete the play'
);

reset role;

select is(
  (
    select count(*)
    from public.pack_cards as card
    where card.pack_version_id = '15151515-1515-4515-8515-151515151515'
      and card.id <> 'conflict'
      and public.save_owner_answer(
        '17000000-0000-4000-8000-000000000100',
        decode(repeat('10', 32), 'hex'),
        card.id,
        'b',
        card.position
      )->>'outcome' = 'saved'
  ),
  9::bigint,
  'the remaining nine valid cards save successfully'
);

set local role service_role;

select is(
  public.complete_owner_play(
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('10', 32), 'hex')
  )->>'outcome',
  'completed',
  'exactly ten answers complete the play'
);
select is(
  public.save_owner_answer(
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('10', 32), 'hex'),
    'conflict',
    'b',
    10::smallint
  )->>'outcome',
  'completed',
  'completed play save converges to the completed outcome'
);

reset role;

select throws_ok(
  $$
    update public.self_answers
    set choice = 'b'
    where pack_play_id = '17000000-0000-4000-8000-000000000100'
      and card_id = 'conflict'
  $$,
  '55000',
  'completed owner answers are immutable',
  'completed answers are immutable even through direct SQL'
);

set local role service_role;

select is(
  public.create_or_resume_play(
    'old-friend',
    null,
    null,
    '17000000-0000-4000-8000-000000000200',
    decode(repeat('20', 32), 'hex'),
    decode(repeat('d1', 32), 'hex')
  )->>'outcome',
  'created',
  'an expiry fixture play is created'
);

reset role;

with fixed_time as (
  select clock_timestamp() - interval '8 days' as value
)
update public.pack_plays as play
set last_active_at = fixed_time.value,
    management_expires_at = fixed_time.value + interval '7 days',
    updated_at = fixed_time.value
from fixed_time
where play.id = '17000000-0000-4000-8000-000000000200';

set local role service_role;

select is(
  public.get_owner_play(
    '17000000-0000-4000-8000-000000000200',
    decode(repeat('20', 32), 'hex')
  )->>'outcome',
  'expired',
  'an exact expired credential returns expired'
);

reset role;

select ok(
  (
    select management_secret_hash is null
      and management_revoked_at is not null
    from public.pack_plays
    where id = '17000000-0000-4000-8000-000000000200'
  ),
  'expiry removes the recoverable management hash'
);

set local role service_role;

select is(
  public.revoke_owner_play_session(
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('10', 32), 'hex')
  ),
  true,
  'logout revokes an exact live credential'
);
select is(
  public.revoke_owner_play_session(
    '17000000-0000-4000-8000-000000000100',
    decode(repeat('10', 32), 'hex')
  ),
  false,
  'repeated logout does not reveal additional state'
);

reset role;

select ok(
  (
    select management_secret_hash is null
      and management_revoked_at is not null
    from public.pack_plays
    where id = '17000000-0000-4000-8000-000000000100'
  ),
  'logout removes the management hash and records revocation'
);

select * from finish();

rollback;
