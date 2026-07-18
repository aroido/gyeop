begin;

create policy analytics_profile_viewed_internal_insert
  on public.analytics_events
  for insert
  to gyeop_internal_rpc
  with check (
    visitor_response_id is null
    and event_name = 'profile_viewed'
    and jsonb_typeof(properties->'packVersion') = 'string'
    and properties - array['packVersion']::text[] = '{}'::jsonb
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
      and assignment.stage = 'required'
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
  v_status text;
  v_pack_version text;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
    or p_event_name <> 'profile_viewed'
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

  select play.status, version.version
  into v_status, v_pack_version
  from public.pack_plays as play
  join public.pack_versions as version
    on version.id = play.pack_version_id
  where play.id = p_play_id;

  if v_status <> 'completed' then
    return jsonb_build_object('outcome', 'not_completed');
  end if;

  insert into public.analytics_events (event_name, properties)
  values (
    'profile_viewed',
    jsonb_build_object('packVersion', v_pack_version)
  );

  return jsonb_build_object('outcome', 'recorded');
end
$function$;

grant create on schema public to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

alter function public.get_owner_profile(uuid, bytea)
  owner to gyeop_internal_rpc;
alter function public.record_owner_profile_event(uuid, bytea, text)
  owner to gyeop_internal_rpc;

revoke execute on function public.get_owner_profile(uuid, bytea)
  from public, anon, authenticated;
revoke execute on function public.record_owner_profile_event(uuid, bytea, text)
  from public, anon, authenticated;

grant execute on function public.get_owner_profile(uuid, bytea)
  to service_role;
grant execute on function public.record_owner_profile_event(uuid, bytea, text)
  to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
