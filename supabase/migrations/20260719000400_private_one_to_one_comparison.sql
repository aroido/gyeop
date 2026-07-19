begin;

create function public.list_owner_1to1_responses(
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
  v_responses jsonb;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
  then
    raise exception using
      errcode = '22023',
      message = 'invalid private one-to-one list input';
  end if;

  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    true
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;

  select play.management_expires_at, play.status
  into v_management_expires_at, v_status
  from public.pack_plays as play
  where play.id = p_play_id;

  if v_status <> 'completed' then
    return jsonb_build_object(
      'outcome', 'not_completed',
      'managementExpiresAt', v_management_expires_at,
      'managementTtlSeconds', 604800
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', response.id,
        'shareLinkId', link.id,
        'status', response.status,
        'relationshipCode', response.relationship_code,
        'knownSinceCode', response.known_since_code,
        'submittedAt', response.submitted_at,
        'withdrawnAt', response.withdrawn_at
      )
      order by response.submitted_at desc, response.id
    ),
    '[]'::jsonb
  )
  into v_responses
  from public.share_links as link
  join public.visitor_responses as response
    on response.id = link.consumed_response_id
    and response.share_link_id = link.id
  where link.pack_play_id = p_play_id
    and link.kind = 'one_to_one'
    and link.status = 'disabled'
    and response.status in ('submitted', 'withdrawn');

  return jsonb_build_object(
    'outcome', 'listed',
    'managementExpiresAt', v_management_expires_at,
    'managementTtlSeconds', 604800,
    'responses', v_responses
  );
end
$function$;

create function public.get_private_1to1_comparison(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_response_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_all_matched boolean;
  v_assignments jsonb;
  v_auth jsonb;
  v_known_since_code text;
  v_management_expires_at timestamptz;
  v_pack_title text;
  v_relationship_code text;
  v_required_answer_count integer;
  v_required_assignment_count integer;
  v_required_owner_answer_count integer;
  v_status text;
  v_submitted_at timestamptz;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
    or p_response_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'invalid private one-to-one comparison input';
  end if;

  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    true
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;

  select play.management_expires_at, play.status
  into v_management_expires_at, v_status
  from public.pack_plays as play
  where play.id = p_play_id;

  if v_status <> 'completed' then
    return jsonb_build_object(
      'outcome', 'not_completed',
      'managementExpiresAt', v_management_expires_at,
      'managementTtlSeconds', 604800
    );
  end if;

  select
    template.title,
    response.relationship_code,
    response.known_since_code,
    response.submitted_at
  into
    v_pack_title,
    v_relationship_code,
    v_known_since_code,
    v_submitted_at
  from public.visitor_responses as response
  join public.share_links as link
    on link.id = response.share_link_id
  join public.pack_versions as version
    on version.id = response.pack_version_id
  join public.pack_templates as template
    on template.id = version.template_id
  where response.id = p_response_id
    and response.status = 'submitted'
    and link.pack_play_id = p_play_id
    and link.kind = 'one_to_one'
    and link.status = 'disabled'
    and link.consumed_response_id = response.id;

  if not found then
    return jsonb_build_object('outcome', 'response_not_found');
  end if;

  select
    count(*) filter (where assignment.stage = 'required')::integer,
    count(answer.card_id) filter (where assignment.stage = 'required')::integer,
    count(owner_answer.card_id) filter (where assignment.stage = 'required')::integer
  into
    v_required_assignment_count,
    v_required_answer_count,
    v_required_owner_answer_count
  from public.visitor_assignments as assignment
  left join public.visitor_answers as answer
    on answer.response_id = assignment.response_id
    and answer.pack_version_id = assignment.pack_version_id
    and answer.card_id = assignment.card_id
  left join public.self_answers as owner_answer
    on owner_answer.pack_play_id = p_play_id
    and owner_answer.pack_version_id = assignment.pack_version_id
    and owner_answer.card_id = assignment.card_id
  where assignment.response_id = p_response_id;

  if v_required_assignment_count <> 3
    or v_required_answer_count <> 3
    or v_required_owner_answer_count <> 3
  then
    raise exception using
      errcode = '55000',
      message = 'private one-to-one required comparison invariant failed';
  end if;

  select
    not exists (
      select 1
      from public.visitor_assignments as mismatch_assignment
      join public.visitor_answers as mismatch_answer
        on mismatch_answer.response_id = mismatch_assignment.response_id
        and mismatch_answer.pack_version_id = mismatch_assignment.pack_version_id
        and mismatch_answer.card_id = mismatch_assignment.card_id
      join public.self_answers as mismatch_owner_answer
        on mismatch_owner_answer.pack_play_id = p_play_id
        and mismatch_owner_answer.pack_version_id = mismatch_assignment.pack_version_id
        and mismatch_owner_answer.card_id = mismatch_assignment.card_id
      where mismatch_assignment.response_id = p_response_id
        and mismatch_assignment.stage = 'required'
        and mismatch_answer.choice <> mismatch_owner_answer.choice
    ),
    jsonb_agg(
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
        'ownerChoice', owner_answer.choice,
        'matches', answer.choice = owner_answer.choice,
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
              on highlight_owner_answer.pack_play_id = p_play_id
              and highlight_owner_answer.pack_version_id = highlight_assignment.pack_version_id
              and highlight_owner_answer.card_id = highlight_assignment.card_id
            where highlight_assignment.response_id = p_response_id
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
  into v_all_matched, v_assignments
  from public.visitor_assignments as assignment
  join public.visitor_answers as answer
    on answer.response_id = assignment.response_id
    and answer.pack_version_id = assignment.pack_version_id
    and answer.card_id = assignment.card_id
  join public.pack_cards as card
    on card.pack_version_id = assignment.pack_version_id
    and card.id = assignment.card_id
  join public.self_answers as owner_answer
    on owner_answer.pack_play_id = p_play_id
    and owner_answer.pack_version_id = assignment.pack_version_id
    and owner_answer.card_id = assignment.card_id
  where assignment.response_id = p_response_id;

  if jsonb_array_length(coalesce(v_assignments, '[]'::jsonb)) not between 3 and 5 then
    raise exception using
      errcode = '55000',
      message = 'private one-to-one comparison invariant failed';
  end if;

  return jsonb_build_object(
    'outcome', 'authorized',
    'managementExpiresAt', v_management_expires_at,
    'managementTtlSeconds', 604800,
    'comparison', jsonb_build_object(
      'id', p_response_id,
      'packTitle', v_pack_title,
      'relationshipCode', v_relationship_code,
      'knownSinceCode', v_known_since_code,
      'submittedAt', v_submitted_at,
      'allMatched', v_all_matched,
      'assignments', v_assignments
    )
  );
end
$function$;

grant create on schema public to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

alter function public.list_owner_1to1_responses(uuid, bytea)
  owner to gyeop_internal_rpc;
alter function public.get_private_1to1_comparison(uuid, bytea, uuid)
  owner to gyeop_internal_rpc;

revoke execute on function public.list_owner_1to1_responses(uuid, bytea)
  from public, anon, authenticated;
revoke execute on function public.get_private_1to1_comparison(uuid, bytea, uuid)
  from public, anon, authenticated;

grant execute on function public.list_owner_1to1_responses(uuid, bytea)
  to service_role;
grant execute on function public.get_private_1to1_comparison(uuid, bytea, uuid)
  to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
