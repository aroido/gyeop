begin;

grant gyeop_internal_rpc to postgres;
grant create on schema public to gyeop_internal_rpc;

drop function public.record_authenticated_owner_profile_event(uuid, uuid, text);

create function public.record_authenticated_owner_profile_event(
  p_play_id uuid,
  p_actor_id uuid,
  p_event_name text,
  p_concept_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash bytea;
  v_pack_version text;
  v_status text;
begin
  if p_concept_id is not null
    and (
      p_event_name not in ('profile_reshare_clicked', 'concept_detail_opened')
      or length(p_concept_id) not between 1 and 64
      or p_concept_id !~ '^(rel|exp|act|dec|coop|reg|att|pref)\.[a-z]+$'
    )
  then
    raise exception using errcode = '22023', message = 'invalid owner profile concept event input';
  end if;

  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if p_event_name <> 'profile_reshare_clicked' or p_concept_id is null then
    return public.record_owner_profile_event(p_play_id, v_hash, p_event_name);
  end if;

  select play.status, version.version
  into v_status, v_pack_version
  from public.pack_plays as play
  join public.pack_versions as version on version.id = play.pack_version_id
  where play.id = p_play_id;

  if v_status <> 'completed' then
    return jsonb_build_object('outcome', 'not_completed');
  end if;

  insert into public.analytics_events (
    event_name,
    owner_play_id,
    properties
  ) values (
    'profile_viewed',
    p_play_id,
    jsonb_build_object('packVersion', v_pack_version)
  );

  insert into public.analytics_events (
    event_name,
    owner_play_id,
    properties
  ) values (
    'profile_reshare_clicked',
    p_play_id,
    jsonb_build_object(
      'packVersion', v_pack_version,
      'entrySource', 'profile_reshare'
    )
  );

  return jsonb_build_object('outcome', 'recorded');
end
$function$;

alter function public.record_authenticated_owner_profile_event(
  uuid, uuid, text, text
) owner to gyeop_internal_rpc;

revoke execute on function public.record_authenticated_owner_profile_event(
  uuid, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.record_authenticated_owner_profile_event(
  uuid, uuid, text, text
) to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
