begin;

alter table public.visitor_responses
  add constraint visitor_responses_id_pack_version_key
  unique (id, pack_version_id);

create table public.visitor_assignments (
  response_id uuid not null,
  pack_version_id uuid not null,
  card_id text not null,
  stage text not null check (stage = 'required'),
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default clock_timestamp(),
  primary key (response_id, card_id),
  unique (response_id, stage, position),
  foreign key (response_id, pack_version_id)
    references public.visitor_responses (id, pack_version_id)
    on update restrict
    on delete cascade,
  foreign key (pack_version_id, card_id)
    references public.pack_cards (pack_version_id, id)
    on update restrict
    on delete restrict
);

alter table public.visitor_assignments enable row level security;

grant select, insert on table public.visitor_assignments
  to gyeop_internal_rpc;

create policy visitor_assignments_internal_select
  on public.visitor_assignments
  for select
  to gyeop_internal_rpc
  using (true);

create policy visitor_assignments_internal_insert
  on public.visitor_assignments
  for insert
  to gyeop_internal_rpc
  with check (true);

create or replace function private.assign_required_response_cards(
  p_response_id uuid,
  p_pack_play_id uuid,
  p_pack_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment_count integer;
  v_position_count integer;
  v_signature_count integer;
begin
  if p_response_id is null
    or p_pack_play_id is null
    or p_pack_version_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'invalid required assignment input';
  end if;

  perform 1
  from public.visitor_responses as response
  join public.share_links as link
    on link.id = response.share_link_id
  where response.id = p_response_id
    and response.pack_version_id = p_pack_version_id
    and link.pack_play_id = p_pack_play_id
  for update of response;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'required assignment response binding not found';
  end if;

  with candidate_cards as (
    select
      card.id,
      card.position,
      card.is_signature,
      (
        select count(*)
        from public.visitor_assignments as prior_assignment
        join public.visitor_responses as prior_response
          on prior_response.id = prior_assignment.response_id
        join public.share_links as prior_link
          on prior_link.id = prior_response.share_link_id
        where prior_assignment.pack_version_id = card.pack_version_id
          and prior_assignment.card_id = card.id
          and prior_assignment.stage = 'required'
          and prior_response.status = 'submitted'
          and prior_link.pack_play_id = p_pack_play_id
      ) as submitted_sample_count,
      pg_catalog.sha256(
        convert_to('gyeop-required-assignment-v1', 'UTF8')
        || decode('00', 'hex')
        || convert_to(p_response_id::text, 'UTF8')
        || decode('00', 'hex')
        || convert_to(card.id, 'UTF8')
      ) as tie_hash
    from public.pack_cards as card
    where card.pack_version_id = p_pack_version_id
  ),
  selected_cards as (
    select
      card.id,
      1::smallint as assignment_position
    from candidate_cards as card
    where card.is_signature

    union all

    select
      candidate.id,
      (candidate.selection_position + 1)::smallint as assignment_position
    from (
      select
        card.id,
        row_number() over (
          order by
            card.submitted_sample_count,
            card.tie_hash,
            card.position,
            card.id
        ) as selection_position
      from candidate_cards as card
      where not card.is_signature
      order by
        card.submitted_sample_count,
        card.tie_hash,
        card.position,
        card.id
      limit 2
    ) as candidate
  )
  insert into public.visitor_assignments (
    response_id,
    pack_version_id,
    card_id,
    stage,
    position
  )
  select
    p_response_id,
    p_pack_version_id,
    selected.id,
    'required',
    selected.assignment_position
  from selected_cards as selected
  order by selected.assignment_position;

  select
    count(*),
    count(distinct assignment.position),
    count(*) filter (where card.is_signature)
  into
    v_assignment_count,
    v_position_count,
    v_signature_count
  from public.visitor_assignments as assignment
  join public.pack_cards as card
    on card.pack_version_id = assignment.pack_version_id
    and card.id = assignment.card_id
  where assignment.response_id = p_response_id
    and assignment.stage = 'required';

  if v_assignment_count <> 3
    or v_position_count <> 3
    or v_signature_count <> 1
    or not exists (
      select 1
      from public.visitor_assignments as assignment
      join public.pack_cards as card
        on card.pack_version_id = assignment.pack_version_id
        and card.id = assignment.card_id
      where assignment.response_id = p_response_id
        and assignment.stage = 'required'
        and assignment.position = 1
        and card.is_signature
    )
  then
    raise exception using
      errcode = 'P2301',
      message = 'required assignment invariant failed';
  end if;
end
$function$;

do $backfill$
declare
  v_response record;
begin
  for v_response in
    select
      response.id,
      response.pack_version_id,
      link.pack_play_id
    from public.visitor_responses as response
    join public.share_links as link
      on link.id = response.share_link_id
    order by response.created_at, response.id
  loop
    perform private.assign_required_response_cards(
      v_response.id,
      v_response.pack_play_id,
      v_response.pack_version_id
    );
  end loop;

  if exists (
    select 1
    from public.visitor_responses as response
    left join public.visitor_assignments as assignment
      on assignment.response_id = response.id
      and assignment.stage = 'required'
    left join public.pack_cards as card
      on card.pack_version_id = assignment.pack_version_id
      and card.id = assignment.card_id
    group by response.id
    having count(assignment.card_id) <> 3
      or count(distinct assignment.position) <> 3
      or count(*) filter (where card.is_signature) <> 1
  )
  then
    raise exception using
      errcode = 'P2301',
      message = 'legacy required assignment backfill failed';
  end if;
end
$backfill$;

grant create on schema private to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

create or replace function private.visitor_response_state(p_response_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', response.id,
    'status', response.status,
    'relationshipCode', response.relationship_code,
    'knownSinceCode', response.known_since_code,
    'sessionExpiresAt', response.session_expires_at,
    'sessionTtlSeconds', greatest(
      1,
      floor(
        extract(epoch from (response.session_expires_at - clock_timestamp()))
      )::integer
    ),
    'assignments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cardId', card.id,
            'stage', assignment.stage,
            'position', assignment.position,
            'visitorPrompt', card.visitor_prompt,
            'optionA', card.option_a,
            'optionB', card.option_b,
            'isSignature', card.is_signature
          )
          order by assignment.position
        )
        from public.visitor_assignments as assignment
        join public.pack_cards as card
          on card.pack_version_id = assignment.pack_version_id
          and card.id = assignment.card_id
        where assignment.response_id = response.id
          and assignment.stage = 'required'
      ),
      '[]'::jsonb
    )
  )
  from public.visitor_responses as response
  where response.id = p_response_id;
$function$;

drop policy analytics_core_visitor_flow_internal_insert
  on public.analytics_events;

create policy analytics_core_visitor_flow_internal_insert
  on public.analytics_events
  for insert
  to gyeop_internal_rpc
  with check (
    (
      visitor_response_id is null
      and event_name in (
        'share_link_created',
        'invite_opened',
        'share_handoff_succeeded',
        'share_link_copied'
      )
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
    or (
      visitor_response_id is not null
      and event_name = 'relationship_selected'
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties->>'relationshipCode' in (
        'old_friend',
        'school_friend',
        'coworker',
        'romantic',
        'family',
        'online_friend',
        'social_follower',
        'other'
      )
      and properties->>'knownSinceCode' in (
        'under_one_year',
        'one_to_three_years',
        'three_to_five_years',
        'five_to_ten_years',
        'ten_years_or_more',
        'not_sure'
      )
      and properties - array[
        'packVersion',
        'linkKind',
        'relationshipCode',
        'knownSinceCode'
      ]::text[] = '{}'::jsonb
    )
    or (
      visitor_response_id is not null
      and event_name = 'visitor_response_started'
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
  );

create or replace function public.start_response(
  p_public_id text,
  p_secret_hash bytea,
  p_intent text,
  p_existing_response_id uuid,
  p_existing_session_hash bytea,
  p_new_response_id uuid,
  p_new_session_hash bytea,
  p_relationship_code text,
  p_known_since_code text,
  p_rate_limit_key bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_constraint_name text;
  v_existing_expires_at timestamptz;
  v_existing_link_id uuid;
  v_existing_status text;
  v_expires_at timestamptz;
  v_kind text;
  v_limit record;
  v_link_id uuid;
  v_now timestamptz;
  v_pack_play_id uuid;
  v_pack_version text;
  v_pack_version_id uuid;
  v_retry_after_seconds integer;
  v_secret_hash bytea;
  v_status text;
begin
  if p_public_id is null
    or p_public_id !~ '^[A-Za-z0-9_-]{21}[AQgw]$'
    or p_secret_hash is null
    or octet_length(p_secret_hash) <> 32
    or p_intent is null
    or p_intent not in ('resume', 'start')
    or (p_existing_response_id is null) <> (p_existing_session_hash is null)
    or (
      p_existing_session_hash is not null
      and octet_length(p_existing_session_hash) <> 32
    )
    or p_rate_limit_key is null
    or octet_length(p_rate_limit_key) <> 32
    or (
      p_intent = 'resume'
      and (
        p_new_response_id is not null
        or p_new_session_hash is not null
        or p_relationship_code is not null
        or p_known_since_code is not null
      )
    )
    or (
      p_intent = 'start'
      and (
        p_new_response_id is null
        or p_new_session_hash is null
        or octet_length(p_new_session_hash) <> 32
        or p_relationship_code is null
        or p_relationship_code not in (
          'old_friend',
          'school_friend',
          'coworker',
          'romantic',
          'family',
          'online_friend',
          'social_follower',
          'other'
        )
        or p_known_since_code is null
        or p_known_since_code not in (
          'under_one_year',
          'one_to_three_years',
          'three_to_five_years',
          'five_to_ten_years',
          'ten_years_or_more',
          'not_sure'
        )
      )
    )
  then
    raise exception using errcode = '22023', message = 'invalid response start input';
  end if;

  select
    link.id,
    link.secret_hash,
    link.kind,
    link.status,
    link.expires_at,
    play.id,
    play.pack_version_id,
    version.version
  into
    v_link_id,
    v_secret_hash,
    v_kind,
    v_status,
    v_expires_at,
    v_pack_play_id,
    v_pack_version_id,
    v_pack_version
  from public.share_links as link
  join public.pack_plays as play
    on play.id = link.pack_play_id
  join public.pack_versions as version
    on version.id = play.pack_version_id
  where link.public_id = p_public_id
  for update of link;

  if not found
    or v_secret_hash <> p_secret_hash
    or v_kind not in ('public', 'one_to_one')
  then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  v_now := clock_timestamp();
  if v_status = 'active'
    and v_expires_at is not null
    and v_expires_at <= v_now
  then
    update public.share_links as link
    set status = 'expired',
        updated_at = v_now
    where link.id = v_link_id;
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  if v_status <> 'active' then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  if p_existing_response_id is not null then
    select response.share_link_id, response.status, response.session_expires_at
    into v_existing_link_id, v_existing_status, v_existing_expires_at
    from public.visitor_responses as response
    where response.id = p_existing_response_id
      and response.session_token_hash = p_existing_session_hash
    for update;

    if not found
      or v_existing_status <> 'draft'
      or v_existing_expires_at <= v_now
    then
      return jsonb_build_object('outcome', 'session_invalid');
    end if;

    if v_existing_link_id = v_link_id then
      return jsonb_build_object(
        'outcome', 'resumed',
        'response', private.visitor_response_state(p_existing_response_id)
      );
    end if;
  end if;

  if p_intent = 'resume' then
    return jsonb_build_object('outcome', 'no_session');
  end if;

  begin
    select *
    into strict v_limit
    from public.consume_rate_limit(
      p_rate_limit_key,
      'response_start',
      600,
      10
    );

    if not v_limit.allowed then
      v_retry_after_seconds := v_limit.retry_after_seconds;
      raise exception using errcode = 'P2201', message = 'response start rate limited';
    end if;

    v_now := clock_timestamp();
    insert into public.visitor_responses (
      id,
      share_link_id,
      pack_version_id,
      relationship_code,
      known_since_code,
      session_token_hash,
      session_expires_at,
      created_at
    ) values (
      p_new_response_id,
      v_link_id,
      v_pack_version_id,
      p_relationship_code,
      p_known_since_code,
      p_new_session_hash,
      v_now + interval '24 hours',
      v_now
    );

    perform private.assign_required_response_cards(
      p_new_response_id,
      v_pack_play_id,
      v_pack_version_id
    );

    insert into public.analytics_events (
      event_name,
      visitor_response_id,
      properties
    ) values
      (
        'relationship_selected',
        p_new_response_id,
        jsonb_build_object(
          'packVersion', v_pack_version,
          'linkKind', v_kind,
          'relationshipCode', p_relationship_code,
          'knownSinceCode', p_known_since_code
        )
      ),
      (
        'visitor_response_started',
        p_new_response_id,
        jsonb_build_object(
          'packVersion', v_pack_version,
          'linkKind', v_kind
        )
      );
  exception
    when sqlstate 'P2201' then
      return jsonb_build_object(
        'outcome', 'rate_limited',
        'retryAfterSeconds', v_retry_after_seconds
      );
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name in (
        'visitor_responses_pkey',
        'visitor_responses_id_pack_version_key',
        'visitor_responses_session_token_hash_key'
      )
      then
        return jsonb_build_object('outcome', 'collision');
      end if;
      raise;
  end;

  return jsonb_build_object(
    'outcome', 'created',
    'response', private.visitor_response_state(p_new_response_id)
  );
end
$function$;

alter function private.assign_required_response_cards(uuid, uuid, uuid)
  owner to gyeop_internal_rpc;

revoke execute on function private.assign_required_response_cards(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.assign_required_response_cards(uuid, uuid, uuid)
  to gyeop_internal_rpc;

revoke all privileges on table public.visitor_assignments
  from public, anon, authenticated, service_role;

revoke create on schema private from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
