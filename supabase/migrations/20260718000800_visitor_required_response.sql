begin;

alter table public.visitor_responses
  drop constraint visitor_responses_status_check,
  drop constraint visitor_responses_draft_state_check;

alter table public.visitor_responses
  add constraint visitor_responses_status_check
    check (status in ('draft', 'submitted')),
  add constraint visitor_responses_state_check check (
    relationship_code is not null
    and relationship_code in (
      'old_friend',
      'school_friend',
      'coworker',
      'romantic',
      'family',
      'online_friend',
      'social_follower',
      'other'
    )
    and known_since_code is not null
    and known_since_code in (
      'under_one_year',
      'one_to_three_years',
      'three_to_five_years',
      'five_to_ten_years',
      'ten_years_or_more',
      'not_sure'
    )
    and session_token_hash is not null
    and session_expires_at = created_at + interval '24 hours'
    and withdrawn_at is null
    and (
      (
        status = 'draft'
        and management_token_hash is null
        and submitted_at is null
      )
      or (
        status = 'submitted'
        and management_token_hash is not null
        and octet_length(management_token_hash) = 32
        and submitted_at is not null
      )
    )
  ),
  add constraint visitor_responses_id_share_link_key
    unique (id, share_link_id);

alter table public.visitor_assignments
  add constraint visitor_assignments_response_pack_card_key
  unique (response_id, pack_version_id, card_id);

create table public.visitor_answers (
  response_id uuid not null,
  pack_version_id uuid not null,
  card_id text not null,
  choice text not null check (choice in ('a', 'b')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (response_id, card_id),
  foreign key (response_id, pack_version_id, card_id)
    references public.visitor_assignments (
      response_id,
      pack_version_id,
      card_id
    )
    on update restrict
    on delete cascade
);

alter table public.visitor_answers enable row level security;

grant select, insert, update on table public.visitor_answers
  to gyeop_internal_rpc;

create policy visitor_answers_internal_select
  on public.visitor_answers
  for select
  to gyeop_internal_rpc
  using (true);

create policy visitor_answers_internal_insert
  on public.visitor_answers
  for insert
  to gyeop_internal_rpc
  with check (true);

create policy visitor_answers_internal_update
  on public.visitor_answers
  for update
  to gyeop_internal_rpc
  using (true)
  with check (true);

alter table public.share_links
  drop constraint share_links_status_check;

alter table public.share_links
  add column consumed_response_id uuid unique,
  add column consumed_at timestamptz,
  add constraint share_links_status_check
    check (status in ('active', 'disabled', 'expired')),
  add constraint share_links_consumption_check check (
    (
      kind = 'public'
      and consumed_response_id is null
      and consumed_at is null
    )
    or (
      kind = 'one_to_one'
      and (
        (
          status = 'disabled'
          and consumed_response_id is not null
          and consumed_at is not null
        )
        or (
          consumed_response_id is null
          and consumed_at is null
        )
      )
    )
  ),
  add constraint share_links_consumed_response_binding_fkey
    foreign key (consumed_response_id, id)
    references public.visitor_responses (id, share_link_id)
    on update restrict
    on delete restrict;

create unique index analytics_visitor_terminal_event_unique_idx
  on public.analytics_events (visitor_response_id, event_name)
  where visitor_response_id is not null
    and event_name in ('comparison_viewed', 'same_pack_start_clicked');

create or replace function private.visitor_required_response_state(p_response_id uuid)
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
    'assignments', case
      when response.status = 'submitted' then coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'cardId', card.id,
              'stage', assignment.stage,
              'position', assignment.position,
              'visitorPrompt', card.visitor_prompt,
              'optionA', card.option_a,
              'optionB', card.option_b,
              'isSignature', card.is_signature,
              'visitorChoice', answer.choice,
              'ownerChoice', owner_answer.choice,
              'matches', answer.choice = owner_answer.choice,
              'isHighlight',
                answer.choice <> owner_answer.choice
                and assignment.card_id = (
                  select highlight_assignment.card_id
                  from public.visitor_assignments as highlight_assignment
                  join public.visitor_answers as highlight_answer
                    on highlight_answer.response_id = highlight_assignment.response_id
                    and highlight_answer.pack_version_id = highlight_assignment.pack_version_id
                    and highlight_answer.card_id = highlight_assignment.card_id
                  join public.pack_cards as highlight_card
                    on highlight_card.pack_version_id = highlight_assignment.pack_version_id
                    and highlight_card.id = highlight_assignment.card_id
                  join public.self_answers as highlight_owner_answer
                    on highlight_owner_answer.pack_play_id = link.pack_play_id
                    and highlight_owner_answer.pack_version_id = highlight_assignment.pack_version_id
                    and highlight_owner_answer.card_id = highlight_assignment.card_id
                  where highlight_assignment.response_id = response.id
                    and highlight_assignment.stage = 'required'
                    and highlight_answer.choice <> highlight_owner_answer.choice
                  order by
                    highlight_card.is_signature desc,
                    highlight_card.position,
                    highlight_assignment.position,
                    highlight_assignment.card_id
                  limit 1
                )
            )
            order by assignment.position
          )
          from public.visitor_assignments as assignment
          join public.pack_cards as card
            on card.pack_version_id = assignment.pack_version_id
            and card.id = assignment.card_id
          join public.visitor_answers as answer
            on answer.response_id = assignment.response_id
            and answer.pack_version_id = assignment.pack_version_id
            and answer.card_id = assignment.card_id
          join public.self_answers as owner_answer
            on owner_answer.pack_play_id = link.pack_play_id
            and owner_answer.pack_version_id = assignment.pack_version_id
            and owner_answer.card_id = assignment.card_id
          where assignment.response_id = response.id
            and assignment.stage = 'required'
        ),
        '[]'::jsonb
      )
      else coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'cardId', card.id,
              'stage', assignment.stage,
              'position', assignment.position,
              'visitorPrompt', card.visitor_prompt,
              'optionA', card.option_a,
              'optionB', card.option_b,
              'isSignature', card.is_signature,
              'visitorChoice', answer.choice
            )
            order by assignment.position
          )
          from public.visitor_assignments as assignment
          join public.pack_cards as card
            on card.pack_version_id = assignment.pack_version_id
            and card.id = assignment.card_id
          left join public.visitor_answers as answer
            on answer.response_id = assignment.response_id
            and answer.pack_version_id = assignment.pack_version_id
            and answer.card_id = assignment.card_id
          where assignment.response_id = response.id
            and assignment.stage = 'required'
        ),
        '[]'::jsonb
      )
    end
  )
  || case
    when response.status = 'submitted' then jsonb_build_object(
      'allMatched', not exists (
        select 1
        from public.visitor_assignments as mismatch_assignment
        join public.visitor_answers as mismatch_answer
          on mismatch_answer.response_id = mismatch_assignment.response_id
          and mismatch_answer.pack_version_id = mismatch_assignment.pack_version_id
          and mismatch_answer.card_id = mismatch_assignment.card_id
        join public.self_answers as mismatch_owner_answer
          on mismatch_owner_answer.pack_play_id = link.pack_play_id
          and mismatch_owner_answer.pack_version_id = mismatch_assignment.pack_version_id
          and mismatch_owner_answer.card_id = mismatch_assignment.card_id
        where mismatch_assignment.response_id = response.id
          and mismatch_assignment.stage = 'required'
          and mismatch_answer.choice <> mismatch_owner_answer.choice
      )
    )
    else '{}'::jsonb
  end
  from public.visitor_responses as response
  join public.share_links as link
    on link.id = response.share_link_id
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
        'old_friend', 'school_friend', 'coworker', 'romantic', 'family',
        'online_friend', 'social_follower', 'other'
      )
      and properties->>'knownSinceCode' in (
        'under_one_year', 'one_to_three_years', 'three_to_five_years',
        'five_to_ten_years', 'ten_years_or_more', 'not_sure'
      )
      and properties - array[
        'packVersion', 'linkKind', 'relationshipCode', 'knownSinceCode'
      ]::text[] = '{}'::jsonb
    )
    or (
      visitor_response_id is not null
      and event_name in (
        'visitor_response_started',
        'visitor_required_answer_saved',
        'visitor_required_submitted',
        'comparison_viewed',
        'same_pack_start_clicked'
      )
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
  );

create or replace function public.get_visitor_response(
  p_response_id uuid,
  p_session_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expires_at timestamptz;
begin
  if p_response_id is null
    or p_session_hash is null
    or octet_length(p_session_hash) <> 32
  then
    raise exception using errcode = '22023', message = 'invalid visitor response input';
  end if;

  select response.session_expires_at
  into v_expires_at
  from public.visitor_responses as response
  where response.id = p_response_id
    and response.session_token_hash = p_session_hash
    and response.status in ('draft', 'submitted')
  for update;

  if not found or v_expires_at <= clock_timestamp() then
    return jsonb_build_object('outcome', 'session_invalid');
  end if;

  return jsonb_build_object(
    'outcome', 'authorized',
    'response', private.visitor_required_response_state(p_response_id)
  );
end
$function$;

create or replace function public.save_response_answer(
  p_response_id uuid,
  p_session_hash bytea,
  p_card_id text,
  p_choice text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existed boolean;
  v_expires_at timestamptz;
  v_kind text;
  v_pack_version text;
  v_pack_version_id uuid;
  v_status text;
begin
  if p_response_id is null
    or p_session_hash is null
    or octet_length(p_session_hash) <> 32
    or p_card_id is null
    or p_card_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_choice not in ('a', 'b')
  then
    raise exception using errcode = '22023', message = 'invalid visitor answer input';
  end if;

  select
    response.status,
    response.session_expires_at,
    response.pack_version_id,
    link.kind,
    version.version
  into
    v_status,
    v_expires_at,
    v_pack_version_id,
    v_kind,
    v_pack_version
  from public.visitor_responses as response
  join public.share_links as link
    on link.id = response.share_link_id
  join public.pack_versions as version
    on version.id = response.pack_version_id
  where response.id = p_response_id
    and response.session_token_hash = p_session_hash
  for update of response;

  if not found or v_expires_at <= clock_timestamp() then
    return jsonb_build_object('outcome', 'session_invalid');
  end if;
  if v_status = 'submitted' then
    return jsonb_build_object('outcome', 'submitted');
  end if;
  if not exists (
    select 1
    from public.visitor_assignments as assignment
    where assignment.response_id = p_response_id
      and assignment.pack_version_id = v_pack_version_id
      and assignment.card_id = p_card_id
      and assignment.stage = 'required'
  ) then
    return jsonb_build_object('outcome', 'invalid_card');
  end if;

  select exists (
    select 1
    from public.visitor_answers as answer
    where answer.response_id = p_response_id
      and answer.card_id = p_card_id
  ) into v_existed;

  insert into public.visitor_answers (
    response_id,
    pack_version_id,
    card_id,
    choice
  ) values (
    p_response_id,
    v_pack_version_id,
    p_card_id,
    p_choice
  )
  on conflict (response_id, card_id) do update
    set choice = excluded.choice,
        updated_at = clock_timestamp();

  if not v_existed then
    insert into public.analytics_events (
      event_name,
      visitor_response_id,
      properties
    ) values (
      'visitor_required_answer_saved',
      p_response_id,
      jsonb_build_object(
        'packVersion', v_pack_version,
        'linkKind', v_kind
      )
    );
  end if;

  return jsonb_build_object(
    'outcome', 'saved',
    'response', private.visitor_required_response_state(p_response_id)
  );
end
$function$;

create or replace function public.submit_response(
  p_response_id uuid,
  p_session_hash bytea,
  p_management_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_answer_count integer;
  v_assignment_count integer;
  v_expires_at timestamptz;
  v_kind text;
  v_link_id uuid;
  v_link_status text;
  v_management_hash bytea;
  v_now timestamptz;
  v_owner_answer_count integer;
  v_pack_play_id uuid;
  v_pack_version text;
  v_status text;
begin
  if p_response_id is null
    or p_session_hash is null
    or octet_length(p_session_hash) <> 32
    or p_management_hash is null
    or octet_length(p_management_hash) <> 32
  then
    raise exception using errcode = '22023', message = 'invalid response submit input';
  end if;

  select response.share_link_id
  into v_link_id
  from public.visitor_responses as response
  where response.id = p_response_id;
  if not found then
    return jsonb_build_object('outcome', 'session_invalid');
  end if;

  select link.kind, link.status, link.pack_play_id
  into v_kind, v_link_status, v_pack_play_id
  from public.share_links as link
  where link.id = v_link_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'session_invalid');
  end if;

  select
    response.status,
    response.session_expires_at,
    response.management_token_hash,
    version.version
  into
    v_status,
    v_expires_at,
    v_management_hash,
    v_pack_version
  from public.visitor_responses as response
  join public.pack_versions as version
    on version.id = response.pack_version_id
  where response.id = p_response_id
    and response.share_link_id = v_link_id
    and response.session_token_hash = p_session_hash
  for update of response;

  if not found or v_expires_at <= clock_timestamp() then
    return jsonb_build_object('outcome', 'session_invalid');
  end if;

  if v_status = 'submitted' then
    if v_management_hash = p_management_hash then
      return jsonb_build_object(
        'outcome', 'submitted',
        'response', private.visitor_required_response_state(p_response_id)
      );
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if v_kind = 'public' then
    if v_link_status <> 'active' then
      return jsonb_build_object('outcome', 'conflict');
    end if;
  elsif v_kind = 'one_to_one' then
    if v_link_status <> 'active' then
      return jsonb_build_object('outcome', 'conflict');
    end if;
  else
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select
    count(*),
    count(answer.card_id),
    count(owner_answer.card_id)
  into
    v_assignment_count,
    v_answer_count,
    v_owner_answer_count
  from public.visitor_assignments as assignment
  left join public.visitor_answers as answer
    on answer.response_id = assignment.response_id
    and answer.pack_version_id = assignment.pack_version_id
    and answer.card_id = assignment.card_id
  left join public.self_answers as owner_answer
    on owner_answer.pack_play_id = v_pack_play_id
    and owner_answer.pack_version_id = assignment.pack_version_id
    and owner_answer.card_id = assignment.card_id
  where assignment.response_id = p_response_id
    and assignment.stage = 'required';

  if v_assignment_count <> 3
    or v_answer_count <> 3
    or v_owner_answer_count <> 3
  then
    return jsonb_build_object('outcome', 'incomplete');
  end if;

  begin
    v_now := clock_timestamp();
    update public.visitor_responses as response
    set status = 'submitted',
        management_token_hash = p_management_hash,
        submitted_at = v_now
    where response.id = p_response_id;

    if v_kind = 'one_to_one' then
      update public.share_links as link
      set status = 'disabled',
          consumed_response_id = p_response_id,
          consumed_at = v_now,
          updated_at = v_now
      where link.id = v_link_id;
    end if;

    insert into public.analytics_events (
      event_name,
      visitor_response_id,
      properties
    ) values (
      'visitor_required_submitted',
      p_response_id,
      jsonb_build_object(
        'packVersion', v_pack_version,
        'linkKind', v_kind
      )
    );
  exception
    when unique_violation then
      return jsonb_build_object('outcome', 'conflict');
  end;

  return jsonb_build_object(
    'outcome', 'submitted',
    'response', private.visitor_required_response_state(p_response_id)
  );
end
$function$;

create or replace function public.record_visitor_response_event(
  p_response_id uuid,
  p_session_hash bytea,
  p_event_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_constraint_name text;
  v_expires_at timestamptz;
  v_kind text;
  v_pack_version text;
  v_status text;
begin
  if p_response_id is null
    or p_session_hash is null
    or octet_length(p_session_hash) <> 32
    or p_event_name not in ('comparison_viewed', 'same_pack_start_clicked')
  then
    raise exception using errcode = '22023', message = 'invalid visitor event input';
  end if;

  select
    response.status,
    response.session_expires_at,
    link.kind,
    version.version
  into
    v_status,
    v_expires_at,
    v_kind,
    v_pack_version
  from public.visitor_responses as response
  join public.share_links as link
    on link.id = response.share_link_id
  join public.pack_versions as version
    on version.id = response.pack_version_id
  where response.id = p_response_id
    and response.session_token_hash = p_session_hash
  for update of response;

  if not found
    or v_expires_at <= clock_timestamp()
    or v_status <> 'submitted'
  then
    return jsonb_build_object('outcome', 'session_invalid');
  end if;

  begin
    insert into public.analytics_events (
      event_name,
      visitor_response_id,
      properties
    ) values (
      p_event_name,
      p_response_id,
      jsonb_build_object(
        'packVersion', v_pack_version,
        'linkKind', v_kind
      )
    );
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name <> 'analytics_visitor_terminal_event_unique_idx' then
        raise;
      end if;
  end;

  return jsonb_build_object('outcome', 'recorded');
end
$function$;

create or replace function public.start_required_response(
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
  v_consumed_response_id uuid;
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
    or p_intent not in ('resume', 'start')
    or (p_existing_response_id is null) <> (p_existing_session_hash is null)
    or (p_existing_session_hash is not null and octet_length(p_existing_session_hash) <> 32)
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
        or p_relationship_code not in (
          'old_friend', 'school_friend', 'coworker', 'romantic', 'family',
          'online_friend', 'social_follower', 'other'
        )
        or p_known_since_code not in (
          'under_one_year', 'one_to_three_years', 'three_to_five_years',
          'five_to_ten_years', 'ten_years_or_more', 'not_sure'
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
    link.consumed_response_id,
    play.id,
    play.pack_version_id,
    version.version
  into
    v_link_id,
    v_secret_hash,
    v_kind,
    v_status,
    v_expires_at,
    v_consumed_response_id,
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
    set status = 'expired', updated_at = v_now
    where link.id = v_link_id;
    v_status := 'expired';
  end if;

  if p_existing_response_id is not null then
    select response.share_link_id, response.status, response.session_expires_at
    into v_existing_link_id, v_existing_status, v_existing_expires_at
    from public.visitor_responses as response
    where response.id = p_existing_response_id
      and response.session_token_hash = p_existing_session_hash
    for update;

    if not found
      or v_existing_status not in ('draft', 'submitted')
      or v_existing_expires_at <= v_now
    then
      return jsonb_build_object('outcome', 'session_invalid');
    end if;

    if v_existing_link_id = v_link_id
      and (
        v_status = 'active'
        or (
          v_kind = 'one_to_one'
          and v_status = 'disabled'
          and v_consumed_response_id = p_existing_response_id
        )
      )
    then
      return jsonb_build_object(
        'outcome', 'resumed',
        'response', private.visitor_required_response_state(p_existing_response_id)
      );
    end if;
  end if;

  if v_status <> 'active' then
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  if p_intent = 'resume' then
    return jsonb_build_object('outcome', 'no_session');
  end if;

  begin
    select *
    into strict v_limit
    from public.consume_rate_limit(p_rate_limit_key, 'response_start', 600, 10);
    if not v_limit.allowed then
      v_retry_after_seconds := v_limit.retry_after_seconds;
      raise exception using errcode = 'P2201', message = 'response start rate limited';
    end if;

    v_now := clock_timestamp();
    insert into public.visitor_responses (
      id, share_link_id, pack_version_id, relationship_code,
      known_since_code, session_token_hash, session_expires_at, created_at
    ) values (
      p_new_response_id, v_link_id, v_pack_version_id, p_relationship_code,
      p_known_since_code, p_new_session_hash, v_now + interval '24 hours', v_now
    );

    perform private.assign_required_response_cards(
      p_new_response_id,
      v_pack_play_id,
      v_pack_version_id
    );

    insert into public.analytics_events (
      event_name, visitor_response_id, properties
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
        jsonb_build_object('packVersion', v_pack_version, 'linkKind', v_kind)
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
        'visitor_responses_id_share_link_key',
        'visitor_responses_session_token_hash_key'
      ) then
        return jsonb_build_object('outcome', 'collision');
      end if;
      raise;
  end;

  return jsonb_build_object(
    'outcome', 'created',
    'response', private.visitor_required_response_state(p_new_response_id)
  );
end
$function$;

grant create on schema public to gyeop_internal_rpc;
grant create on schema private to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

alter function private.visitor_required_response_state(uuid)
  owner to gyeop_internal_rpc;
alter function public.start_required_response(
  text,
  bytea,
  text,
  uuid,
  bytea,
  uuid,
  bytea,
  text,
  text,
  bytea
)
  owner to gyeop_internal_rpc;
alter function public.get_visitor_response(uuid, bytea)
  owner to gyeop_internal_rpc;
alter function public.save_response_answer(uuid, bytea, text, text)
  owner to gyeop_internal_rpc;
alter function public.submit_response(uuid, bytea, bytea)
  owner to gyeop_internal_rpc;
alter function public.record_visitor_response_event(uuid, bytea, text)
  owner to gyeop_internal_rpc;

revoke execute on function public.get_visitor_response(uuid, bytea)
  from public, anon, authenticated;
revoke execute on function public.save_response_answer(uuid, bytea, text, text)
  from public, anon, authenticated;
revoke execute on function public.submit_response(uuid, bytea, bytea)
  from public, anon, authenticated;
revoke execute on function public.record_visitor_response_event(uuid, bytea, text)
  from public, anon, authenticated;
revoke execute on function private.visitor_required_response_state(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.start_required_response(
  text,
  bytea,
  text,
  uuid,
  bytea,
  uuid,
  bytea,
  text,
  text,
  bytea
)
  from public, anon, authenticated;

grant execute on function public.get_visitor_response(uuid, bytea)
  to service_role;
grant execute on function public.save_response_answer(uuid, bytea, text, text)
  to service_role;
grant execute on function public.submit_response(uuid, bytea, bytea)
  to service_role;
grant execute on function public.record_visitor_response_event(uuid, bytea, text)
  to service_role;
grant execute on function private.visitor_required_response_state(uuid)
  to gyeop_internal_rpc;
grant execute on function public.start_required_response(
  text,
  bytea,
  text,
  uuid,
  bytea,
  uuid,
  bytea,
  text,
  text,
  bytea
)
  to service_role;

revoke all privileges on table public.visitor_answers
  from public, anon, authenticated, service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke create on schema private from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
