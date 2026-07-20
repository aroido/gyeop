begin;

create table public.anonymous_owners (
  id uuid primary key,
  management_secret_hash bytea,
  management_expires_at timestamptz not null,
  last_active_at timestamptz not null,
  management_revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint anonymous_owners_management_hash_check check (
    management_secret_hash is null
    or octet_length(management_secret_hash) = 32
  ),
  constraint anonymous_owners_management_lifecycle_check check (
    (
      management_secret_hash is not null
      and management_revoked_at is null
    )
    or (
      management_secret_hash is null
      and management_revoked_at is not null
    )
  ),
  constraint anonymous_owners_management_expiry_check check (
    management_expires_at = last_active_at + interval '7 days'
  )
);

alter table public.anonymous_owners enable row level security;

grant select, insert, update on table public.anonymous_owners
  to gyeop_internal_rpc;

create policy anonymous_owners_internal_select
  on public.anonymous_owners
  for select
  to gyeop_internal_rpc
  using (true);

create policy anonymous_owners_internal_insert
  on public.anonymous_owners
  for insert
  to gyeop_internal_rpc
  with check (true);

create policy anonymous_owners_internal_update
  on public.anonymous_owners
  for update
  to gyeop_internal_rpc
  using (true)
  with check (true);

create unique index anonymous_owners_live_management_hash_idx
  on public.anonymous_owners (management_secret_hash)
  where management_secret_hash is not null;

create index anonymous_owners_management_expires_at_idx
  on public.anonymous_owners (management_expires_at);

alter table public.pack_plays
  add column anonymous_owner_id uuid,
  add column owner_id uuid
    references auth.users (id)
    on update restrict
    on delete restrict;

insert into public.anonymous_owners (
  id,
  management_secret_hash,
  management_expires_at,
  last_active_at,
  management_revoked_at,
  created_at,
  updated_at
)
select
  play.id,
  play.management_secret_hash,
  play.management_expires_at,
  play.last_active_at,
  play.management_revoked_at,
  play.created_at,
  play.updated_at
from public.pack_plays as play;

update public.pack_plays as play
set anonymous_owner_id = play.id,
    management_secret_hash = null,
    management_revoked_at = coalesce(play.management_revoked_at, clock_timestamp());

alter table public.pack_plays
  alter column anonymous_owner_id set not null,
  add constraint pack_plays_anonymous_owner_fk
    foreign key (anonymous_owner_id)
    references public.anonymous_owners (id)
    on update restrict
    on delete cascade,
  add constraint pack_plays_anonymous_owner_version_unique
    unique (anonymous_owner_id, pack_version_id);

create index pack_plays_owner_id_updated_at_idx
  on public.pack_plays (owner_id, updated_at desc)
  where owner_id is not null;

grant gyeop_internal_rpc to postgres;
grant create on schema public to gyeop_internal_rpc;
grant create on schema private to gyeop_internal_rpc;

create or replace function private.owner_play_state(p_play_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $function$
  select jsonb_build_object(
    'id', play.id,
    'packSlug', template.slug,
    'packVersion', version.version,
    'status', play.status,
    'currentPosition', play.current_position,
    'answers', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cardId', answer.card_id,
            'choice', answer.choice
          )
          order by card.position
        )
        from public.self_answers as answer
        join public.pack_cards as card
          on card.pack_version_id = answer.pack_version_id
         and card.id = answer.card_id
        where answer.pack_play_id = play.id
      ),
      '[]'::jsonb
    ),
    'managementExpiresAt', owner.management_expires_at,
    'managementTtlSeconds', 604800
  )
  from public.pack_plays as play
  join public.anonymous_owners as owner
    on owner.id = play.anonymous_owner_id
  join public.pack_versions as version
    on version.id = play.pack_version_id
  join public.pack_templates as template
    on template.id = version.template_id
  where play.id = p_play_id;
$function$;

create or replace function private.authorize_owner_play_capability(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_touch boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_owner_id uuid;
  v_expires_at timestamptz;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
    or p_touch is null
  then
    raise exception using errcode = '22023', message = 'invalid owner capability';
  end if;

  select owner.id, owner.management_expires_at
  into v_owner_id, v_expires_at
  from public.pack_plays as play
  join public.anonymous_owners as owner
    on owner.id = play.anonymous_owner_id
  where play.id = p_play_id
    and owner.management_secret_hash = p_management_secret_hash
    and owner.management_revoked_at is null
  for update of owner;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_expires_at <= v_now then
    update public.anonymous_owners as owner
    set management_secret_hash = null,
        management_revoked_at = v_now,
        updated_at = v_now
    where owner.id = v_owner_id;

    update public.pack_plays as play
    set management_secret_hash = null,
        management_revoked_at = v_now,
        updated_at = v_now
    where play.anonymous_owner_id = v_owner_id;

    return jsonb_build_object('outcome', 'expired');
  end if;

  if p_touch then
    update public.anonymous_owners as owner
    set last_active_at = v_now,
        management_expires_at = v_now + interval '7 days',
        updated_at = v_now
    where owner.id = v_owner_id;

    update public.pack_plays as play
    set last_active_at = v_now,
        management_expires_at = v_now + interval '7 days',
        updated_at = v_now
    where play.id = p_play_id;
  end if;

  return jsonb_build_object('outcome', 'authorized');
end
$function$;

create function private.ensure_legacy_pack_play_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.anonymous_owner_id is null then
    insert into public.anonymous_owners (
      id,
      management_secret_hash,
      management_expires_at,
      last_active_at,
      management_revoked_at,
      created_at,
      updated_at
    ) values (
      new.id,
      new.management_secret_hash,
      new.management_expires_at,
      new.last_active_at,
      new.management_revoked_at,
      new.created_at,
      new.updated_at
    );
    new.anonymous_owner_id := new.id;
  end if;
  return new;
end
$function$;

create trigger ensure_legacy_pack_play_owner
before insert on public.pack_plays
for each row execute function private.ensure_legacy_pack_play_owner();

create function private.sync_anonymous_owner_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.anonymous_owners as owner
  set last_active_at = new.last_active_at,
      management_expires_at = new.management_expires_at,
      updated_at = new.updated_at
  where owner.id = new.anonymous_owner_id
    and owner.management_revoked_at is null;
  return new;
end
$function$;

create trigger sync_anonymous_owner_activity
after update of last_active_at, management_expires_at on public.pack_plays
for each row execute function private.sync_anonymous_owner_activity();

create function private.sync_anonymous_owner_revocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.anonymous_owners as owner
  set management_secret_hash = null,
      management_revoked_at = coalesce(owner.management_revoked_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where owner.id = new.anonymous_owner_id
    and owner.management_revoked_at is null;
  return new;
end
$function$;

create trigger sync_anonymous_owner_revocation
after update of management_secret_hash, management_revoked_at on public.pack_plays
for each row execute function private.sync_anonymous_owner_revocation();

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

  select version.id, version.version
  into v_pack_version_id, v_pack_version
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
    where response.id = p_source_response_id
      and response.session_token_hash = p_source_session_hash
      and response.session_expires_at > clock_timestamp()
      and response.status = 'submitted'
      and response.pack_version_id = v_pack_version_id;

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

create function public.get_owner_claim_state(
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
  v_claimed boolean;
  v_expires_at timestamptz;
begin
  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    true
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;

  select play.owner_id is not null, owner.management_expires_at
  into v_claimed, v_expires_at
  from public.pack_plays as play
  join public.anonymous_owners as owner
    on owner.id = play.anonymous_owner_id
  where play.id = p_play_id;

  return jsonb_build_object(
    'outcome', case when v_claimed then 'claimed' else 'unclaimed' end,
    'managementExpiresAt', v_expires_at,
    'managementTtlSeconds', 604800
  );
end
$function$;

create function public.claim_anonymous_owner(
  p_anonymous_owner_id uuid,
  p_management_secret_hash bytea,
  p_actor_id uuid,
  p_recovery_actor_candidates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
begin
  if p_anonymous_owner_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
    or p_actor_id is null
    or jsonb_typeof(p_recovery_actor_candidates) <> 'array'
    or jsonb_array_length(p_recovery_actor_candidates) = 0
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_recovery_actor_candidates) as candidate(value)
      where jsonb_typeof(candidate.value) <> 'object'
        or not candidate.value ? 'keyVersion'
        or not candidate.value ? 'hash'
        or candidate.value - array['keyVersion', 'hash']::text[] <> '{}'::jsonb
        or jsonb_typeof(candidate.value->'keyVersion') <> 'string'
        or jsonb_typeof(candidate.value->'hash') <> 'string'
    )
  then
    raise exception using errcode = '22023', message = 'invalid owner claim input';
  end if;

  select owner.management_expires_at
  into v_expires_at
  from public.anonymous_owners as owner
  where owner.id = p_anonymous_owner_id
    and owner.management_secret_hash = p_management_secret_hash
    and owner.management_revoked_at is null
  for update;

  if not found or v_expires_at <= v_now then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  perform 1
  from public.pack_plays as play
  where play.anonymous_owner_id = p_anonymous_owner_id
  for update;

  if not exists (
    select 1
    from public.pack_plays as play
    where play.anonymous_owner_id = p_anonymous_owner_id
      and play.status = 'completed'
  ) then
    return jsonb_build_object('outcome', 'not_completed');
  end if;

  if exists (
    select 1
    from public.pack_plays as play
    where play.anonymous_owner_id = p_anonymous_owner_id
      and play.owner_id is not null
      and play.owner_id <> p_actor_id
  ) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  update public.pack_plays as play
  set owner_id = p_actor_id,
      updated_at = v_now
  where play.anonymous_owner_id = p_anonymous_owner_id
    and play.owner_id is null;

  return jsonb_build_object('outcome', 'claimed');
end
$function$;

create function public.list_authenticated_owner_plays(p_actor_id uuid)
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
          'updatedAt', play.updated_at
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

create function public.get_authenticated_owner_play(
  p_play_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $function$
begin
  if not exists (
    select 1
    from public.pack_plays as play
    where play.id = p_play_id
      and play.owner_id = p_actor_id
  ) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  return jsonb_build_object(
    'outcome', 'authorized',
    'play', private.owner_play_state(p_play_id)
  );
end
$function$;

create function public.create_claimed_share_link(
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
begin
  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    false
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;

  if not exists (
    select 1
    from public.pack_plays as play
    where play.id = p_play_id
      and play.owner_id is not null
  ) then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  return public.create_share_link(
    p_play_id,
    p_management_secret_hash,
    p_link_id,
    p_public_id,
    p_secret_hash,
    p_kind,
    p_expires_at
  );
end
$function$;

create function private.authenticated_owner_capability(
  p_play_id uuid,
  p_actor_id uuid
)
returns bytea
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash bytea;
  v_now timestamptz := clock_timestamp();
  v_owner_id uuid;
begin
  if p_play_id is null or p_actor_id is null then
    raise exception using errcode = '22023', message = 'invalid authenticated owner input';
  end if;

  select owner.id, owner.management_secret_hash
  into v_owner_id, v_hash
  from public.pack_plays as play
  join public.anonymous_owners as owner
    on owner.id = play.anonymous_owner_id
  where play.id = p_play_id
    and play.owner_id = p_actor_id
  for update of owner;

  if not found then
    return null;
  end if;

  if v_hash is null or not exists (
    select 1
    from public.anonymous_owners as owner
    where owner.id = v_owner_id
      and owner.management_revoked_at is null
      and owner.management_expires_at > v_now
  ) then
    v_hash := pg_catalog.decode(
      pg_catalog.md5(pg_catalog.gen_random_uuid()::text)
      || pg_catalog.md5(pg_catalog.gen_random_uuid()::text),
      'hex'
    );
    update public.anonymous_owners as owner
    set management_secret_hash = v_hash,
        management_revoked_at = null,
        last_active_at = v_now,
        management_expires_at = v_now + interval '7 days',
        updated_at = v_now
    where owner.id = v_owner_id;
  end if;

  return v_hash;
end
$function$;

create function public.get_authenticated_owner_profile(
  p_play_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash bytea;
begin
  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.get_owner_profile(p_play_id, v_hash);
end
$function$;

create function public.record_authenticated_owner_profile_event(
  p_play_id uuid,
  p_actor_id uuid,
  p_event_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash bytea;
begin
  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.record_owner_profile_event(p_play_id, v_hash, p_event_name);
end
$function$;

create function public.create_authenticated_share_link(
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
  v_hash bytea;
begin
  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.create_claimed_share_link(
    p_play_id, v_hash, p_link_id, p_public_id, p_secret_hash, p_kind, p_expires_at
  );
end
$function$;

create function public.list_authenticated_share_links(
  p_play_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash bytea;
begin
  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.list_owner_share_links(p_play_id, v_hash);
end
$function$;

create function public.disable_authenticated_share_link(
  p_play_id uuid,
  p_actor_id uuid,
  p_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash bytea;
begin
  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.disable_share_link(p_play_id, v_hash, p_link_id);
end
$function$;

create function public.rotate_authenticated_share_link(
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
begin
  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.rotate_share_link(
    p_play_id, v_hash, p_link_id, p_new_link_id, p_new_public_id, p_new_secret_hash
  );
end
$function$;

create function public.record_authenticated_owner_share_action(
  p_play_id uuid,
  p_actor_id uuid,
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
  v_hash bytea;
begin
  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.record_owner_share_action_with_source(
    p_play_id, v_hash, p_link_id, p_event_name, p_entry_source
  );
end
$function$;

create function public.list_authenticated_owner_1to1_responses(
  p_play_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash bytea;
begin
  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.list_owner_1to1_responses(p_play_id, v_hash);
end
$function$;

create function public.get_authenticated_private_1to1_comparison(
  p_play_id uuid,
  p_actor_id uuid,
  p_response_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash bytea;
begin
  v_hash := private.authenticated_owner_capability(p_play_id, p_actor_id);
  if v_hash is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.get_private_1to1_comparison(p_play_id, v_hash, p_response_id);
end
$function$;

alter function private.owner_play_state(uuid)
  owner to gyeop_internal_rpc;
alter function private.authorize_owner_play_capability(uuid, bytea, boolean)
  owner to gyeop_internal_rpc;
alter function private.ensure_legacy_pack_play_owner()
  owner to gyeop_internal_rpc;
alter function private.sync_anonymous_owner_activity()
  owner to gyeop_internal_rpc;
alter function private.sync_anonymous_owner_revocation()
  owner to gyeop_internal_rpc;
alter function public.create_or_resume_play_with_source(
  text, uuid, bytea, uuid, bytea, bytea, text, uuid, bytea
) owner to gyeop_internal_rpc;
alter function public.get_owner_claim_state(uuid, bytea)
  owner to gyeop_internal_rpc;
alter function public.claim_anonymous_owner(uuid, bytea, uuid, jsonb)
  owner to gyeop_internal_rpc;
alter function public.list_authenticated_owner_plays(uuid)
  owner to gyeop_internal_rpc;
alter function public.get_authenticated_owner_play(uuid, uuid)
  owner to gyeop_internal_rpc;
alter function public.create_claimed_share_link(
  uuid, bytea, uuid, text, bytea, text, timestamptz
) owner to gyeop_internal_rpc;
alter function private.authenticated_owner_capability(uuid, uuid)
  owner to gyeop_internal_rpc;
alter function public.get_authenticated_owner_profile(uuid, uuid)
  owner to gyeop_internal_rpc;
alter function public.record_authenticated_owner_profile_event(uuid, uuid, text)
  owner to gyeop_internal_rpc;
alter function public.create_authenticated_share_link(
  uuid, uuid, uuid, text, bytea, text, timestamptz
) owner to gyeop_internal_rpc;
alter function public.list_authenticated_share_links(uuid, uuid)
  owner to gyeop_internal_rpc;
alter function public.disable_authenticated_share_link(uuid, uuid, uuid)
  owner to gyeop_internal_rpc;
alter function public.rotate_authenticated_share_link(
  uuid, uuid, uuid, uuid, text, bytea
) owner to gyeop_internal_rpc;
alter function public.record_authenticated_owner_share_action(
  uuid, uuid, uuid, text, text
) owner to gyeop_internal_rpc;
alter function public.list_authenticated_owner_1to1_responses(uuid, uuid)
  owner to gyeop_internal_rpc;
alter function public.get_authenticated_private_1to1_comparison(uuid, uuid, uuid)
  owner to gyeop_internal_rpc;

revoke execute on function private.owner_play_state(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.authorize_owner_play_capability(uuid, bytea, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function private.ensure_legacy_pack_play_owner()
  from public, anon, authenticated, service_role;
revoke execute on function private.sync_anonymous_owner_activity()
  from public, anon, authenticated, service_role;
revoke execute on function private.sync_anonymous_owner_revocation()
  from public, anon, authenticated, service_role;
revoke execute on function private.authenticated_owner_capability(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function private.owner_play_state(uuid)
  to gyeop_internal_rpc;
grant execute on function private.authorize_owner_play_capability(uuid, bytea, boolean)
  to gyeop_internal_rpc;
grant execute on function private.ensure_legacy_pack_play_owner()
  to gyeop_internal_rpc;
grant execute on function private.sync_anonymous_owner_activity()
  to gyeop_internal_rpc;
grant execute on function private.sync_anonymous_owner_revocation()
  to gyeop_internal_rpc;
grant execute on function private.authenticated_owner_capability(uuid, uuid)
  to gyeop_internal_rpc;

revoke execute on function public.get_owner_claim_state(uuid, bytea)
  from public, anon, authenticated;
revoke execute on function public.claim_anonymous_owner(uuid, bytea, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.list_authenticated_owner_plays(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_authenticated_owner_play(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.create_claimed_share_link(
  uuid, bytea, uuid, text, bytea, text, timestamptz
) from public, anon, authenticated;
revoke execute on function public.get_authenticated_owner_profile(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.record_authenticated_owner_profile_event(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.create_authenticated_share_link(
  uuid, uuid, uuid, text, bytea, text, timestamptz
) from public, anon, authenticated;
revoke execute on function public.list_authenticated_share_links(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.disable_authenticated_share_link(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.rotate_authenticated_share_link(
  uuid, uuid, uuid, uuid, text, bytea
) from public, anon, authenticated;
revoke execute on function public.record_authenticated_owner_share_action(
  uuid, uuid, uuid, text, text
) from public, anon, authenticated;
revoke execute on function public.list_authenticated_owner_1to1_responses(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.get_authenticated_private_1to1_comparison(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.get_owner_claim_state(uuid, bytea)
  to service_role;
grant execute on function public.claim_anonymous_owner(uuid, bytea, uuid, jsonb)
  to service_role;
grant execute on function public.list_authenticated_owner_plays(uuid)
  to service_role;
grant execute on function public.get_authenticated_owner_play(uuid, uuid)
  to service_role;
grant execute on function public.create_claimed_share_link(
  uuid, bytea, uuid, text, bytea, text, timestamptz
) to service_role;
grant execute on function public.get_authenticated_owner_profile(uuid, uuid)
  to service_role;
grant execute on function public.record_authenticated_owner_profile_event(uuid, uuid, text)
  to service_role;
grant execute on function public.create_authenticated_share_link(
  uuid, uuid, uuid, text, bytea, text, timestamptz
) to service_role;
grant execute on function public.list_authenticated_share_links(uuid, uuid)
  to service_role;
grant execute on function public.disable_authenticated_share_link(uuid, uuid, uuid)
  to service_role;
grant execute on function public.rotate_authenticated_share_link(
  uuid, uuid, uuid, uuid, text, bytea
) to service_role;
grant execute on function public.record_authenticated_owner_share_action(
  uuid, uuid, uuid, text, text
) to service_role;
grant execute on function public.list_authenticated_owner_1to1_responses(uuid, uuid)
  to service_role;
grant execute on function public.get_authenticated_private_1to1_comparison(uuid, uuid, uuid)
  to service_role;

revoke create on schema private from gyeop_internal_rpc;
revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
