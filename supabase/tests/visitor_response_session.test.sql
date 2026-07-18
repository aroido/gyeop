begin;

select no_plan();

select has_table('public', 'visitor_responses', 'visitor response table exists');
select has_function(
  'public',
  'start_response',
  array[
    'text', 'bytea', 'text', 'uuid', 'bytea', 'uuid', 'bytea', 'text', 'text', 'bytea'
  ],
  'start response RPC has the exact signature'
);

select ok(
  not has_table_privilege('service_role', 'public.visitor_responses', 'SELECT')
  and not has_table_privilege('service_role', 'public.visitor_responses', 'INSERT')
  and not has_table_privilege('service_role', 'public.visitor_responses', 'UPDATE')
  and not has_table_privilege('anon', 'public.visitor_responses', 'SELECT')
  and not has_table_privilege('authenticated', 'public.visitor_responses', 'SELECT'),
  'API roles have no direct visitor response table access'
);
select ok(
  has_table_privilege('gyeop_internal_rpc', 'public.visitor_responses', 'SELECT')
  and has_table_privilege('gyeop_internal_rpc', 'public.visitor_responses', 'INSERT')
  and has_table_privilege('gyeop_internal_rpc', 'public.visitor_responses', 'UPDATE')
  and not has_table_privilege('gyeop_internal_rpc', 'public.visitor_responses', 'DELETE'),
  'internal role has the exact visitor response table allowlist'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.start_response(text,bytea,text,uuid,bytea,uuid,bytea,text,text,bytea)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.start_response(text,bytea,text,uuid,bytea,uuid,bytea,text,text,bytea)',
    'EXECUTE'
  ),
  'only service role executes start response'
);
select is(
  (
    select array_agg(policyname order by policyname)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'visitor_responses'
  ),
  array[
    'visitor_responses_internal_insert',
    'visitor_responses_internal_select',
    'visitor_responses_internal_update'
  ]::name[],
  'visitor response RLS policy inventory is exact'
);

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
  '22000000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  decode(repeat('10', 32), 'hex'),
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
  secret_hash
) values
  (
    '22100000-0000-4000-8000-000000000001',
    'AAAAAAAAAAAAAAAAAAAAAA',
    '22000000-0000-4000-8000-000000000001',
    'public',
    decode(repeat('11', 32), 'hex')
  ),
  (
    '22100000-0000-4000-8000-000000000002',
    'BBBBBBBBBBBBBBBBBBBBBQ',
    '22000000-0000-4000-8000-000000000001',
    'one_to_one',
    decode(repeat('12', 32), 'hex')
  );

select throws_ok(
  $$
    select public.start_response(
      'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('11', 32), 'hex'), null,
      null, null, null, null, null, null, decode(repeat('20', 32), 'hex')
    )
  $$,
  '22023',
  'invalid response start input',
  'null intent is rejected'
);
select throws_ok(
  $$
    select public.start_response(
      'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('11', 32), 'hex'), 'start',
      null, null, '22200000-0000-4000-8000-000000000001',
      decode(repeat('21', 32), 'hex'), null, 'not_sure',
      decode(repeat('20', 32), 'hex')
    )
  $$,
  '22023',
  'invalid response start input',
  'null relationship code is rejected before mutation'
);

select is(
  public.start_response(
    'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('11', 32), 'hex'), 'resume',
    null, null, null, null, null, null, decode(repeat('20', 32), 'hex')
  )->>'outcome',
  'no_session',
  'initial resume returns no session'
);
select is(
  (
    select count(*)
    from public.rate_limit_buckets
    where key_hash = decode(repeat('20', 32), 'hex')
      and action = 'response_start'
  ),
  0::bigint,
  'initial resume consumes no quota'
);
select is(
  public.start_response(
    'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('ff', 32), 'hex'), 'resume',
    null, null, null, null, null, null, decode(repeat('20', 32), 'hex')
  )->>'outcome',
  'unavailable',
  'wrong share secret is unavailable'
);
select is(
  public.start_response(
    'BBBBBBBBBBBBBBBBBBBBBQ', decode(repeat('12', 32), 'hex'), 'resume',
    null, null, null, null, null, null, decode(repeat('20', 32), 'hex')
  )->>'outcome',
  'unavailable',
  'one-to-one links remain unavailable in issue 22'
);

select is(
  public.start_response(
    'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('11', 32), 'hex'), 'start',
    null, null, '22200000-0000-4000-8000-000000000001',
    decode(repeat('21', 32), 'hex'), 'old_friend', 'ten_years_or_more',
    decode(repeat('20', 32), 'hex')
  )->>'outcome',
  'created',
  'public visitor starts a draft response'
);
select is(
  (
    select jsonb_build_object(
      'link', share_link_id,
      'pack', pack_version_id,
      'relationship', relationship_code,
      'knownSince', known_since_code,
      'status', status,
      'sessionBytes', octet_length(session_token_hash),
      'fixedExpirySeconds', extract(epoch from (session_expires_at - created_at)),
      'managementHash', management_token_hash,
      'submittedAt', submitted_at,
      'withdrawnAt', withdrawn_at
    )
    from public.visitor_responses
    where id = '22200000-0000-4000-8000-000000000001'
  ),
  jsonb_build_object(
    'link', '22100000-0000-4000-8000-000000000001'::uuid,
    'pack', '15151515-1515-4515-8515-151515151515'::uuid,
    'relationship', 'old_friend',
    'knownSince', 'ten_years_or_more',
    'status', 'draft',
    'sessionBytes', 32,
    'fixedExpirySeconds', 86400,
    'managementHash', null,
    'submittedAt', null,
    'withdrawnAt', null
  ),
  'response stores only the fixed draft session state'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_object(
        'event', event_name,
        'responseId', visitor_response_id,
        'properties', properties
      ) order by occurred_at, event_name
    )
    from public.analytics_events
    where visitor_response_id = '22200000-0000-4000-8000-000000000001'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'event', 'relationship_selected',
      'responseId', '22200000-0000-4000-8000-000000000001'::uuid,
      'properties', jsonb_build_object(
        'packVersion', 'old-friend-v1',
        'linkKind', 'public',
        'relationshipCode', 'old_friend',
        'knownSinceCode', 'ten_years_or_more'
      )
    ),
    jsonb_build_object(
      'event', 'visitor_response_started',
      'responseId', '22200000-0000-4000-8000-000000000001'::uuid,
      'properties', jsonb_build_object(
        'packVersion', 'old-friend-v1',
        'linkKind', 'public'
      )
    )
  ),
  'new response writes the two exact DB-derived analytics events'
);

select is(
  public.start_response(
    'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('11', 32), 'hex'), 'start',
    '22200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    '22200000-0000-4000-8000-000000000002', decode(repeat('22', 32), 'hex'),
    'family', 'under_one_year', decode(repeat('20', 32), 'hex')
  )->>'outcome',
  'resumed',
  'duplicate start resumes the authoritative response'
);
select is(
  (
    select relationship_code || ':' || known_since_code
    from public.visitor_responses
    where id = '22200000-0000-4000-8000-000000000001'
  ),
  'old_friend:ten_years_or_more',
  'duplicate start cannot overwrite saved relationship context'
);
select is(
  (
    select count(*)
    from public.analytics_events
    where visitor_response_id = '22200000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'duplicate start records no duplicate events'
);

select is(
  public.start_response(
    'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('11', 32), 'hex'), 'resume',
    '22200000-0000-4000-8000-000000000001', decode(repeat('ff', 32), 'hex'),
    null, null, null, null, decode(repeat('20', 32), 'hex')
  )->>'outcome',
  'session_invalid',
  'tampered response session fails closed'
);

select is(
  public.start_response(
    'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('11', 32), 'hex'), 'start',
    null, null, '22200000-0000-4000-8000-000000000001',
    decode(repeat('30', 32), 'hex'), 'family', 'not_sure',
    decode(repeat('31', 32), 'hex')
  )->>'outcome',
  'collision',
  'credential collision is reported without partial mutation'
);
select is(
  (
    select count(*)
    from public.rate_limit_buckets
    where key_hash = decode(repeat('31', 32), 'hex')
      and action = 'response_start'
  ),
  0::bigint,
  'collision rolls back its rate bucket mutation'
);

do $quota$
declare
  v_index integer;
begin
  for v_index in 2..10 loop
    perform public.start_response(
      'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('11', 32), 'hex'), 'start',
      null, null,
      ('22200000-0000-4000-8000-' || lpad(v_index::text, 12, '0'))::uuid,
      decode(lpad(to_hex(v_index + 32), 2, '0') || repeat('00', 31), 'hex'),
      'school_friend', 'one_to_three_years', decode(repeat('20', 32), 'hex')
    );
  end loop;
end
$quota$;

select is(
  public.start_response(
    'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('11', 32), 'hex'), 'start',
    null, null, '22200000-0000-4000-8000-000000000011',
    decode(repeat('40', 32), 'hex'), 'other', 'not_sure',
    decode(repeat('20', 32), 'hex')
  )->>'outcome',
  'rate_limited',
  'eleventh start in one fixed window is rate limited'
);
select is(
  (
    select count
    from public.rate_limit_buckets
    where key_hash = decode(repeat('20', 32), 'hex')
      and action = 'response_start'
  ),
  10,
  'over-limit increment rolls back and leaves bucket at ten'
);
select is(
  (
    select count(*)
    from public.visitor_responses
    where share_link_id = '22100000-0000-4000-8000-000000000001'
  ),
  10::bigint,
  'rate-limited request leaves no response row'
);

select * from finish();
rollback;
