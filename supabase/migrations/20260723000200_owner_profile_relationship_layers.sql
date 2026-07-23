begin;

grant create on schema public to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

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
  v_relationship_layers jsonb;
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

  with
  valid_responses as materialized (
    select response.id, response.relationship_code
    from public.visitor_responses as response
    join public.share_links as link
      on link.id = response.share_link_id
    where link.pack_play_id = p_play_id
      and link.kind = 'public'
      and response.pack_version_id = v_pack_version_id
      and response.status = 'submitted'
  ),
  relationship_sights as (
    select
      response.relationship_code,
      count(*)::bigint as sight_count
    from valid_responses as response
    group by response.relationship_code
  ),
  answer_samples as (
    select
      response.relationship_code,
      assignment.card_id,
      count(*)::bigint as sample_count,
      count(*) filter (where answer.choice = 'a')::bigint as choice_a_count,
      count(*) filter (where answer.choice = 'b')::bigint as choice_b_count
    from valid_responses as response
    join public.visitor_assignments as assignment
      on assignment.response_id = response.id
      and assignment.pack_version_id = v_pack_version_id
    join public.visitor_answers as answer
      on answer.response_id = assignment.response_id
      and answer.pack_version_id = assignment.pack_version_id
      and answer.card_id = assignment.card_id
    group by response.relationship_code, assignment.card_id
  ),
  safe_samples as (
    select
      sample.card_id,
      sum(sample.sample_count)::bigint as sample_count,
      sum(sample.choice_a_count)::bigint as choice_a_count,
      sum(sample.choice_b_count)::bigint as choice_b_count
    from answer_samples as sample
    join relationship_sights as sight
      on sight.relationship_code = sample.relationship_code
    where sight.sight_count >= 3
      and sample.sample_count >= 3
    group by sample.card_id
  ),
  owner_cards as materialized (
    select
      card.id,
      card.position,
      card.owner_prompt,
      card.option_a,
      card.option_b,
      self_answer.choice
    from public.pack_cards as card
    join public.self_answers as self_answer
      on self_answer.pack_play_id = p_play_id
      and self_answer.pack_version_id = card.pack_version_id
      and self_answer.card_id = card.id
    where card.pack_version_id = v_pack_version_id
  )
  select
    (select count(*)::bigint from valid_responses),
    (
      select jsonb_agg(
        jsonb_build_object(
          'cardId', card.id,
          'position', card.position,
          'ownerPrompt', card.owner_prompt,
          'optionA', card.option_a,
          'optionB', card.option_b,
          'selfChoice', card.choice,
          'sampleCount', coalesce(sample.sample_count, 0),
          'counts', case
            when sample.sample_count is null then null
            else jsonb_build_object(
              'a', sample.choice_a_count,
              'b', sample.choice_b_count
            )
          end
        )
        order by card.position
      )
      from owner_cards as card
      left join safe_samples as sample
        on sample.card_id = card.id
    ),
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'relationshipCode', sight.relationship_code,
            'sightCount', sight.sight_count,
            'status', case
              when sight.sight_count < 3 then 'collecting'
              else 'available'
            end,
            'cards', case
              when sight.sight_count < 3 then '[]'::jsonb
              else (
                select jsonb_agg(
                  case
                    when coalesce(sample.sample_count, 0) < 3
                    then jsonb_build_object(
                      'cardId', card.id,
                      'sampleCount', coalesce(sample.sample_count, 0),
                      'status', 'collecting'
                    )
                    else jsonb_build_object(
                      'cardId', card.id,
                      'sampleCount', sample.sample_count,
                      'status', 'available',
                      'counts', jsonb_build_object(
                        'a', sample.choice_a_count,
                        'b', sample.choice_b_count
                      )
                    )
                  end
                  order by card.position
                )
                from owner_cards as card
                left join answer_samples as sample
                  on sample.relationship_code = sight.relationship_code
                  and sample.card_id = card.id
              )
            end
          )
          order by array_position(
            array[
              'old_friend',
              'school_friend',
              'coworker',
              'romantic',
              'family',
              'online_friend',
              'social_follower',
              'other'
            ]::text[],
            sight.relationship_code
          )
        ),
        '[]'::jsonb
      )
      from relationship_sights as sight
    )
  into v_sight_count, v_cards, v_relationship_layers;

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
      'cards', v_cards,
      'relationshipLayers', v_relationship_layers
    )
  );
end
$function$;

alter function public.get_owner_profile(uuid, bytea)
  owner to gyeop_internal_rpc;

revoke execute on function public.get_owner_profile(uuid, bytea)
  from public, anon, authenticated;

grant execute on function public.get_owner_profile(uuid, bytea)
  to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
