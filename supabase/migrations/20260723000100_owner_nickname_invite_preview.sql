begin;

grant gyeop_internal_rpc to postgres;
grant create on schema public to gyeop_internal_rpc;
grant create on schema private to gyeop_internal_rpc;

create table public.owner_public_profiles (
  owner_id uuid primary key
    references auth.users (id)
    on update restrict
    on delete cascade,
  nickname text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint owner_public_profiles_nickname_check check (
    nickname = normalize(nickname, NFKC)
    and char_length(nickname) between 2 and 12
    and nickname ~ '^[가-힣A-Za-z0-9]+( [가-힣A-Za-z0-9]+)*$'
  )
);

alter table public.owner_public_profiles enable row level security;

grant select, insert, update on table public.owner_public_profiles
  to gyeop_internal_rpc;

create policy owner_public_profiles_internal_select
  on public.owner_public_profiles
  for select
  to gyeop_internal_rpc
  using (true);

create policy owner_public_profiles_internal_insert
  on public.owner_public_profiles
  for insert
  to gyeop_internal_rpc
  with check (true);

create policy owner_public_profiles_internal_update
  on public.owner_public_profiles
  for update
  to gyeop_internal_rpc
  using (true)
  with check (true);

alter table public.share_links
  add column preview_nickname text,
  add constraint share_links_preview_nickname_check check (
    preview_nickname is null
    or (
      preview_nickname = normalize(preview_nickname, NFKC)
      and char_length(preview_nickname) between 2 and 12
      and preview_nickname ~ '^[가-힣A-Za-z0-9]+( [가-힣A-Za-z0-9]+)*$'
    )
  );

create index share_links_preview_retention_idx
  on public.share_links (expires_at, created_at, kind)
  where preview_nickname is not null;

create function public.get_authenticated_owner_public_profile(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $function$
declare
  v_nickname text;
begin
  if p_actor_id is null then
    raise exception using errcode = '22023', message = 'invalid authenticated owner input';
  end if;

  select profile.nickname
  into v_nickname
  from public.owner_public_profiles as profile
  where profile.owner_id = p_actor_id;

  if not found then
    return jsonb_build_object('outcome', 'incomplete');
  end if;

  return jsonb_build_object('outcome', 'complete', 'nickname', v_nickname);
end
$function$;

create function public.set_authenticated_owner_nickname(
  p_actor_id uuid,
  p_nickname text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_id is null
    or p_nickname is null
    or p_nickname <> normalize(p_nickname, NFKC)
    or char_length(p_nickname) not between 2 and 12
    or p_nickname !~ '^[가-힣A-Za-z0-9]+( [가-힣A-Za-z0-9]+)*$'
  then
    raise exception using errcode = '22023', message = 'invalid owner nickname';
  end if;

  insert into public.owner_public_profiles (
    owner_id,
    nickname,
    created_at,
    updated_at
  ) values (
    p_actor_id,
    p_nickname,
    v_now,
    v_now
  )
  on conflict (owner_id) do update
  set nickname = excluded.nickname,
      updated_at = excluded.updated_at;

  return jsonb_build_object('outcome', 'saved', 'nickname', p_nickname);
end
$function$;

create function private.clear_inactive_invite_preview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status = 'active' and new.status <> 'active' then
    new.preview_nickname := null;
  end if;
  return new;
end
$function$;

create trigger clear_inactive_invite_preview
before update of status on public.share_links
for each row execute function private.clear_inactive_invite_preview();

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
  v_created_at timestamptz;
  v_due_at timestamptz;
  v_expires_at timestamptz;
  v_kind text;
  v_link_status text;
  v_new_expires_at timestamptz;
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
  join public.pack_versions as version on version.id = play.pack_version_id
  where play.id = p_play_id;
  if v_play_status <> 'completed' then
    return jsonb_build_object('outcome', 'not_completed');
  end if;

  select link.status, link.kind, link.expires_at, link.created_at
  into v_link_status, v_kind, v_expires_at, v_created_at
  from public.share_links as link
  where link.id = p_link_id
    and link.pack_play_id = p_play_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'link_not_found');
  end if;

  v_now := clock_timestamp();
  v_due_at := coalesce(
    v_expires_at,
    v_created_at + case
      when v_kind = 'public' then interval '30 days'
      else interval '7 days'
    end
  );
  if v_link_status = 'active' and v_due_at <= v_now then
    update public.share_links as link
    set status = 'expired', updated_at = v_now
    where link.id = p_link_id;
    return jsonb_build_object('outcome', 'link_not_active');
  end if;
  if v_link_status <> 'active' then
    return jsonb_build_object('outcome', 'link_not_active');
  end if;

  v_new_expires_at := coalesce(
    v_expires_at,
    v_now + case
      when v_kind = 'public' then interval '30 days'
      else interval '7 days'
    end
  );

  begin
    insert into public.share_links (
      id, public_id, pack_play_id, kind, secret_hash, expires_at
    ) values (
      p_new_link_id, p_new_public_id, p_play_id, v_kind,
      p_new_secret_hash, v_new_expires_at
    );

    update public.share_links as link
    set status = 'disabled', updated_at = v_now
    where link.id = p_link_id;

    insert into public.analytics_events (
      event_name, owner_play_id, share_link_id, properties
    ) values (
      'share_link_created',
      p_play_id,
      p_new_link_id,
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

create or replace function public.create_authenticated_share_link(
  p_play_id uuid,
  p_actor_id uuid,
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
  v_expires_at timestamptz;
  v_hash bytea;
  v_nickname text;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_expires_at is not null then
    raise exception using errcode = '22023', message = 'invalid share link input';
  end if;

  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select profile.nickname
  into v_nickname
  from public.owner_public_profiles as profile
  where profile.owner_id = p_actor_id;
  if not found then
    return jsonb_build_object('outcome', 'profile_incomplete');
  end if;

  v_expires_at := v_now + case
    when p_kind = 'public' then interval '30 days'
    when p_kind = 'one_to_one' then interval '7 days'
    else interval '0 seconds'
  end;

  v_result := public.create_claimed_share_link(
    p_play_id, v_hash, p_link_id, p_public_id, p_secret_hash, p_kind, v_expires_at
  );
  if v_result->>'outcome' = 'created' then
    update public.share_links as link
    set preview_nickname = v_nickname
    where link.id = p_link_id;
  end if;
  return v_result;
end
$function$;

create or replace function public.rotate_authenticated_share_link(
  p_play_id uuid,
  p_actor_id uuid,
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
  v_hash bytea;
  v_nickname text;
  v_result jsonb;
begin
  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select profile.nickname
  into v_nickname
  from public.owner_public_profiles as profile
  where profile.owner_id = p_actor_id;
  if not found then
    return jsonb_build_object('outcome', 'profile_incomplete');
  end if;

  v_result := public.rotate_share_link(
    p_play_id, v_hash, p_link_id, p_new_link_id, p_new_public_id, p_new_secret_hash
  );
  if v_result->>'outcome' = 'rotated' then
    update public.share_links as link
    set preview_nickname = v_nickname
    where link.id = p_new_link_id;
  end if;
  return v_result;
end
$function$;

create function public.get_invite_preview(p_public_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $function$
declare
  v_result jsonb;
begin
  if p_public_id is null or p_public_id !~ '^[A-Za-z0-9_-]{21}[AQgw]$' then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  select jsonb_build_object(
    'outcome', 'available',
    'previewNickname', link.preview_nickname,
    'kind', link.kind,
    'packSlug', template.slug,
    'packVersion', version.version,
    'packTitle', template.title,
    'sensitivity', template.sensitivity
  )
  into v_result
  from public.share_links as link
  join public.pack_plays as play on play.id = link.pack_play_id
  join public.pack_versions as version on version.id = play.pack_version_id
  join public.pack_templates as template on template.id = version.template_id
  where link.public_id = p_public_id
    and link.status = 'active'
    and link.preview_nickname is not null
    and coalesce(
      link.expires_at,
      link.created_at + case
        when link.kind = 'public' then interval '30 days'
        else interval '7 days'
      end
    ) > statement_timestamp();

  return coalesce(v_result, jsonb_build_object('outcome', 'unavailable'));
end
$function$;

alter function private.run_local_retention_cleanup(timestamptz)
  rename to run_local_retention_cleanup_without_invite_previews;

create function private.run_local_retention_cleanup(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_base jsonb;
  v_invite_previews jsonb;
  v_updated integer;
begin
  if p_now is null then
    raise exception using errcode = '22023', message = 'invalid cleanup time';
  end if;

  v_base := private.run_local_retention_cleanup_without_invite_previews(p_now);

  begin
    update public.share_links as link
    set preview_nickname = null,
        updated_at = p_now
    where link.id in (
      select candidate.id
      from public.share_links as candidate
      where candidate.preview_nickname is not null
        and coalesce(
          candidate.expires_at,
          candidate.created_at + case
            when candidate.kind = 'public' then interval '30 days'
            else interval '7 days'
          end
        ) + interval '24 hours' <= p_now
      order by
        coalesce(
          candidate.expires_at,
          candidate.created_at + case
            when candidate.kind = 'public' then interval '30 days'
            else interval '7 days'
          end
        ),
        candidate.id
      limit 100
    );
    get diagnostics v_updated = row_count;
    v_invite_previews := jsonb_build_object(
      'outcome', 'ok',
      'updated_count', v_updated,
      'remaining_count', (
        select count(*)
        from public.share_links as link
        where link.preview_nickname is not null
          and coalesce(
            link.expires_at,
            link.created_at + case
              when link.kind = 'public' then interval '30 days'
              else interval '7 days'
            end
          ) + interval '24 hours' <= p_now
      ),
      'oldest_due_at', (
        select min(
          coalesce(
            link.expires_at,
            link.created_at + case
              when link.kind = 'public' then interval '30 days'
              else interval '7 days'
            end
          ) + interval '24 hours'
        )
        from public.share_links as link
        where link.preview_nickname is not null
          and coalesce(
            link.expires_at,
            link.created_at + case
              when link.kind = 'public' then interval '30 days'
              else interval '7 days'
            end
          ) + interval '24 hours' <= p_now
      )
    );
  exception when others then
    v_invite_previews := jsonb_build_object(
      'outcome', 'error',
      'error_code', 'category_failed',
      'updated_count', 0,
      'remaining_count', null,
      'oldest_due_at', null
    );
  end;

  return v_base || jsonb_build_object('invite_previews', v_invite_previews);
end
$function$;

create or replace function public.run_local_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not pg_try_advisory_xact_lock(
    hashtextextended('public.run_local_retention_cleanup', 0)
  ) then
    return jsonb_build_object(
      'outcome', 'busy',
      'anonymous_owner_trees', jsonb_build_object(
        'outcome', 'busy', 'deleted_count', 0,
        'remaining_count', null, 'oldest_due_at', null
      ),
      'visitor_drafts', jsonb_build_object(
        'outcome', 'busy', 'deleted_count', 0,
        'remaining_count', null, 'oldest_due_at', null
      ),
      'submitted_sessions', jsonb_build_object(
        'outcome', 'busy', 'updated_count', 0,
        'remaining_count', null, 'oldest_due_at', null
      ),
      'rate_limit_buckets', jsonb_build_object(
        'outcome', 'busy', 'deleted_count', 0,
        'remaining_count', null, 'oldest_due_at', null
      ),
      'analytics_events', jsonb_build_object(
        'outcome', 'busy', 'deleted_count', 0,
        'remaining_count', null, 'oldest_due_at', null
      ),
      'invite_previews', jsonb_build_object(
        'outcome', 'busy', 'updated_count', 0,
        'remaining_count', null, 'oldest_due_at', null
      )
    );
  end if;

  return private.run_local_retention_cleanup(clock_timestamp());
end
$function$;

alter function public.get_authenticated_owner_public_profile(uuid)
  owner to gyeop_internal_rpc;
alter function public.set_authenticated_owner_nickname(uuid, text)
  owner to gyeop_internal_rpc;
alter function private.clear_inactive_invite_preview()
  owner to gyeop_internal_rpc;
alter function public.rotate_share_link(uuid, bytea, uuid, uuid, text, bytea)
  owner to gyeop_internal_rpc;
alter function public.create_authenticated_share_link(uuid, uuid, uuid, text, bytea, text, timestamptz)
  owner to gyeop_internal_rpc;
alter function public.rotate_authenticated_share_link(uuid, uuid, uuid, uuid, text, bytea)
  owner to gyeop_internal_rpc;
alter function public.get_invite_preview(text)
  owner to gyeop_internal_rpc;
alter function private.run_local_retention_cleanup_without_invite_previews(timestamptz)
  owner to gyeop_internal_rpc;
alter function private.run_local_retention_cleanup(timestamptz)
  owner to gyeop_internal_rpc;
alter function public.run_local_retention_cleanup()
  owner to gyeop_internal_rpc;

revoke execute on function public.get_authenticated_owner_public_profile(uuid)
  from public, anon, authenticated;
revoke execute on function public.set_authenticated_owner_nickname(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.get_invite_preview(text)
  from public, anon, authenticated;
revoke execute on function private.run_local_retention_cleanup_without_invite_previews(timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.run_local_retention_cleanup(timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.get_authenticated_owner_public_profile(uuid)
  to service_role;
grant execute on function public.set_authenticated_owner_nickname(uuid, text)
  to service_role;
grant execute on function public.get_invite_preview(text)
  to service_role;
grant execute on function private.run_local_retention_cleanup_without_invite_previews(timestamptz)
  to gyeop_internal_rpc;
grant execute on function private.run_local_retention_cleanup(timestamptz)
  to gyeop_internal_rpc;

revoke create on schema public from gyeop_internal_rpc;
revoke create on schema private from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
