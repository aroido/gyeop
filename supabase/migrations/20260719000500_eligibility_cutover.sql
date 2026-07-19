begin;

truncate table
  public.analytics_events,
  public.visitor_answers,
  public.visitor_assignments,
  public.visitor_responses,
  public.share_links,
  public.self_answers,
  public.pack_plays,
  public.rate_limit_buckets;

grant create on schema public, private to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres with inherit false, set true;
set local role gyeop_internal_rpc;

create or replace function public.get_invite_metadata(
  p_public_id text,
  p_secret_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expires_at timestamptz;
  v_kind text;
  v_pack_slug text;
  v_pack_title text;
  v_pack_version text;
  v_status text;
begin
  if p_public_id is null
    or p_public_id !~ '^[A-Za-z0-9_-]{21}[AQgw]$'
    or p_secret_hash is null
    or octet_length(p_secret_hash) <> 32
  then
    raise exception using errcode = '22023', message = 'invalid invite input';
  end if;

  select
    link.kind,
    link.status,
    link.expires_at,
    template.slug,
    template.title,
    version.version
  into
    v_kind,
    v_status,
    v_expires_at,
    v_pack_slug,
    v_pack_title,
    v_pack_version
  from public.share_links as link
  join public.pack_plays as play
    on play.id = link.pack_play_id
  join public.pack_versions as version
    on version.id = play.pack_version_id
  join public.pack_templates as template
    on template.id = version.template_id
  where link.public_id = p_public_id
    and link.secret_hash = p_secret_hash;

  if not found then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  if v_status <> 'active'
    or (v_expires_at is not null and v_expires_at <= clock_timestamp())
  then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  return jsonb_build_object(
    'outcome', 'active',
    'metadata', jsonb_build_object(
      'packSlug', v_pack_slug,
      'packVersion', v_pack_version,
      'packTitle', v_pack_title,
      'kind', v_kind
    )
  );
end
$function$;

create or replace function private.record_response_invite_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_kind text;
  v_pack_version text;
begin
  select link.kind, version.version
  into strict v_kind, v_pack_version
  from public.share_links as link
  join public.pack_versions as version
    on version.id = new.pack_version_id
  where link.id = new.share_link_id;

  insert into public.analytics_events (event_name, properties)
  values (
    'invite_opened',
    jsonb_build_object(
      'packVersion', v_pack_version,
      'linkKind', v_kind
    )
  );
  return new;
end
$function$;

alter function private.record_response_invite_open()
  owner to gyeop_internal_rpc;
revoke execute on function private.record_response_invite_open()
  from public, anon, authenticated, service_role;
grant execute on function private.record_response_invite_open()
  to postgres;

reset role;
revoke create on schema public, private from gyeop_internal_rpc;

drop trigger if exists visitor_response_invite_open
  on public.visitor_responses;
create trigger visitor_response_invite_open
after insert on public.visitor_responses
for each row
when (new.status = 'draft')
execute function private.record_response_invite_open();

set local role gyeop_internal_rpc;
revoke execute on function private.record_response_invite_open()
  from postgres;
reset role;
revoke gyeop_internal_rpc from postgres granted by postgres;

update private.analytics_measurement_markers
set started_at = clock_timestamp()
where name = 'core_funnel_v1';

do $cutover$
begin
  if (select count(*) from private.analytics_measurement_markers
      where name = 'core_funnel_v1') <> 1 then
    raise exception 'core funnel measurement marker is missing';
  end if;
end
$cutover$;

commit;
