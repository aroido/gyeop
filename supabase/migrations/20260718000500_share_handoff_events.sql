begin;

drop policy analytics_share_invite_internal_insert
  on public.analytics_events;

create policy analytics_share_flow_internal_insert
  on public.analytics_events
  for insert
  to gyeop_internal_rpc
  with check (
    event_name in (
      'share_link_created',
      'invite_opened',
      'share_handoff_succeeded',
      'share_link_copied'
    )
    and jsonb_typeof(properties->'packVersion') = 'string'
    and properties->>'linkKind' in ('public', 'one_to_one')
    and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
  );

create or replace function public.record_owner_share_action(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_link_id uuid,
  p_event_name text
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
    or p_event_name not in ('share_handoff_succeeded', 'share_link_copied')
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
    )
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

grant create on schema public to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

alter function public.record_owner_share_action(uuid, bytea, uuid, text)
  owner to gyeop_internal_rpc;

revoke execute on function public.record_owner_share_action(uuid, bytea, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_owner_share_action(uuid, bytea, uuid, text)
  to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
