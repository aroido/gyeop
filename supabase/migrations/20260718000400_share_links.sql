begin;

create table public.share_links (
  id uuid primary key,
  public_id text not null unique
    check (public_id ~ '^[A-Za-z0-9_-]{21}[AQgw]$'),
  pack_play_id uuid not null
    references public.pack_plays (id)
    on update restrict
    on delete cascade,
  kind text not null
    check (kind in ('public', 'one_to_one')),
  secret_hash bytea not null unique
    check (octet_length(secret_hash) = 32),
  status text not null default 'active'
    check (status in ('active', 'disabled', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index share_links_play_status_created_idx
  on public.share_links (pack_play_id, status, created_at desc);

alter table public.share_links enable row level security;

grant select, insert, update on table public.share_links
  to gyeop_internal_rpc;
grant insert on table public.analytics_events
  to gyeop_internal_rpc;

create policy share_links_internal_select
  on public.share_links
  for select
  to gyeop_internal_rpc
  using (true);

create policy share_links_internal_insert
  on public.share_links
  for insert
  to gyeop_internal_rpc
  with check (true);

create policy share_links_internal_update
  on public.share_links
  for update
  to gyeop_internal_rpc
  using (true)
  with check (true);

create policy analytics_share_invite_internal_insert
  on public.analytics_events
  for insert
  to gyeop_internal_rpc
  with check (
    event_name in ('share_link_created', 'invite_opened')
    and jsonb_typeof(properties->'packVersion') = 'string'
    and properties->>'linkKind' in ('public', 'one_to_one')
    and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
  );

create or replace function private.share_link_state(p_link_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $function$
  select jsonb_build_object(
    'id', link.id,
    'publicId', link.public_id,
    'kind', link.kind,
    'status', link.status,
    'expiresAt', link.expires_at,
    'consumedAt', null
  )
  from public.share_links as link
  where link.id = p_link_id;
$function$;

create or replace function public.create_share_link(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_link_id uuid,
  p_public_id text,
  p_secret_hash bytea,
  p_kind text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth jsonb;
  v_now timestamptz;
  v_pack_version text;
  v_play_status text;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
    or p_link_id is null
    or p_public_id is null
    or p_public_id !~ '^[A-Za-z0-9_-]{21}[AQgw]$'
    or p_secret_hash is null
    or octet_length(p_secret_hash) <> 32
    or p_kind not in ('public', 'one_to_one')
    or (p_expires_at is not null and p_expires_at <= clock_timestamp())
  then
    raise exception using errcode = '22023', message = 'invalid share link input';
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

  begin
    insert into public.share_links (
      id,
      public_id,
      pack_play_id,
      kind,
      secret_hash,
      expires_at
    ) values (
      p_link_id,
      p_public_id,
      p_play_id,
      p_kind,
      p_secret_hash,
      p_expires_at
    );

    insert into public.analytics_events (event_name, properties)
    values (
      'share_link_created',
      jsonb_build_object(
        'packVersion', v_pack_version,
        'linkKind', p_kind
      )
    );
  exception
    when unique_violation then
      return jsonb_build_object('outcome', 'collision');
  end;

  v_now := clock_timestamp();
  update public.pack_plays as play
  set last_active_at = v_now,
      management_expires_at = v_now + interval '7 days',
      updated_at = v_now
  where play.id = p_play_id;

  return jsonb_build_object(
    'outcome', 'created',
    'link', private.share_link_state(p_link_id),
    'managementExpiresAt', v_now + interval '7 days',
    'managementTtlSeconds', 604800
  );
end
$function$;

create or replace function public.disable_share_link(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth jsonb;
  v_now timestamptz;
  v_play_status text;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
    or p_link_id is null
  then
    raise exception using errcode = '22023', message = 'invalid share link input';
  end if;

  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    false
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;

  select play.status
  into v_play_status
  from public.pack_plays as play
  where play.id = p_play_id;
  if v_play_status <> 'completed' then
    return jsonb_build_object('outcome', 'not_completed');
  end if;

  perform 1
  from public.share_links as link
  where link.id = p_link_id
    and link.pack_play_id = p_play_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'link_not_found');
  end if;

  v_now := clock_timestamp();
  update public.share_links as link
  set status = case
        when link.status = 'active'
          and link.expires_at is not null
          and link.expires_at <= v_now
        then 'expired'
        when link.status = 'active' then 'disabled'
        else link.status
      end,
      updated_at = case
        when link.status = 'active' then v_now
        else link.updated_at
      end
  where link.id = p_link_id;

  update public.pack_plays as play
  set last_active_at = v_now,
      management_expires_at = v_now + interval '7 days',
      updated_at = v_now
  where play.id = p_play_id;

  return jsonb_build_object(
    'outcome', 'disabled',
    'link', private.share_link_state(p_link_id),
    'managementExpiresAt', v_now + interval '7 days',
    'managementTtlSeconds', 604800
  );
end
$function$;

create or replace function public.rotate_share_link(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_link_id uuid,
  p_new_link_id uuid,
  p_new_public_id text,
  p_new_secret_hash bytea
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
    or p_new_link_id is null
    or p_new_public_id is null
    or p_new_public_id !~ '^[A-Za-z0-9_-]{21}[AQgw]$'
    or p_new_secret_hash is null
    or octet_length(p_new_secret_hash) <> 32
  then
    raise exception using errcode = '22023', message = 'invalid share link input';
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
  if v_link_status <> 'active' then
    return jsonb_build_object('outcome', 'link_not_active');
  end if;

  begin
    insert into public.share_links (
      id,
      public_id,
      pack_play_id,
      kind,
      secret_hash,
      expires_at
    ) values (
      p_new_link_id,
      p_new_public_id,
      p_play_id,
      v_kind,
      p_new_secret_hash,
      v_expires_at
    );

    update public.share_links as link
    set status = 'disabled',
        updated_at = v_now
    where link.id = p_link_id;

    insert into public.analytics_events (event_name, properties)
    values (
      'share_link_created',
      jsonb_build_object(
        'packVersion', v_pack_version,
        'linkKind', v_kind
      )
    );
  exception
    when unique_violation then
      return jsonb_build_object('outcome', 'collision');
  end;

  update public.pack_plays as play
  set last_active_at = v_now,
      management_expires_at = v_now + interval '7 days',
      updated_at = v_now
  where play.id = p_play_id;

  return jsonb_build_object(
    'outcome', 'rotated',
    'link', private.share_link_state(p_new_link_id),
    'managementExpiresAt', v_now + interval '7 days',
    'managementTtlSeconds', 604800
  );
end
$function$;

create or replace function public.list_owner_share_links(
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
  v_links jsonb;
  v_now timestamptz;
  v_play_status text;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
  then
    raise exception using errcode = '22023', message = 'invalid share link input';
  end if;

  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    false
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;

  select play.status
  into v_play_status
  from public.pack_plays as play
  where play.id = p_play_id;
  if v_play_status <> 'completed' then
    return jsonb_build_object('outcome', 'not_completed');
  end if;

  v_now := clock_timestamp();
  update public.share_links as link
  set status = 'expired',
      updated_at = v_now
  where link.pack_play_id = p_play_id
    and link.status = 'active'
    and link.expires_at is not null
    and link.expires_at <= v_now;

  select coalesce(
    jsonb_agg(
      private.share_link_state(link.id)
      order by link.created_at desc, link.id
    ),
    '[]'::jsonb
  )
  into v_links
  from public.share_links as link
  where link.pack_play_id = p_play_id;

  update public.pack_plays as play
  set last_active_at = v_now,
      management_expires_at = v_now + interval '7 days',
      updated_at = v_now
  where play.id = p_play_id;

  return jsonb_build_object(
    'outcome', 'listed',
    'links', v_links,
    'managementExpiresAt', v_now + interval '7 days',
    'managementTtlSeconds', 604800
  );
end
$function$;

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
  v_link_id uuid;
  v_now timestamptz;
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
    link.id,
    link.kind,
    link.status,
    link.expires_at,
    template.slug,
    template.title,
    version.version
  into
    v_link_id,
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
    and link.secret_hash = p_secret_hash
  for update of link;

  if not found then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  v_now := clock_timestamp();
  if v_status = 'active'
    and v_expires_at is not null
    and v_expires_at <= v_now
  then
    update public.share_links as link
    set status = 'expired',
        updated_at = v_now
    where link.id = v_link_id;
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  if v_status <> 'active' then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  insert into public.analytics_events (event_name, properties)
  values (
    'invite_opened',
    jsonb_build_object(
      'packVersion', v_pack_version,
      'linkKind', v_kind
    )
  );

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

grant create on schema public to gyeop_internal_rpc;
grant create on schema private to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

alter function private.share_link_state(uuid)
  owner to gyeop_internal_rpc;
alter function public.create_share_link(uuid, bytea, uuid, text, bytea, text, timestamptz)
  owner to gyeop_internal_rpc;
alter function public.disable_share_link(uuid, bytea, uuid)
  owner to gyeop_internal_rpc;
alter function public.rotate_share_link(uuid, bytea, uuid, uuid, text, bytea)
  owner to gyeop_internal_rpc;
alter function public.list_owner_share_links(uuid, bytea)
  owner to gyeop_internal_rpc;
alter function public.get_invite_metadata(text, bytea)
  owner to gyeop_internal_rpc;

revoke execute on function private.share_link_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.share_link_state(uuid)
  to gyeop_internal_rpc;

revoke execute on function public.create_share_link(uuid, bytea, uuid, text, bytea, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.disable_share_link(uuid, bytea, uuid)
  from public, anon, authenticated;
revoke execute on function public.rotate_share_link(uuid, bytea, uuid, uuid, text, bytea)
  from public, anon, authenticated;
revoke execute on function public.list_owner_share_links(uuid, bytea)
  from public, anon, authenticated;
revoke execute on function public.get_invite_metadata(text, bytea)
  from public, anon, authenticated;

grant execute on function public.create_share_link(uuid, bytea, uuid, text, bytea, text, timestamptz)
  to service_role;
grant execute on function public.disable_share_link(uuid, bytea, uuid)
  to service_role;
grant execute on function public.rotate_share_link(uuid, bytea, uuid, uuid, text, bytea)
  to service_role;
grant execute on function public.list_owner_share_links(uuid, bytea)
  to service_role;
grant execute on function public.get_invite_metadata(text, bytea)
  to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke create on schema private from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

revoke all privileges on table public.share_links
  from public, anon, authenticated, service_role;
revoke all privileges on table public.analytics_events
  from public, anon, authenticated, service_role;

commit;
