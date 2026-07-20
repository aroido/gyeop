begin;

grant create on schema public to gyeop_internal_rpc;
grant create on schema private to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

alter table public.visitor_assignments
  drop constraint visitor_assignments_stage_check,
  drop constraint visitor_assignments_position_check;

alter table public.visitor_assignments
  add constraint visitor_assignments_stage_check
    check (stage in ('required', 'optional')),
  add constraint visitor_assignments_position_check check (
    (stage = 'required' and position between 1 and 3)
    or (stage = 'optional' and position between 1 and 2)
  );

drop index public.analytics_visitor_terminal_event_unique_idx;

create unique index analytics_visitor_terminal_event_unique_idx
  on public.analytics_events (visitor_response_id, event_name)
  where visitor_response_id is not null
    and event_name in (
      'comparison_viewed',
      'same_pack_start_clicked',
      'optional_answers_started',
      'optional_answers_completed'
    );

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
              'packPosition', card.position,
              'visitorPrompt', card.visitor_prompt,
              'optionA', card.option_a,
              'optionB', card.option_b,
              'isSignature', card.is_signature,
              'visitorChoice', answer.choice,
              'ownerChoice', case
                when answer.choice is null then null
                else owner_answer.choice
              end,
              'matches', case
                when answer.choice is null then null
                else answer.choice = owner_answer.choice
              end,
              'isHighlight',
                assignment.stage = 'required'
                and answer.choice <> owner_answer.choice
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
            order by
              case assignment.stage when 'required' then 0 else 1 end,
              assignment.position
          )
          from public.visitor_assignments as assignment
          join public.pack_cards as card
            on card.pack_version_id = assignment.pack_version_id
            and card.id = assignment.card_id
          left join public.visitor_answers as answer
            on answer.response_id = assignment.response_id
            and answer.pack_version_id = assignment.pack_version_id
            and answer.card_id = assignment.card_id
          join public.self_answers as owner_answer
            on owner_answer.pack_play_id = link.pack_play_id
            and owner_answer.pack_version_id = assignment.pack_version_id
            and owner_answer.card_id = assignment.card_id
          where assignment.response_id = response.id
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

create or replace function public.assign_optional_cards(
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
  v_inserted_count integer;
  v_kind text;
  v_optional_count integer;
  v_pack_play_id uuid;
  v_pack_version text;
  v_pack_version_id uuid;
  v_status text;
begin
  if p_response_id is null
    or p_session_hash is null
    or octet_length(p_session_hash) <> 32
  then
    raise exception using errcode = '22023', message = 'invalid optional assignment input';
  end if;

  select
    response.status,
    response.session_expires_at,
    response.pack_version_id,
    link.pack_play_id,
    link.kind,
    version.version
  into
    v_status,
    v_expires_at,
    v_pack_version_id,
    v_pack_play_id,
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
  if v_status <> 'submitted' then
    return jsonb_build_object('outcome', 'not_submitted');
  end if;

  select count(*)::integer
  into v_optional_count
  from public.visitor_assignments as assignment
  where assignment.response_id = p_response_id
    and assignment.stage = 'optional';

  if v_optional_count = 2 then
    return jsonb_build_object(
      'outcome', 'assigned',
      'response', private.visitor_required_response_state(p_response_id)
    );
  end if;
  if v_optional_count <> 0 then
    raise exception using errcode = 'P2301', message = 'optional assignment invariant failed';
  end if;

  insert into public.visitor_assignments (
    response_id,
    pack_version_id,
    card_id,
    stage,
    position
  )
  select
    p_response_id,
    v_pack_version_id,
    candidate.id,
    'optional',
    candidate.selection_position::smallint
  from (
    select
      ranked.id,
      row_number() over (
        order by
          ranked.submitted_sample_count,
          ranked.tie_hash,
          ranked.position,
          ranked.id
      ) as selection_position
    from (
      select
        card.id,
        card.position,
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
            and prior_link.pack_play_id = v_pack_play_id
        ) as submitted_sample_count,
        pg_catalog.sha256(
          convert_to('gyeop-optional-assignment-v1', 'UTF8')
          || decode('00', 'hex')
          || convert_to(p_response_id::text, 'UTF8')
          || decode('00', 'hex')
          || convert_to(card.id, 'UTF8')
        ) as tie_hash
      from public.pack_cards as card
      where card.pack_version_id = v_pack_version_id
        and not exists (
          select 1
          from public.visitor_assignments as existing_assignment
          where existing_assignment.response_id = p_response_id
            and existing_assignment.card_id = card.id
        )
        and not exists (
          select 1
          from public.visitor_answers as existing_answer
          where existing_answer.response_id = p_response_id
            and existing_answer.card_id = card.id
        )
    ) as ranked
    order by
      ranked.submitted_sample_count,
      ranked.tie_hash,
      ranked.position,
      ranked.id
    limit 2
  ) as candidate
  order by candidate.selection_position;

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> 2 then
    raise exception using errcode = 'P2301', message = 'optional assignment invariant failed';
  end if;

  insert into public.analytics_events (
    event_name,
    visitor_response_id,
    properties
  ) values (
    'optional_answers_started',
    p_response_id,
    jsonb_build_object(
      'packVersion', v_pack_version,
      'linkKind', v_kind
    )
  );

  return jsonb_build_object(
    'outcome', 'assigned',
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
  v_optional_answer_count integer;
  v_pack_version text;
  v_pack_version_id uuid;
  v_stage text;
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

  select assignment.stage
  into v_stage
  from public.visitor_assignments as assignment
  where assignment.response_id = p_response_id
    and assignment.pack_version_id = v_pack_version_id
    and assignment.card_id = p_card_id;

  if not found then
    return jsonb_build_object('outcome', 'invalid_card');
  end if;
  if (v_status = 'draft' and v_stage <> 'required')
    or (v_status = 'submitted' and v_stage <> 'optional')
  then
    return case
      when v_status = 'submitted' then jsonb_build_object('outcome', 'submitted')
      else jsonb_build_object('outcome', 'invalid_card')
    end;
  end if;
  if v_status not in ('draft', 'submitted') then
    return jsonb_build_object('outcome', 'session_invalid');
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

  if not v_existed and v_stage = 'required' then
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
  elsif not v_existed and v_stage = 'optional' then
    select count(*)::integer
    into v_optional_answer_count
    from public.visitor_assignments as assignment
    join public.visitor_answers as answer
      on answer.response_id = assignment.response_id
      and answer.pack_version_id = assignment.pack_version_id
      and answer.card_id = assignment.card_id
    where assignment.response_id = p_response_id
      and assignment.stage = 'optional';

    if v_optional_answer_count = 2 then
      insert into public.analytics_events (
        event_name,
        visitor_response_id,
        properties
      ) values (
        'optional_answers_completed',
        p_response_id,
        jsonb_build_object(
          'packVersion', v_pack_version,
          'linkKind', v_kind
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'outcome', 'saved',
    'response', private.visitor_required_response_state(p_response_id)
  );
end
$function$;

drop policy analytics_internal_insert_allowlist
  on public.analytics_events;

create policy analytics_internal_insert_allowlist
  on public.analytics_events
  for insert
  to gyeop_internal_rpc
  with check (
    (
      event_name = 'pack_opened'
      and owner_play_id is not null
      and share_link_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'entrySource' in ('home', 'same_pack_cta')
      and properties - array['packVersion', 'entrySource']::text[] = '{}'::jsonb
      and (
        (properties->>'entrySource' = 'home' and visitor_response_id is null)
        or
        (properties->>'entrySource' = 'same_pack_cta' and visitor_response_id is not null)
      )
    )
    or (
      event_name = 'self_pack_completed'
      and owner_play_id is not null
      and share_link_id is null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties - 'packVersion' = '{}'::jsonb
    )
    or (
      event_name = 'share_link_created'
      and owner_play_id is not null
      and share_link_id is not null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
    or (
      event_name in ('share_handoff_succeeded', 'share_link_copied')
      and owner_play_id is not null
      and share_link_id is not null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and (
        properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
        or (
          properties->>'entrySource' = 'profile_reshare'
          and properties - array[
            'packVersion', 'linkKind', 'entrySource'
          ]::text[] = '{}'::jsonb
        )
      )
    )
    or (
      event_name = 'profile_viewed'
      and owner_play_id is not null
      and share_link_id is null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties - 'packVersion' = '{}'::jsonb
    )
    or (
      event_name = 'profile_reshare_clicked'
      and owner_play_id is not null
      and share_link_id is null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'entrySource' = 'profile_reshare'
      and properties - array['packVersion', 'entrySource']::text[] = '{}'::jsonb
    )
    or (
      event_name = 'invite_opened'
      and owner_play_id is null
      and share_link_id is null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
    or (
      event_name in (
        'relationship_selected',
        'visitor_response_started',
        'visitor_required_answer_saved',
        'visitor_required_submitted',
        'comparison_viewed',
        'same_pack_start_clicked',
        'optional_answers_started',
        'optional_answers_completed'
      )
      and owner_play_id is null
      and share_link_id is null
      and visitor_response_id is not null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
  );

create or replace function public.get_owner_profile(
  p_play_id uuid,
  p_management_secret_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth jsonb;
  v_management_expires_at timestamptz;
  v_status text;
  v_pack_version_id uuid;
  v_pack_slug text;
  v_pack_version text;
  v_pack_title text;
  v_self_answer_count integer;
  v_sight_count bigint;
  v_cards jsonb;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
  then
    raise exception using errcode = '22023', message = 'invalid owner profile input';
  end if;

  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    true
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;

  select
    play.management_expires_at,
    play.status,
    play.pack_version_id,
    template.slug,
    version.version,
    template.title,
    (
      select count(*)::integer
      from public.self_answers as answer
      where answer.pack_play_id = play.id
    )
  into
    v_management_expires_at,
    v_status,
    v_pack_version_id,
    v_pack_slug,
    v_pack_version,
    v_pack_title,
    v_self_answer_count
  from public.pack_plays as play
  join public.pack_versions as version
    on version.id = play.pack_version_id
  join public.pack_templates as template
    on template.id = version.template_id
  where play.id = p_play_id;

  if v_status <> 'completed' or v_self_answer_count <> 10 then
    return jsonb_build_object(
      'outcome', 'not_completed',
      'managementExpiresAt', v_management_expires_at,
      'managementTtlSeconds', 604800
    );
  end if;

  select count(*)
  into v_sight_count
  from public.visitor_responses as response
  join public.share_links as link
    on link.id = response.share_link_id
  where link.pack_play_id = p_play_id
    and link.kind = 'public'
    and response.pack_version_id = v_pack_version_id
    and response.status = 'submitted';

  select jsonb_agg(
    jsonb_build_object(
      'cardId', card.id,
      'position', card.position,
      'ownerPrompt', card.owner_prompt,
      'optionA', card.option_a,
      'optionB', card.option_b,
      'selfChoice', self_answer.choice,
      'sampleCount', coalesce(sample.sample_count, 0),
      'counts', case
        when coalesce(sample.sample_count, 0) < 3 then null
        else jsonb_build_object(
          'a', sample.choice_a_count,
          'b', sample.choice_b_count
        )
      end
    )
    order by card.position
  )
  into v_cards
  from public.pack_cards as card
  join public.self_answers as self_answer
    on self_answer.pack_play_id = p_play_id
    and self_answer.pack_version_id = card.pack_version_id
    and self_answer.card_id = card.id
  left join (
    select
      assignment.card_id,
      count(*) as sample_count,
      count(*) filter (where answer.choice = 'a') as choice_a_count,
      count(*) filter (where answer.choice = 'b') as choice_b_count
    from public.visitor_answers as answer
    join public.visitor_assignments as assignment
      on assignment.response_id = answer.response_id
      and assignment.pack_version_id = answer.pack_version_id
      and assignment.card_id = answer.card_id
    join public.visitor_responses as response
      on response.id = assignment.response_id
      and response.pack_version_id = assignment.pack_version_id
    join public.share_links as link
      on link.id = response.share_link_id
    where assignment.pack_version_id = v_pack_version_id
      and link.pack_play_id = p_play_id
      and link.kind = 'public'
      and response.status = 'submitted'
    group by assignment.card_id
  ) as sample
    on sample.card_id = card.id
  where card.pack_version_id = v_pack_version_id;

  if jsonb_array_length(coalesce(v_cards, '[]'::jsonb)) <> 10 then
    raise exception using errcode = '55000', message = 'owner profile card invariant failed';
  end if;

  return jsonb_build_object(
    'outcome', 'authorized',
    'managementExpiresAt', v_management_expires_at,
    'managementTtlSeconds', 604800,
    'profile', jsonb_build_object(
      'playId', p_play_id,
      'packSlug', v_pack_slug,
      'packVersion', v_pack_version,
      'packTitle', v_pack_title,
      'sightCount', v_sight_count,
      'sightStatus', case
        when v_sight_count = 0 then 'empty'
        else 'has_sight'
      end,
      'cards', v_cards
    )
  );
end
$function$;

create or replace view private.core_funnel_stage_counts
with (security_invoker = false)
as
with
marker as (
  select started_at
  from private.analytics_measurement_markers
  where name = 'core_funnel_v1'
),
owner_completed as (
  select event.owner_play_id, min(event.occurred_at) as completed_at
  from public.analytics_events as event, marker
  where event.event_name = 'self_pack_completed'
    and event.owner_play_id is not null
    and event.occurred_at >= marker.started_at
  group by event.owner_play_id
),
owner_public_link as (
  select event.owner_play_id, event.share_link_id, min(event.occurred_at) as created_at
  from public.analytics_events as event
  join owner_completed as completed
    on completed.owner_play_id = event.owner_play_id
   and event.occurred_at >= completed.completed_at
  where event.event_name = 'share_link_created'
    and event.share_link_id is not null
    and event.properties->>'linkKind' = 'public'
  group by event.owner_play_id, event.share_link_id
),
owner_public_share as (
  select link.owner_play_id, link.share_link_id, min(event.occurred_at) as shared_at
  from owner_public_link as link
  join public.analytics_events as event
    on event.owner_play_id = link.owner_play_id
   and event.share_link_id = link.share_link_id
   and event.occurred_at >= link.created_at
  where event.event_name in ('share_handoff_succeeded', 'share_link_copied')
    and event.properties->>'linkKind' = 'public'
  group by link.owner_play_id, link.share_link_id
),
visitor_submitted as (
  select
    event.visitor_response_id,
    min(event.properties->>'packVersion') as pack_version,
    min(event.occurred_at) as submitted_at
  from public.analytics_events as event
  join public.visitor_responses as response
    on response.id = event.visitor_response_id
   and response.status = 'submitted'
  cross join marker
  where event.event_name = 'visitor_required_submitted'
    and event.occurred_at >= marker.started_at
  group by event.visitor_response_id
),
visitor_compared as (
  select
    submitted.visitor_response_id,
    submitted.pack_version,
    min(event.occurred_at) as compared_at
  from visitor_submitted as submitted
  join public.analytics_events as event
    on event.visitor_response_id = submitted.visitor_response_id
   and event.occurred_at >= submitted.submitted_at
  where event.event_name = 'comparison_viewed'
  group by submitted.visitor_response_id, submitted.pack_version
),
visitor_optional_started as (
  select
    compared.visitor_response_id,
    compared.pack_version,
    min(event.occurred_at) as started_at
  from visitor_compared as compared
  join public.analytics_events as event
    on event.visitor_response_id = compared.visitor_response_id
  where event.event_name = 'optional_answers_started'
  group by compared.visitor_response_id, compared.pack_version
),
visitor_optional_completed as (
  select started.visitor_response_id
  from visitor_optional_started as started
  join public.analytics_events as event
    on event.visitor_response_id = started.visitor_response_id
   and event.occurred_at >= started.started_at
  where event.event_name = 'optional_answers_completed'
  group by started.visitor_response_id
),
visitor_clicked as (
  select
    compared.visitor_response_id,
    compared.pack_version
  from visitor_compared as compared
  join public.analytics_events as event
    on event.visitor_response_id = compared.visitor_response_id
   and event.occurred_at >= compared.compared_at
  cross join marker
  where event.event_name = 'same_pack_start_clicked'
    and event.occurred_at >= marker.started_at
  group by compared.visitor_response_id, compared.pack_version
),
visitor_new_owner as (
  select clicked.visitor_response_id
  from visitor_clicked as clicked
  join public.analytics_events as event
    on event.visitor_response_id = clicked.visitor_response_id
  cross join marker
  where event.event_name = 'pack_opened'
    and event.owner_play_id is not null
    and event.occurred_at >= marker.started_at
    and event.properties->>'entrySource' = 'same_pack_cta'
    and event.properties->>'packVersion' = clicked.pack_version
  group by clicked.visitor_response_id
),
profile_viewed as (
  select event.owner_play_id, min(event.occurred_at) as viewed_at
  from public.analytics_events as event, marker
  where event.event_name = 'profile_viewed'
    and event.owner_play_id is not null
    and event.occurred_at >= marker.started_at
  group by event.owner_play_id
),
profile_clicked as (
  select viewed.owner_play_id, min(event.occurred_at) as clicked_at
  from profile_viewed as viewed
  join public.analytics_events as event
    on event.owner_play_id = viewed.owner_play_id
   and event.occurred_at >= viewed.viewed_at
  where event.event_name = 'profile_reshare_clicked'
  group by viewed.owner_play_id
),
profile_shared as (
  select clicked.owner_play_id, event.share_link_id, min(event.occurred_at) as shared_at
  from profile_clicked as clicked
  join public.analytics_events as event
    on event.owner_play_id = clicked.owner_play_id
   and event.occurred_at >= clicked.clicked_at
  where event.event_name in ('share_handoff_succeeded', 'share_link_copied')
    and event.share_link_id is not null
    and event.properties->>'linkKind' = 'public'
    and event.properties->>'entrySource' = 'profile_reshare'
  group by clicked.owner_play_id, event.share_link_id
),
profile_downstream as (
  select shared.owner_play_id
  from profile_shared as shared
  join public.visitor_responses as response
    on response.share_link_id = shared.share_link_id
   and response.status = 'submitted'
   and response.submitted_at >= shared.shared_at
  group by shared.owner_play_id
)
select 'owner_share'::text as funnel, 'self_pack_completed'::text as stage,
  count(*)::bigint as subjects from owner_completed
union all
select 'owner_share', 'public_link_created', count(distinct owner_play_id)::bigint
from owner_public_link
union all
select 'owner_share', 'public_share_succeeded', count(distinct owner_play_id)::bigint
from owner_public_share
union all
select 'visitor_same_pack', 'visitor_required_submitted', count(*)::bigint
from visitor_submitted
union all
select 'visitor_same_pack', 'comparison_viewed', count(*)::bigint
from visitor_compared
union all
select 'visitor_same_pack', 'same_pack_start_clicked', count(*)::bigint
from visitor_clicked
union all
select 'visitor_same_pack', 'new_owner_pack_opened', count(*)::bigint
from visitor_new_owner
union all
select 'visitor_optional', 'comparison_viewed', count(*)::bigint
from visitor_compared
union all
select 'visitor_optional', 'optional_answers_started', count(*)::bigint
from visitor_optional_started
union all
select 'visitor_optional', 'optional_answers_completed', count(*)::bigint
from visitor_optional_completed
union all
select 'profile_reshare', 'profile_viewed', count(*)::bigint
from profile_viewed
union all
select 'profile_reshare', 'profile_reshare_clicked', count(*)::bigint
from profile_clicked
union all
select 'profile_reshare', 'profile_share_succeeded', count(distinct owner_play_id)::bigint
from profile_shared
union all
select 'profile_reshare', 'downstream_visitor_submitted', count(*)::bigint
from profile_downstream;

alter function public.assign_optional_cards(uuid, bytea)
  owner to gyeop_internal_rpc;
alter function public.save_response_answer(uuid, bytea, text, text)
  owner to gyeop_internal_rpc;
alter function public.get_owner_profile(uuid, bytea)
  owner to gyeop_internal_rpc;

revoke execute on function public.assign_optional_cards(uuid, bytea)
  from public, anon, authenticated;

grant execute on function public.assign_optional_cards(uuid, bytea)
  to service_role;

revoke all privileges on table private.core_funnel_stage_counts
  from public, anon, authenticated, service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke create on schema private from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
