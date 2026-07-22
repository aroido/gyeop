begin;

select no_plan();

select has_table('public', 'visitor_answers', 'visitor answers table exists');
select has_function(
  'public',
  'start_required_response',
  array[
    'text', 'bytea', 'text', 'uuid', 'bytea', 'uuid', 'bytea', 'text', 'text', 'bytea'
  ],
  'required response start RPC has the exact signature'
);
select has_function(
  'public',
  'get_visitor_response',
  array['uuid', 'bytea'],
  'visitor response read RPC has the exact signature'
);
select has_function(
  'public',
  'save_response_answer',
  array['uuid', 'bytea', 'text', 'text'],
  'visitor answer save RPC has the exact signature'
);
select has_function(
  'public',
  'submit_response',
  array['uuid', 'bytea', 'bytea'],
  'visitor submit RPC has the exact signature'
);
select has_function(
  'public',
  'record_visitor_response_event',
  array['uuid', 'bytea', 'text'],
  'visitor screen event RPC has the exact signature'
);

select ok(
  not has_table_privilege('service_role', 'public.visitor_answers', 'SELECT')
  and not has_table_privilege('service_role', 'public.visitor_answers', 'INSERT')
  and not has_table_privilege('anon', 'public.visitor_answers', 'SELECT')
  and not has_table_privilege('authenticated', 'public.visitor_answers', 'SELECT'),
  'API roles have no direct visitor answer access'
);
select ok(
  has_table_privilege('gyeop_internal_rpc', 'public.visitor_answers', 'SELECT')
  and has_table_privilege('gyeop_internal_rpc', 'public.visitor_answers', 'INSERT')
  and has_table_privilege('gyeop_internal_rpc', 'public.visitor_answers', 'UPDATE')
    and has_table_privilege('gyeop_internal_rpc', 'public.visitor_answers', 'DELETE'),
  'internal RPC role has only required visitor answer privileges'
);
select ok(
  has_function_privilege('service_role', 'public.get_visitor_response(uuid,bytea)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.save_response_answer(uuid,bytea,text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.submit_response(uuid,bytea,bytea)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.record_visitor_response_event(uuid,bytea,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.submit_response(uuid,bytea,bytea)', 'EXECUTE'),
  'only the service boundary can execute visitor response RPCs'
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
) select
  '24000000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  decode(repeat('10', 32), 'hex'),
  value + interval '7 days',
  value,
  'draft',
  10
from fixed_time;

insert into public.self_answers (
  pack_play_id,
  pack_version_id,
  card_id,
  choice
)
select
  '24000000-0000-4000-8000-000000000001',
  '15151515-1515-4515-8515-151515151515',
  card.id,
  'a'
from public.pack_cards as card
where card.pack_version_id = '15151515-1515-4515-8515-151515151515';

update public.pack_plays
set status = 'completed',
    completed_at = clock_timestamp()
where id = '24000000-0000-4000-8000-000000000001';

insert into public.share_links (
  id,
  public_id,
  pack_play_id,
  kind,
  secret_hash,
  status
) values
  (
    '24100000-0000-4000-8000-000000000001',
    'IIIIIIIIIIIIIIIIIIIIIA',
    '24000000-0000-4000-8000-000000000001',
    'public',
    decode(repeat('11', 32), 'hex'),
    'active'
  ),
  (
    '24100000-0000-4000-8000-000000000002',
    'JJJJJJJJJJJJJJJJJJJJJQ',
    '24000000-0000-4000-8000-000000000001',
    'one_to_one',
    decode(repeat('12', 32), 'hex'),
    'active'
  );

select is(
  public.start_required_response(
    'IIIIIIIIIIIIIIIIIIIIIA', decode(repeat('11', 32), 'hex'), 'start',
    null, null,
    '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    'old_friend', 'ten_years_or_more', decode(repeat('31', 32), 'hex')
  )->>'outcome',
  'created',
  'public required response starts with three assigned cards'
);
select is(
  jsonb_array_length(
    public.get_visitor_response(
      '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex')
    )->'response'->'assignments'
  ),
  3,
  'authorized read returns exactly three assignments'
);
select is(
  public.get_visitor_response(
    '24200000-0000-4000-8000-000000000001', decode(repeat('ff', 32), 'hex')
  )->>'outcome',
  'session_invalid',
  'wrong response session is unavailable'
);
select is(
  public.save_response_answer(
    '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    'not-assigned', 'a'
  )->>'outcome',
  'invalid_card',
  'unassigned card cannot be saved'
);
select is(
  public.submit_response(
    '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    decode(repeat('41', 32), 'hex')
  )->>'outcome',
  'incomplete',
  'response cannot submit before all three answers exist'
);

select is(
  public.save_response_answer(
    '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    assignment.card_id,
    case when assignment.position = 1 then 'b' else 'a' end
  )->>'outcome',
  'saved',
  'each assigned answer saves'
)
from public.visitor_assignments as assignment
where assignment.response_id = '24200000-0000-4000-8000-000000000001'
order by assignment.position;

select is(
  public.submit_response(
    '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    decode(repeat('41', 32), 'hex')
  )->>'outcome',
  'submitted',
  'three saved answers submit atomically'
);
select is(
  (
    select jsonb_build_object(
      'status', response.status,
      'managementBytes', octet_length(management_token_hash),
      'sessionFollowsSubmit', response.session_expires_at = response.submitted_at + interval '24 hours',
      'submitted', submitted_at is not null,
      'linkStatus', link.status,
      'eventCount', count(event.id)
    )
    from public.visitor_responses as response
    join public.share_links as link on link.id = response.share_link_id
    left join public.analytics_events as event
      on event.visitor_response_id = response.id
      and event.event_name = 'visitor_required_submitted'
    where response.id = '24200000-0000-4000-8000-000000000001'
    group by
      response.status,
      response.management_token_hash,
      response.session_expires_at,
      response.submitted_at,
      link.status
  ),
  jsonb_build_object(
    'status', 'submitted',
    'managementBytes', 32,
    'sessionFollowsSubmit', true,
    'submitted', true,
    'linkStatus', 'active',
    'eventCount', 1
  ),
  'public submit stores only the hash, keeps the link active, and records one event'
);
select is(
  (
    select jsonb_build_object(
      'allMatched', state->'allMatched',
      'highlightPosition', (
        select item->'position'
        from jsonb_array_elements(state->'assignments') as item
        where item->>'isHighlight' = 'true'
      ),
      'ownerChoice', state->'assignments'->0->'ownerChoice',
      'visitorChoice', state->'assignments'->0->'visitorChoice'
    )
    from (
      select public.get_visitor_response(
        '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex')
      )->'response' as state
    ) as submitted
  ),
  jsonb_build_object(
    'allMatched', false,
    'highlightPosition', 1,
    'ownerChoice', 'a',
    'visitorChoice', 'b'
  ),
  'submitted read reveals only the three-card comparison and highlights Signature first'
);
select is(
  public.submit_response(
    '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    decode(repeat('42', 32), 'hex')
  )->>'outcome',
  'conflict',
  'repeat submit cannot rotate the stored management capability'
);
select is(
  encode(
    (
      select management_token_hash
      from public.visitor_responses
      where id = '24200000-0000-4000-8000-000000000001'
    ),
    'hex'
  ),
  repeat('41', 32),
  'repeat submit preserves the first management hash'
);

select is(
  public.record_visitor_response_event(
    '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    'comparison_viewed'
  )->>'outcome',
  'recorded',
  'comparison view event records'
);
select is(
  public.record_visitor_response_event(
    '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    'comparison_viewed'
  )->>'outcome',
  'recorded',
  'duplicate comparison view remains a success'
);
select is(
  (
    select count(*)
    from public.analytics_events
    where visitor_response_id = '24200000-0000-4000-8000-000000000001'
      and event_name = 'comparison_viewed'
  ),
  1::bigint,
  'comparison view is stored at most once'
);

create unique index analytics_test_other_unique_idx
  on public.analytics_events (visitor_response_id)
  where visitor_response_id = '24200000-0000-4000-8000-000000000001'
    and event_name in ('comparison_viewed', 'same_pack_start_clicked');
select throws_ok(
  $$
    select public.record_visitor_response_event(
      '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
      'same_pack_start_clicked'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "analytics_test_other_unique_idx"',
  'event RPC rethrows unique violations from every non-idempotency constraint'
);
drop index analytics_test_other_unique_idx;
select is(
  public.record_visitor_response_event(
    '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    'same_pack_start_clicked'
  )->>'outcome',
  'recorded',
  'same-pack click records after the unrelated conflict is removed'
);
select is(
  public.record_visitor_response_event(
    '24200000-0000-4000-8000-000000000001', decode(repeat('21', 32), 'hex'),
    'same_pack_start_clicked'
  )->>'outcome',
  'recorded',
  'duplicate same-pack click remains a success'
);
select is(
  (
    select count(*)
    from public.analytics_events
    where visitor_response_id = '24200000-0000-4000-8000-000000000001'
      and event_name = 'same_pack_start_clicked'
  ),
  1::bigint,
  'same-pack click is stored at most once'
);

select is(
  public.start_required_response(
    'JJJJJJJJJJJJJJJJJJJJJQ', decode(repeat('12', 32), 'hex'), 'start',
    null, null,
    '24200000-0000-4000-8000-000000000002', decode(repeat('22', 32), 'hex'),
    'school_friend', 'five_to_ten_years', decode(repeat('32', 32), 'hex')
  )->>'outcome',
  'created',
  'one-to-one response starts while its link is active'
);
select public.save_response_answer(
  '24200000-0000-4000-8000-000000000002', decode(repeat('22', 32), 'hex'),
  assignment.card_id, 'a'
)
from public.visitor_assignments as assignment
where assignment.response_id = '24200000-0000-4000-8000-000000000002';
select is(
  public.submit_response(
    '24200000-0000-4000-8000-000000000002', decode(repeat('22', 32), 'hex'),
    decode(repeat('43', 32), 'hex')
  )->>'outcome',
  'submitted',
  'one-to-one response submits'
);
select is(
  (
    select status || ':' || (consumed_response_id = '24200000-0000-4000-8000-000000000002')::text
    from public.share_links
    where id = '24100000-0000-4000-8000-000000000002'
  ),
  'disabled:true',
  'one-to-one submit consumes the link for that response'
);
select ok(
  (
    select count(*) = 2
      and bool_and(
        link ?& array['id', 'publicId', 'kind', 'status', 'expiresAt', 'consumedAt']
        and link - array['id', 'publicId', 'kind', 'status', 'expiresAt', 'consumedAt'] = '{}'::jsonb
        and link->'consumedAt' = 'null'::jsonb
        and not link ? 'consumedResponseId'
      )
      and bool_or(link->>'publicId' = 'IIIIIIIIIIIIIIIIIIIIIA' and link->>'status' = 'active')
      and bool_or(link->>'publicId' = 'JJJJJJJJJJJJJJJJJJJJJQ' and link->>'status' = 'disabled')
      and bool_and(link::text not like '%24200000-0000-4000-8000-000000000002%')
    from jsonb_array_elements(
      public.list_owner_share_links(
        '24000000-0000-4000-8000-000000000001',
        decode(repeat('10', 32), 'hex')
      )->'links'
    ) as listed(link)
  ),
  'current and rollback owner readers receive strict active or disabled rows without consumption identifiers'
);
select is(
  public.start_required_response(
    'JJJJJJJJJJJJJJJJJJJJJQ', decode(repeat('12', 32), 'hex'), 'resume',
    '24200000-0000-4000-8000-000000000002', decode(repeat('22', 32), 'hex'),
    null, null, null, null, decode(repeat('32', 32), 'hex')
  )->>'outcome',
  'resumed',
  'owning response resumes through its consumed one-to-one link'
);
select is(
  public.start_required_response(
    'JJJJJJJJJJJJJJJJJJJJJQ', decode(repeat('12', 32), 'hex'), 'start',
    null, null,
    '24200000-0000-4000-8000-000000000003', decode(repeat('23', 32), 'hex'),
    'other', 'not_sure', decode(repeat('33', 32), 'hex')
  )->>'outcome',
  'unavailable',
  'consumed one-to-one link rejects every new response'
);

select * from finish();

rollback;
