begin;

grant create on schema public to gyeop_internal_rpc;
grant create on schema private to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

alter table public.pack_versions
  add column concept_version smallint
    check (concept_version is null or concept_version = 1);

alter table public.pack_cards
  add column concept_context text,
  add column concept_signals jsonb;

alter table public.pack_cards
  add constraint pack_cards_concept_columns_check check (
    (
      concept_context is null
      and concept_signals is null
    )
    or (
      concept_context = btrim(concept_context)
      and length(concept_context) between 1 and 120
      and jsonb_typeof(concept_signals) = 'array'
      and jsonb_array_length(concept_signals) between 1 and 2
    )
  );

create or replace function public.publish_pack_version(p_pack_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_template_id uuid;
  v_published_at timestamptz;
  v_concept_version smallint;
  v_card_count integer;
  v_distinct_positions integer;
  v_min_position integer;
  v_max_position integer;
  v_signature_count integer;
  v_invalid_concept_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_pack_version_id is null then
    raise exception using errcode = '22023', message = 'pack version id is required';
  end if;

  select version.template_id, version.published_at, version.concept_version
  into v_template_id, v_published_at, v_concept_version
  from public.pack_versions as version
  where version.id = p_pack_version_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'pack version not found';
  end if;
  if v_published_at is not null then
    raise exception using errcode = '55000', message = 'pack version is already published';
  end if;

  perform 1
  from public.pack_templates as template
  where template.id = v_template_id
  for update;

  select
    count(*)::integer,
    count(distinct card.position)::integer,
    min(card.position)::integer,
    max(card.position)::integer,
    count(*) filter (where card.is_signature)::integer,
    count(*) filter (
      where (
        v_concept_version is null
        and (card.concept_context is not null or card.concept_signals is not null)
      )
      or (
        v_concept_version = 1
        and (
          card.concept_context is null
          or card.concept_signals is null
          or exists (
            select 1
            from pg_catalog.jsonb_array_elements(card.concept_signals) as signal(value)
            where jsonb_typeof(signal.value) <> 'object'
              or signal.value - array['conceptId', 'directionForOptionA']::text[]
                <> '{}'::jsonb
              or signal.value->>'conceptId' not in (
                'rel.entry', 'rel.range', 'rel.cadence', 'rel.distance',
                'exp.reaction', 'exp.processing', 'exp.intensity', 'exp.form',
                'act.preparation', 'act.start', 'act.routine',
                'act.adjustment', 'dec.convergence', 'dec.openness',
                'dec.experiment', 'dec.revision', 'coop.role',
                'coop.ambiguity', 'coop.support', 'coop.sync', 'reg.source',
                'reg.stimulus', 'reg.motion', 'reg.transition', 'att.memory',
                'att.reading', 'att.experience', 'att.story',
                'pref.stability', 'pref.discovery', 'pref.focus',
                'pref.familiarity'
              )
              or signal.value->>'directionForOptionA' not in ('a', 'b')
          )
          or (
            select count(distinct signal.value->>'conceptId')
            from pg_catalog.jsonb_array_elements(card.concept_signals) as signal(value)
          ) <> jsonb_array_length(card.concept_signals)
        )
      )
    )::integer
  into
    v_card_count,
    v_distinct_positions,
    v_min_position,
    v_max_position,
    v_signature_count,
    v_invalid_concept_count
  from public.pack_cards as card
  where card.pack_version_id = p_pack_version_id;

  if v_card_count <> 10
    or v_distinct_positions <> 10
    or v_min_position <> 1
    or v_max_position <> 10
    or v_signature_count <> 1
  then
    raise exception using errcode = '23514', message = 'pack version must contain positions 1 through 10 and exactly one signature card';
  end if;
  if v_invalid_concept_count <> 0 then
    raise exception using errcode = '23514', message = 'pack concept metadata is invalid';
  end if;

  perform set_config('gyeop.pack_publish_version_id', p_pack_version_id::text, true);

  update public.pack_versions as version
  set published_at = v_now
  where version.id = p_pack_version_id;

  update public.pack_templates as template
  set published_version_id = p_pack_version_id,
      updated_at = v_now
  where template.id = v_template_id;

  return p_pack_version_id;
end
$function$;

create or replace function private.owner_play_pack(p_play_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $function$
  select jsonb_build_object(
    'slug', template.slug,
    'title', template.title,
    'version', version.version,
    'targetRelationship', template.target_relationship,
    'sensitivity', template.sensitivity,
    'cards', (
      select jsonb_agg(
        jsonb_build_object(
          'id', card.id,
          'position', card.position,
          'ownerPrompt', card.owner_prompt,
          'visitorPrompt', card.visitor_prompt,
          'optionA', card.option_a,
          'optionB', card.option_b,
          'isSignature', card.is_signature
        )
        order by card.position
      )
      from public.pack_cards as card
      where card.pack_version_id = version.id
    )
  )
  from public.pack_plays as play
  join public.pack_versions as version
    on version.id = play.pack_version_id
  join public.pack_templates as template
    on template.id = version.template_id
  where play.id = p_play_id
    and version.published_at is not null;
$function$;

create function public.get_owner_play_pack(
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
  v_pack jsonb;
begin
  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    true
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;
  v_pack := private.owner_play_pack(p_play_id);
  if v_pack is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return jsonb_build_object(
    'outcome', 'authorized',
    'pack', v_pack
  );
end
$function$;

create function public.get_authenticated_owner_play_pack(
  p_play_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $function$
declare
  v_pack jsonb;
begin
  if not exists (
    select 1
    from public.pack_plays as play
    where play.id = p_play_id
      and play.owner_id = p_actor_id
  ) then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  v_pack := private.owner_play_pack(p_play_id);
  if v_pack is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return jsonb_build_object(
    'outcome', 'authorized',
    'pack', v_pack
  );
end
$function$;

create or replace function public.list_authenticated_owner_plays(p_actor_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $function$
  select jsonb_build_object(
    'outcome', 'listed',
    'plays', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', play.id,
          'packSlug', template.slug,
          'packVersion', version.version,
          'packTitle', template.title,
          'status', play.status,
          'answeredCount', (
            select count(*)::integer
            from public.self_answers as answer
            where answer.pack_play_id = play.id
          ),
          'updatedAt', play.updated_at,
          'completedAt', play.completed_at
        )
        order by play.updated_at desc, play.id
      ) filter (where play.id is not null),
      '[]'::jsonb
    )
  )
  from public.pack_plays as play
  join public.pack_versions as version
    on version.id = play.pack_version_id
  join public.pack_templates as template
    on template.id = version.template_id
  where play.owner_id = p_actor_id;
$function$;

create or replace function public.create_or_resume_play_with_source(
  p_pack_slug text,
  p_existing_play_id uuid,
  p_existing_secret_hash bytea,
  p_new_play_id uuid,
  p_new_secret_hash bytea,
  p_network_key bytea,
  p_entry_source text,
  p_source_response_id uuid,
  p_source_session_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth jsonb;
  v_effective_source text := 'home';
  v_limit record;
  v_now timestamptz;
  v_owner_actor_id uuid;
  v_owner_id uuid;
  v_pack_template_id uuid;
  v_pack_version text;
  v_pack_version_id uuid;
  v_play_id uuid;
  v_retry_after_seconds integer;
  v_source_response_id uuid;
begin
  if p_pack_slug is null
    or length(p_pack_slug) not between 1 and 64
    or p_pack_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or (p_existing_play_id is null) <> (p_existing_secret_hash is null)
    or (p_new_play_id is null) <> (p_new_secret_hash is null)
    or (p_existing_play_id is null) = (p_new_play_id is null)
    or (p_existing_secret_hash is not null and octet_length(p_existing_secret_hash) <> 32)
    or (p_new_secret_hash is not null and octet_length(p_new_secret_hash) <> 32)
    or p_network_key is null
    or octet_length(p_network_key) <> 32
    or p_entry_source not in ('home', 'same_pack_cta')
    or (p_source_response_id is null) <> (p_source_session_hash is null)
    or (p_source_session_hash is not null and octet_length(p_source_session_hash) <> 32)
  then
    raise exception using errcode = '22023', message = 'invalid owner play input';
  end if;

  select template.id, version.id, version.version
  into v_pack_template_id, v_pack_version_id, v_pack_version
  from public.pack_templates as template
  join public.pack_versions as version
    on version.template_id = template.id
   and version.id = template.published_version_id
  where template.slug = p_pack_slug
    and template.is_active
    and version.published_at is not null
  for update of template;

  if not found then
    return jsonb_build_object('outcome', 'pack_not_found');
  end if;

  if p_existing_play_id is not null then
    v_auth := private.authorize_owner_play_capability(
      p_existing_play_id,
      p_existing_secret_hash,
      false
    );
    if v_auth->>'outcome' <> 'authorized' then
      return v_auth;
    end if;

    v_owner_id := p_existing_play_id;

    select play.id
    into v_play_id
    from public.pack_plays as play
    where play.anonymous_owner_id = v_owner_id
      and play.pack_version_id = v_pack_version_id;

    if found then
      v_now := clock_timestamp();
      update public.pack_plays as play
      set last_active_at = v_now,
          management_expires_at = v_now + interval '7 days',
          updated_at = v_now
      where play.id = v_play_id;

      return jsonb_build_object(
        'outcome', 'resumed',
        'play', private.owner_play_state(v_play_id)
      );
    end if;

    select play.owner_id
    into v_owner_actor_id
    from public.pack_plays as play
    where play.id = p_existing_play_id;
    v_play_id := gen_random_uuid();
  else
    v_owner_id := p_new_play_id;
    v_play_id := p_new_play_id;
  end if;

  begin
    select *
    into strict v_limit
    from public.consume_rate_limit(
      p_network_key,
      'owner_draft_create',
      3600,
      5
    );

    if not v_limit.allowed then
      v_retry_after_seconds := v_limit.retry_after_seconds;
      raise exception using errcode = 'P1701', message = 'owner draft rate limited';
    end if;

    v_now := clock_timestamp();

    if p_new_play_id is not null then
      insert into public.anonymous_owners (
        id,
        management_secret_hash,
        management_expires_at,
        last_active_at,
        management_revoked_at,
        created_at,
        updated_at
      ) values (
        v_owner_id,
        p_new_secret_hash,
        v_now + interval '7 days',
        v_now,
        null,
        v_now,
        v_now
      );
    end if;

    insert into public.pack_plays (
      id,
      pack_version_id,
      anonymous_owner_id,
      owner_id,
      management_secret_hash,
      management_expires_at,
      last_active_at,
      management_revoked_at,
      status,
      current_position,
      created_at,
      updated_at
    ) values (
      v_play_id,
      v_pack_version_id,
      v_owner_id,
      v_owner_actor_id,
      null,
      v_now + interval '7 days',
      v_now,
      v_now,
      'draft',
      1,
      v_now,
      v_now
    );
  exception
    when sqlstate 'P1701' then
      return jsonb_build_object(
        'outcome', 'rate_limited',
        'retryAfterSeconds', v_retry_after_seconds
      );
  end;

  if p_entry_source = 'same_pack_cta'
    and p_source_response_id is not null
  then
    select response.id
    into v_source_response_id
    from public.visitor_responses as response
    join public.pack_versions as source_version
      on source_version.id = response.pack_version_id
    join public.pack_templates as source_template
      on source_template.id = source_version.template_id
    where response.id = p_source_response_id
      and response.session_token_hash = p_source_session_hash
      and response.session_expires_at > clock_timestamp()
      and response.status = 'submitted'
      and source_template.id = v_pack_template_id
      and source_template.slug = p_pack_slug;

    if found then
      v_effective_source := 'same_pack_cta';
    end if;
  end if;

  insert into public.analytics_events (
    event_name,
    owner_play_id,
    visitor_response_id,
    properties
  ) values (
    'pack_opened',
    v_play_id,
    v_source_response_id,
    jsonb_build_object(
      'packVersion', v_pack_version,
      'entrySource', v_effective_source
    )
  );

  return jsonb_build_object(
    'outcome', 'created',
    'play', private.owner_play_state(v_play_id)
  );
end
$function$;

create or replace function public.record_owner_profile_event(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_event_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth jsonb;
  v_has_sight boolean;
  v_status text;
  v_pack_version text;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
    or p_event_name not in (
      'profile_viewed',
      'profile_reshare_clicked',
      'concept_profile_viewed',
      'concept_detail_opened'
    )
  then
    raise exception using errcode = '22023', message = 'invalid owner profile event input';
  end if;

  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    false
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;

  select
    play.status,
    version.version,
    exists (
      select 1
      from public.visitor_responses as response
      join public.share_links as link on link.id = response.share_link_id
      where link.pack_play_id = play.id
        and link.kind = 'public'
        and response.pack_version_id = play.pack_version_id
        and response.status = 'submitted'
    )
  into v_status, v_pack_version, v_has_sight
  from public.pack_plays as play
  join public.pack_versions as version on version.id = play.pack_version_id
  where play.id = p_play_id;

  if v_status <> 'completed' then
    return jsonb_build_object('outcome', 'not_completed');
  end if;
  if p_event_name = 'profile_reshare_clicked' and not v_has_sight then
    return jsonb_build_object('outcome', 'not_eligible');
  end if;

  if p_event_name = 'profile_reshare_clicked' then
    insert into public.analytics_events (
      event_name,
      owner_play_id,
      properties
    ) values (
      'profile_viewed',
      p_play_id,
      jsonb_build_object('packVersion', v_pack_version)
    );
  end if;

  insert into public.analytics_events (
    event_name,
    owner_play_id,
    properties
  ) values (
    p_event_name,
    p_play_id,
    case p_event_name
      when 'profile_reshare_clicked' then jsonb_build_object(
        'packVersion', v_pack_version,
        'entrySource', 'profile_reshare'
      )
      else jsonb_build_object('packVersion', v_pack_version)
    end
  );

  return jsonb_build_object('outcome', 'recorded');
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
      event_name in (
        'profile_viewed',
        'concept_profile_viewed',
        'concept_detail_opened'
      )
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
    source_template.id as template_id,
    source_template.slug as pack_slug,
    min(event.properties->>'packVersion') as pack_version,
    min(event.occurred_at) as submitted_at
  from public.analytics_events as event
  join public.visitor_responses as response
    on response.id = event.visitor_response_id
   and response.status = 'submitted'
  join public.pack_versions as source_version
    on source_version.id = response.pack_version_id
  join public.pack_templates as source_template
    on source_template.id = source_version.template_id
  cross join marker
  where event.event_name = 'visitor_required_submitted'
    and event.occurred_at >= marker.started_at
  group by event.visitor_response_id, source_template.id, source_template.slug
),
visitor_compared as (
  select
    submitted.visitor_response_id,
    submitted.template_id,
    submitted.pack_slug,
    submitted.pack_version,
    min(event.occurred_at) as compared_at
  from visitor_submitted as submitted
  join public.analytics_events as event
    on event.visitor_response_id = submitted.visitor_response_id
   and event.occurred_at >= submitted.submitted_at
  where event.event_name = 'comparison_viewed'
  group by
    submitted.visitor_response_id,
    submitted.template_id,
    submitted.pack_slug,
    submitted.pack_version
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
    compared.template_id,
    compared.pack_slug
  from visitor_compared as compared
  join public.analytics_events as event
    on event.visitor_response_id = compared.visitor_response_id
   and event.occurred_at >= compared.compared_at
  cross join marker
  where event.event_name = 'same_pack_start_clicked'
    and event.occurred_at >= marker.started_at
  group by
    compared.visitor_response_id,
    compared.template_id,
    compared.pack_slug
),
visitor_new_owner as (
  select clicked.visitor_response_id
  from visitor_clicked as clicked
  join public.analytics_events as event
    on event.visitor_response_id = clicked.visitor_response_id
  join public.pack_plays as new_play
    on new_play.id = event.owner_play_id
  join public.pack_versions as new_version
    on new_version.id = new_play.pack_version_id
  join public.pack_templates as new_template
    on new_template.id = new_version.template_id
   and new_template.id = clicked.template_id
   and new_template.slug = clicked.pack_slug
  cross join marker
  where event.event_name = 'pack_opened'
    and event.owner_play_id is not null
    and event.occurred_at >= marker.started_at
    and event.properties->>'entrySource' = 'same_pack_cta'
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

alter function public.publish_pack_version(uuid) owner to gyeop_internal_rpc;
alter function public.create_or_resume_play_with_source(
  text, uuid, bytea, uuid, bytea, bytea, text, uuid, bytea
) owner to gyeop_internal_rpc;
alter function public.record_owner_profile_event(uuid, bytea, text)
  owner to gyeop_internal_rpc;
alter function private.owner_play_pack(uuid) owner to gyeop_internal_rpc;
alter function public.get_owner_play_pack(uuid, bytea) owner to gyeop_internal_rpc;
alter function public.get_authenticated_owner_play_pack(uuid, uuid)
  owner to gyeop_internal_rpc;
alter function public.list_authenticated_owner_plays(uuid)
  owner to gyeop_internal_rpc;

revoke execute on function private.owner_play_pack(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.get_owner_play_pack(uuid, bytea)
  from public, anon, authenticated;
revoke execute on function public.get_authenticated_owner_play_pack(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.owner_play_pack(uuid) to gyeop_internal_rpc;
grant execute on function public.get_owner_play_pack(uuid, bytea) to service_role;
grant execute on function public.get_authenticated_owner_play_pack(uuid, uuid)
  to service_role;

revoke create on schema private from gyeop_internal_rpc;
revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
