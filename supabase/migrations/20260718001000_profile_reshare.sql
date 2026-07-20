begin;

create policy analytics_profile_reshare_internal_insert
  on public.analytics_events
  for insert
  to gyeop_internal_rpc
  with check (
    visitor_response_id is null
    and (
      (
        event_name = 'profile_reshare_clicked'
        and jsonb_typeof(properties->'packVersion') = 'string'
        and properties->>'entrySource' = 'profile_reshare'
        and properties - array['packVersion', 'entrySource']::text[] = '{}'::jsonb
      )
      or (
        event_name in ('share_handoff_succeeded', 'share_link_copied')
        and jsonb_typeof(properties->'packVersion') = 'string'
        and properties->>'linkKind' in ('public', 'one_to_one')
        and properties->>'entrySource' = 'profile_reshare'
        and properties - array[
          'packVersion', 'linkKind', 'entrySource'
        ]::text[] = '{}'::jsonb
      )
    )
  );

grant create on schema public to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

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
    or p_event_name not in ('profile_viewed', 'profile_reshare_clicked')
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
      join public.share_links as link
        on link.id = response.share_link_id
      where link.pack_play_id = play.id
        and link.kind = 'public'
        and response.pack_version_id = play.pack_version_id
        and response.status = 'submitted'
    )
  into v_status, v_pack_version, v_has_sight
  from public.pack_plays as play
  join public.pack_versions as version
    on version.id = play.pack_version_id
  where play.id = p_play_id;

  if v_status <> 'completed' then
    return jsonb_build_object('outcome', 'not_completed');
  end if;
  if p_event_name = 'profile_reshare_clicked' and not v_has_sight then
    return jsonb_build_object('outcome', 'not_eligible');
  end if;

  insert into public.analytics_events (event_name, properties)
  values (
    p_event_name,
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

create function public.record_owner_share_action_with_source(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_link_id uuid,
  p_event_name text,
  p_entry_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth jsonb;
  v_expires_at timestamptz;
  v_kind text;
  v_link_status text;
  v_now timestamptz;
  v_pack_version text;
  v_play_status text;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
    or p_link_id is null
    or p_event_name is null
    or p_event_name not in ('share_handoff_succeeded', 'share_link_copied')
    or (p_entry_source is not null and p_entry_source <> 'profile_reshare')
  then
    raise exception using errcode = '22023', message = 'invalid share action input';
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
  into v_play_status, v_pack_version
  from public.pack_plays as play
  join public.pack_versions as version
    on version.id = play.pack_version_id
  where play.id = p_play_id;

  if v_play_status <> 'completed' then
    return jsonb_build_object('outcome', 'not_completed');
  end if;

  select link.status, link.kind, link.expires_at
  into v_link_status, v_kind, v_expires_at
  from public.share_links as link
  where link.id = p_link_id
    and link.pack_play_id = p_play_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'link_not_found');
  end if;

  v_now := clock_timestamp();
  if v_link_status = 'active'
    and v_expires_at is not null
    and v_expires_at <= v_now
  then
    update public.share_links as link
    set status = 'expired',
        updated_at = v_now
    where link.id = p_link_id;
    return jsonb_build_object('outcome', 'link_not_active');
  end if;
  if v_link_status <> 'active'
    or v_kind not in ('public', 'one_to_one')
  then
    return jsonb_build_object('outcome', 'link_not_active');
  end if;

  insert into public.analytics_events (event_name, properties)
  values (
    p_event_name,
    jsonb_build_object(
      'packVersion', v_pack_version,
      'linkKind', v_kind
    ) || case
      when p_entry_source = 'profile_reshare'
        then jsonb_build_object('entrySource', p_entry_source)
      else '{}'::jsonb
    end
  );

  update public.pack_plays as play
  set last_active_at = v_now,
      management_expires_at = v_now + interval '7 days',
      updated_at = v_now
  where play.id = p_play_id;

  return jsonb_build_object(
    'outcome', 'recorded',
    'managementExpiresAt', v_now + interval '7 days',
    'managementTtlSeconds', 604800
  );
end
$function$;

alter function public.record_owner_share_action_with_source(
  uuid, bytea, uuid, text, text
) owner to gyeop_internal_rpc;

revoke execute on function public.record_owner_share_action_with_source(
  uuid, bytea, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.record_owner_share_action_with_source(
  uuid, bytea, uuid, text, text
) to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
