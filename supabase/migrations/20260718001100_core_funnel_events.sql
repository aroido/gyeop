begin;

alter table public.analytics_events
  add column owner_play_id uuid,
  add column share_link_id uuid,
  add constraint analytics_events_owner_play_id_fkey
    foreign key (owner_play_id)
    references public.pack_plays (id)
    on update restrict
    on delete set null,
  add constraint analytics_events_share_link_id_fkey
    foreign key (share_link_id)
    references public.share_links (id)
    on update restrict
    on delete set null;

alter table public.visitor_responses
  drop constraint visitor_responses_status_check,
  drop constraint visitor_responses_state_check;

alter table public.visitor_responses
  add constraint visitor_responses_status_check
    check (status in ('draft', 'submitted', 'withdrawn')),
  add constraint visitor_responses_state_check check (
    relationship_code is not null
    and relationship_code in (
      'old_friend', 'school_friend', 'coworker', 'romantic', 'family',
      'online_friend', 'social_follower', 'other'
    )
    and known_since_code is not null
    and known_since_code in (
      'under_one_year', 'one_to_three_years', 'three_to_five_years',
      'five_to_ten_years', 'ten_years_or_more', 'not_sure'
    )
    and session_expires_at = created_at + interval '24 hours'
    and (
      (
        status = 'draft'
        and session_token_hash is not null
        and management_token_hash is null
        and submitted_at is null
        and withdrawn_at is null
      )
      or (
        status = 'submitted'
        and session_token_hash is not null
        and management_token_hash is not null
        and submitted_at is not null
        and withdrawn_at is null
      )
      or (
        status = 'withdrawn'
        and session_token_hash is null
        and management_token_hash is null
        and withdrawn_at is not null
      )
    )
  );

create index analytics_events_owner_play_event_idx
  on public.analytics_events (owner_play_id, event_name, occurred_at)
  where owner_play_id is not null;

create index analytics_events_share_link_event_idx
  on public.analytics_events (share_link_id, event_name, occurred_at)
  where share_link_id is not null;

create unique index analytics_owner_lifecycle_event_unique_idx
  on public.analytics_events (owner_play_id, event_name)
  where owner_play_id is not null
    and event_name in ('pack_opened', 'self_pack_completed');

create table private.analytics_measurement_markers (
  name text primary key,
  started_at timestamptz not null
);

insert into private.analytics_measurement_markers (name, started_at)
values ('core_funnel_v1', clock_timestamp());

revoke all privileges on table private.analytics_measurement_markers
  from public, anon, authenticated, service_role;

create function private.normalize_analytics_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.event_name = 'relationship_selected' then
    new.properties := new.properties
      - array['relationshipCode', 'knownSinceCode']::text[];
  end if;

  if new.properties ?| array[
    'email', 'ip', 'userAgent', 'url', 'secret', 'secretHash', 'token',
    'channel', 'recipient', 'relationship', 'relationshipCode',
    'knownSince', 'knownSinceCode', 'choice', 'optionA', 'optionB'
  ]::text[] then
    raise exception using errcode = '22023', message = 'forbidden analytics property';
  end if;

  return new;
end
$function$;

revoke execute on function private.normalize_analytics_event()
  from public, anon, authenticated, service_role;

create trigger analytics_event_normalizer
before insert on public.analytics_events
for each row execute function private.normalize_analytics_event();

update public.analytics_events
set properties = properties
  - array['relationshipCode', 'knownSinceCode']::text[]
where event_name = 'relationship_selected';

drop policy analytics_core_visitor_flow_internal_insert
  on public.analytics_events;
drop policy analytics_profile_viewed_internal_insert
  on public.analytics_events;
drop policy analytics_profile_reshare_internal_insert
  on public.analytics_events;

create policy analytics_internal_insert_allowlist
  on public.analytics_events
  for insert
  to gyeop_internal_rpc
  with check (
    (
      event_name = 'pack_opened'
      and owner_play_id is not null
      and share_link_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'entrySource' in ('home', 'same_pack_cta')
      and properties - array['packVersion', 'entrySource']::text[] = '{}'::jsonb
      and (
        (properties->>'entrySource' = 'home' and visitor_response_id is null)
        or
        (properties->>'entrySource' = 'same_pack_cta' and visitor_response_id is not null)
      )
    )
    or (
      event_name = 'self_pack_completed'
      and owner_play_id is not null
      and share_link_id is null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties - 'packVersion' = '{}'::jsonb
    )
    or (
      event_name = 'share_link_created'
      and owner_play_id is not null
      and share_link_id is not null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
    or (
      event_name in ('share_handoff_succeeded', 'share_link_copied')
      and owner_play_id is not null
      and share_link_id is not null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and (
        properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
        or (
          properties->>'entrySource' = 'profile_reshare'
          and properties - array[
            'packVersion', 'linkKind', 'entrySource'
          ]::text[] = '{}'::jsonb
        )
      )
    )
    or (
      event_name = 'profile_viewed'
      and owner_play_id is not null
      and share_link_id is null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties - 'packVersion' = '{}'::jsonb
    )
    or (
      event_name = 'profile_reshare_clicked'
      and owner_play_id is not null
      and share_link_id is null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'entrySource' = 'profile_reshare'
      and properties - array['packVersion', 'entrySource']::text[] = '{}'::jsonb
    )
    or (
      event_name = 'invite_opened'
      and owner_play_id is null
      and share_link_id is null
      and visitor_response_id is null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
    or (
      event_name in (
        'relationship_selected',
        'visitor_response_started',
        'visitor_required_answer_saved',
        'visitor_required_submitted',
        'comparison_viewed',
        'same_pack_start_clicked'
      )
      and owner_play_id is null
      and share_link_id is null
      and visitor_response_id is not null
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
  );

create policy analytics_forbidden_payload_contract
  on public.analytics_events
  as restrictive
  for insert
  to gyeop_internal_rpc
  with check (
    not properties ?| array[
      'email', 'ip', 'userAgent', 'url', 'secret', 'secretHash', 'token',
      'channel', 'recipient', 'relationship', 'relationshipCode',
      'knownSince', 'knownSinceCode', 'choice', 'optionA', 'optionB'
    ]::text[]
  );

grant gyeop_internal_rpc to postgres;

alter function public.create_or_resume_play(
  text, uuid, bytea, uuid, bytea, bytea
) set schema private;
alter function private.create_or_resume_play(
  text, uuid, bytea, uuid, bytea, bytea
) rename to create_or_resume_play_core;

revoke execute on function private.create_or_resume_play_core(
  text, uuid, bytea, uuid, bytea, bytea
) from public, anon, authenticated, service_role;

create function public.create_or_resume_play_with_source(
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
  v_effective_source text := 'home';
  v_pack_version text;
  v_pack_version_id uuid;
  v_result jsonb;
  v_source_response_id uuid;
begin
  if p_entry_source not in ('home', 'same_pack_cta')
    or (p_source_response_id is null) <> (p_source_session_hash is null)
    or (p_source_session_hash is not null and octet_length(p_source_session_hash) <> 32)
  then
    raise exception using errcode = '22023', message = 'invalid owner source input';
  end if;

  v_result := private.create_or_resume_play_core(
    p_pack_slug,
    p_existing_play_id,
    p_existing_secret_hash,
    p_new_play_id,
    p_new_secret_hash,
    p_network_key
  );

  if v_result->>'outcome' <> 'created' then
    return v_result;
  end if;

  select play.pack_version_id, version.version
  into v_pack_version_id, v_pack_version
  from public.pack_plays as play
  join public.pack_versions as version on version.id = play.pack_version_id
  where play.id = p_new_play_id;

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
    p_new_play_id,
    v_source_response_id,
    jsonb_build_object(
      'packVersion', v_pack_version,
      'entrySource', v_effective_source
    )
  );

  return v_result;
end
$function$;

create function public.create_or_resume_play(
  p_pack_slug text,
  p_existing_play_id uuid,
  p_existing_secret_hash bytea,
  p_new_play_id uuid,
  p_new_secret_hash bytea,
  p_network_key bytea
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select public.create_or_resume_play_with_source(
    p_pack_slug,
    p_existing_play_id,
    p_existing_secret_hash,
    p_new_play_id,
    p_new_secret_hash,
    p_network_key,
    'home',
    null,
    null
  );
$function$;

alter function public.complete_owner_play(uuid, bytea) set schema private;
alter function private.complete_owner_play(uuid, bytea)
  rename to complete_owner_play_core;

revoke execute on function private.complete_owner_play_core(uuid, bytea)
  from public, anon, authenticated, service_role;

create function public.complete_owner_play(
  p_play_id uuid,
  p_management_secret_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before_status text;
  v_pack_version text;
  v_result jsonb;
begin
  select play.status
  into v_before_status
  from public.pack_plays as play
  where play.id = p_play_id;

  v_result := private.complete_owner_play_core(
    p_play_id,
    p_management_secret_hash
  );

  if v_before_status = 'draft' and v_result->>'outcome' = 'completed' then
    select version.version
    into v_pack_version
    from public.pack_plays as play
    join public.pack_versions as version on version.id = play.pack_version_id
    where play.id = p_play_id;

    begin
      insert into public.analytics_events (
        event_name,
        owner_play_id,
        properties
      ) values (
        'self_pack_completed',
        p_play_id,
        jsonb_build_object('packVersion', v_pack_version)
      );
    exception
      when unique_violation then null;
    end;
  end if;

  return v_result;
end
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
  join public.pack_versions as version on version.id = play.pack_version_id
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

    insert into public.analytics_events (
      event_name,
      owner_play_id,
      share_link_id,
      properties
    ) values (
      'share_link_created',
      p_play_id,
      p_link_id,
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
  join public.pack_versions as version on version.id = play.pack_version_id
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
    set status = 'expired', updated_at = v_now
    where link.id = p_link_id;
    return jsonb_build_object('outcome', 'link_not_active');
  end if;
  if v_link_status <> 'active' then
    return jsonb_build_object('outcome', 'link_not_active');
  end if;

  begin
    insert into public.share_links (
      id, public_id, pack_play_id, kind, secret_hash, expires_at
    ) values (
      p_new_link_id, p_new_public_id, p_play_id, v_kind,
      p_new_secret_hash, v_expires_at
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
      join public.share_links as link on link.id = response.share_link_id
      where link.pack_play_id = play.id
        and link.kind = 'public'
        and response.pack_version_id = play.pack_version_id
        and response.status = 'submitted'
    )
  into v_status, v_pack_version, v_has_sight
  from public.pack_plays as play
  join public.pack_versions as version on version.id = play.pack_version_id
  where play.id = p_play_id;

  if v_status <> 'completed' then
    return jsonb_build_object('outcome', 'not_completed');
  end if;
  if p_event_name = 'profile_reshare_clicked' and not v_has_sight then
    return jsonb_build_object('outcome', 'not_eligible');
  end if;

  insert into public.analytics_events (
    event_name,
    owner_play_id,
    properties
  ) values (
    p_event_name,
    p_play_id,
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

create or replace function public.record_owner_share_action_with_source(
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
  join public.pack_versions as version on version.id = play.pack_version_id
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

  insert into public.analytics_events (
    event_name,
    owner_play_id,
    share_link_id,
    properties
  ) values (
    p_event_name,
    p_play_id,
    p_link_id,
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

create or replace function public.record_owner_share_action(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_link_id uuid,
  p_event_name text
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select public.record_owner_share_action_with_source(
    p_play_id,
    p_management_secret_hash,
    p_link_id,
    p_event_name,
    null
  );
$function$;

create function private.scrub_withdrawn_analytics_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status <> 'withdrawn' and new.status = 'withdrawn' then
    update public.analytics_events
    set visitor_response_id = null
    where visitor_response_id = new.id;
  end if;
  return new;
end
$function$;

revoke execute on function private.scrub_withdrawn_analytics_subject()
  from public, anon, authenticated, service_role;

create trigger visitor_response_analytics_scrub
after update of status, withdrawn_at on public.visitor_responses
for each row execute function private.scrub_withdrawn_analytics_subject();

create view private.core_funnel_stage_counts
with (security_invoker = false)
as
with
marker as (
  select started_at
  from private.analytics_measurement_markers
  where name = 'core_funnel_v1'
),
owner_completed as (
  select event.owner_play_id, min(event.occurred_at) as completed_at
  from public.analytics_events as event, marker
  where event.event_name = 'self_pack_completed'
    and event.owner_play_id is not null
    and event.occurred_at >= marker.started_at
  group by event.owner_play_id
),
owner_public_link as (
  select event.owner_play_id, event.share_link_id, min(event.occurred_at) as created_at
  from public.analytics_events as event
  join owner_completed as completed
    on completed.owner_play_id = event.owner_play_id
   and event.occurred_at >= completed.completed_at
  where event.event_name = 'share_link_created'
    and event.share_link_id is not null
    and event.properties->>'linkKind' = 'public'
  group by event.owner_play_id, event.share_link_id
),
owner_public_share as (
  select link.owner_play_id, link.share_link_id, min(event.occurred_at) as shared_at
  from owner_public_link as link
  join public.analytics_events as event
    on event.owner_play_id = link.owner_play_id
   and event.share_link_id = link.share_link_id
   and event.occurred_at >= link.created_at
  where event.event_name in ('share_handoff_succeeded', 'share_link_copied')
    and event.properties->>'linkKind' = 'public'
  group by link.owner_play_id, link.share_link_id
),
visitor_submitted as (
  select
    event.visitor_response_id,
    min(event.properties->>'packVersion') as pack_version,
    min(event.occurred_at) as submitted_at
  from public.analytics_events as event
  join public.visitor_responses as response
    on response.id = event.visitor_response_id
   and response.status = 'submitted'
  cross join marker
  where event.event_name = 'visitor_required_submitted'
    and event.occurred_at >= marker.started_at
  group by event.visitor_response_id
),
visitor_compared as (
  select
    submitted.visitor_response_id,
    submitted.pack_version,
    min(event.occurred_at) as compared_at
  from visitor_submitted as submitted
  join public.analytics_events as event
    on event.visitor_response_id = submitted.visitor_response_id
   and event.occurred_at >= submitted.submitted_at
  where event.event_name = 'comparison_viewed'
  group by submitted.visitor_response_id, submitted.pack_version
),
visitor_clicked as (
  select
    compared.visitor_response_id,
    compared.pack_version,
    min(event.occurred_at) as clicked_at
  from visitor_compared as compared
  join public.analytics_events as event
    on event.visitor_response_id = compared.visitor_response_id
   and event.occurred_at >= compared.compared_at
  where event.event_name = 'same_pack_start_clicked'
  group by compared.visitor_response_id, compared.pack_version
),
visitor_new_owner as (
  select clicked.visitor_response_id
  from visitor_clicked as clicked
  join public.analytics_events as event
    on event.visitor_response_id = clicked.visitor_response_id
   and event.occurred_at >= clicked.clicked_at
  where event.event_name = 'pack_opened'
    and event.owner_play_id is not null
    and event.properties->>'entrySource' = 'same_pack_cta'
    and event.properties->>'packVersion' = clicked.pack_version
  group by clicked.visitor_response_id
),
profile_viewed as (
  select event.owner_play_id, min(event.occurred_at) as viewed_at
  from public.analytics_events as event, marker
  where event.event_name = 'profile_viewed'
    and event.owner_play_id is not null
    and event.occurred_at >= marker.started_at
  group by event.owner_play_id
),
profile_clicked as (
  select viewed.owner_play_id, min(event.occurred_at) as clicked_at
  from profile_viewed as viewed
  join public.analytics_events as event
    on event.owner_play_id = viewed.owner_play_id
   and event.occurred_at >= viewed.viewed_at
  where event.event_name = 'profile_reshare_clicked'
  group by viewed.owner_play_id
),
profile_shared as (
  select clicked.owner_play_id, event.share_link_id, min(event.occurred_at) as shared_at
  from profile_clicked as clicked
  join public.analytics_events as event
    on event.owner_play_id = clicked.owner_play_id
   and event.occurred_at >= clicked.clicked_at
  where event.event_name in ('share_handoff_succeeded', 'share_link_copied')
    and event.share_link_id is not null
    and event.properties->>'linkKind' = 'public'
    and event.properties->>'entrySource' = 'profile_reshare'
  group by clicked.owner_play_id, event.share_link_id
),
profile_downstream as (
  select shared.owner_play_id
  from profile_shared as shared
  join public.visitor_responses as response
    on response.share_link_id = shared.share_link_id
   and response.status = 'submitted'
   and response.submitted_at >= shared.shared_at
  group by shared.owner_play_id
)
select 'owner_share'::text as funnel, 'self_pack_completed'::text as stage,
  count(*)::bigint as subjects from owner_completed
union all
select 'owner_share', 'public_link_created', count(distinct owner_play_id)::bigint
from owner_public_link
union all
select 'owner_share', 'public_share_succeeded', count(distinct owner_play_id)::bigint
from owner_public_share
union all
select 'visitor_same_pack', 'visitor_required_submitted', count(*)::bigint
from visitor_submitted
union all
select 'visitor_same_pack', 'comparison_viewed', count(*)::bigint
from visitor_compared
union all
select 'visitor_same_pack', 'same_pack_start_clicked', count(*)::bigint
from visitor_clicked
union all
select 'visitor_same_pack', 'new_owner_pack_opened', count(*)::bigint
from visitor_new_owner
union all
select 'profile_reshare', 'profile_viewed', count(*)::bigint
from profile_viewed
union all
select 'profile_reshare', 'profile_reshare_clicked', count(*)::bigint
from profile_clicked
union all
select 'profile_reshare', 'profile_share_succeeded', count(distinct owner_play_id)::bigint
from profile_shared
union all
select 'profile_reshare', 'downstream_visitor_submitted', count(*)::bigint
from profile_downstream;

revoke all privileges on table private.core_funnel_stage_counts
  from public, anon, authenticated, service_role;

grant create on schema public to gyeop_internal_rpc;
grant create on schema private to gyeop_internal_rpc;

alter function public.create_or_resume_play_with_source(
  text, uuid, bytea, uuid, bytea, bytea, text, uuid, bytea
) owner to gyeop_internal_rpc;
alter function public.create_or_resume_play(
  text, uuid, bytea, uuid, bytea, bytea
) owner to gyeop_internal_rpc;
alter function public.complete_owner_play(uuid, bytea)
  owner to gyeop_internal_rpc;
alter function public.create_share_link(
  uuid, bytea, uuid, text, bytea, text, timestamptz
) owner to gyeop_internal_rpc;
alter function public.record_owner_profile_event(uuid, bytea, text)
  owner to gyeop_internal_rpc;
alter function public.record_owner_share_action_with_source(
  uuid, bytea, uuid, text, text
) owner to gyeop_internal_rpc;
alter function public.record_owner_share_action(uuid, bytea, uuid, text)
  owner to gyeop_internal_rpc;

revoke execute on function public.create_or_resume_play_with_source(
  text, uuid, bytea, uuid, bytea, bytea, text, uuid, bytea
) from public, anon, authenticated;
revoke execute on function public.create_or_resume_play(
  text, uuid, bytea, uuid, bytea, bytea
) from public, anon, authenticated;
revoke execute on function public.complete_owner_play(uuid, bytea)
  from public, anon, authenticated;

grant execute on function public.create_or_resume_play_with_source(
  text, uuid, bytea, uuid, bytea, bytea, text, uuid, bytea
) to service_role;
grant execute on function public.create_or_resume_play(
  text, uuid, bytea, uuid, bytea, bytea
) to service_role;
grant execute on function public.complete_owner_play(uuid, bytea)
  to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke create on schema private from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
