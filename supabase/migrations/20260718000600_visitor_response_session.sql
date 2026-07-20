begin;

create table public.visitor_responses (
  id uuid primary key,
  share_link_id uuid not null
    references public.share_links (id)
    on update restrict
    on delete cascade,
  pack_version_id uuid not null
    references public.pack_versions (id)
    on update restrict
    on delete restrict,
  relationship_code text,
  known_since_code text,
  status text not null default 'draft'
    check (status = 'draft'),
  session_token_hash bytea unique
    check (
      session_token_hash is null
      or octet_length(session_token_hash) = 32
    ),
  session_expires_at timestamptz not null,
  management_token_hash bytea unique
    check (
      management_token_hash is null
      or octet_length(management_token_hash) = 32
    ),
  created_at timestamptz not null default clock_timestamp(),
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  constraint visitor_responses_draft_state_check check (
    relationship_code is not null
    and relationship_code in (
      'old_friend',
      'school_friend',
      'coworker',
      'romantic',
      'family',
      'online_friend',
      'social_follower',
      'other'
    )
    and known_since_code is not null
    and known_since_code in (
      'under_one_year',
      'one_to_three_years',
      'three_to_five_years',
      'five_to_ten_years',
      'ten_years_or_more',
      'not_sure'
    )
    and session_token_hash is not null
    and session_expires_at = created_at + interval '24 hours'
    and management_token_hash is null
    and submitted_at is null
    and withdrawn_at is null
  )
);

create index visitor_responses_link_status_submitted_idx
  on public.visitor_responses (share_link_id, status, submitted_at);
create index visitor_responses_relationship_status_idx
  on public.visitor_responses (relationship_code, status);
create index visitor_responses_live_session_expiry_idx
  on public.visitor_responses (session_expires_at)
  where session_token_hash is not null;

alter table public.visitor_responses enable row level security;

grant select, insert, update on table public.visitor_responses
  to gyeop_internal_rpc;

create policy visitor_responses_internal_select
  on public.visitor_responses
  for select
  to gyeop_internal_rpc
  using (true);

create policy visitor_responses_internal_insert
  on public.visitor_responses
  for insert
  to gyeop_internal_rpc
  with check (true);

create policy visitor_responses_internal_update
  on public.visitor_responses
  for update
  to gyeop_internal_rpc
  using (true)
  with check (true);

alter table public.analytics_events
  add column visitor_response_id uuid
  references public.visitor_responses (id)
  on update restrict
  on delete set null;

create index analytics_events_visitor_response_idx
  on public.analytics_events (visitor_response_id)
  where visitor_response_id is not null;

drop policy analytics_share_flow_internal_insert
  on public.analytics_events;

create policy analytics_core_visitor_flow_internal_insert
  on public.analytics_events
  for insert
  to gyeop_internal_rpc
  with check (
    (
      visitor_response_id is null
      and event_name in (
        'share_link_created',
        'invite_opened',
        'share_handoff_succeeded',
        'share_link_copied'
      )
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' in ('public', 'one_to_one')
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
    or (
      visitor_response_id is not null
      and event_name = 'relationship_selected'
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' = 'public'
      and properties->>'relationshipCode' in (
        'old_friend',
        'school_friend',
        'coworker',
        'romantic',
        'family',
        'online_friend',
        'social_follower',
        'other'
      )
      and properties->>'knownSinceCode' in (
        'under_one_year',
        'one_to_three_years',
        'three_to_five_years',
        'five_to_ten_years',
        'ten_years_or_more',
        'not_sure'
      )
      and properties - array[
        'packVersion',
        'linkKind',
        'relationshipCode',
        'knownSinceCode'
      ]::text[] = '{}'::jsonb
    )
    or (
      visitor_response_id is not null
      and event_name = 'visitor_response_started'
      and jsonb_typeof(properties->'packVersion') = 'string'
      and properties->>'linkKind' = 'public'
      and properties - array['packVersion', 'linkKind']::text[] = '{}'::jsonb
    )
  );

create or replace function private.visitor_response_state(p_response_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', response.id,
    'status', response.status,
    'relationshipCode', response.relationship_code,
    'knownSinceCode', response.known_since_code,
    'sessionExpiresAt', response.session_expires_at,
    'sessionTtlSeconds', greatest(
      1,
      floor(
        extract(epoch from (response.session_expires_at - clock_timestamp()))
      )::integer
    )
  )
  from public.visitor_responses as response
  where response.id = p_response_id;
$function$;

create or replace function public.start_response(
  p_public_id text,
  p_secret_hash bytea,
  p_intent text,
  p_existing_response_id uuid,
  p_existing_session_hash bytea,
  p_new_response_id uuid,
  p_new_session_hash bytea,
  p_relationship_code text,
  p_known_since_code text,
  p_rate_limit_key bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing_expires_at timestamptz;
  v_existing_link_id uuid;
  v_existing_status text;
  v_expires_at timestamptz;
  v_kind text;
  v_limit record;
  v_link_id uuid;
  v_now timestamptz;
  v_pack_version text;
  v_pack_version_id uuid;
  v_retry_after_seconds integer;
  v_secret_hash bytea;
  v_status text;
begin
  if p_public_id is null
    or p_public_id !~ '^[A-Za-z0-9_-]{21}[AQgw]$'
    or p_secret_hash is null
    or octet_length(p_secret_hash) <> 32
    or p_intent is null
    or p_intent not in ('resume', 'start')
    or (p_existing_response_id is null) <> (p_existing_session_hash is null)
    or (
      p_existing_session_hash is not null
      and octet_length(p_existing_session_hash) <> 32
    )
    or p_rate_limit_key is null
    or octet_length(p_rate_limit_key) <> 32
    or (
      p_intent = 'resume'
      and (
        p_new_response_id is not null
        or p_new_session_hash is not null
        or p_relationship_code is not null
        or p_known_since_code is not null
      )
    )
    or (
      p_intent = 'start'
      and (
        p_new_response_id is null
        or p_new_session_hash is null
        or octet_length(p_new_session_hash) <> 32
        or p_relationship_code is null
        or p_relationship_code not in (
          'old_friend',
          'school_friend',
          'coworker',
          'romantic',
          'family',
          'online_friend',
          'social_follower',
          'other'
        )
        or p_known_since_code is null
        or p_known_since_code not in (
          'under_one_year',
          'one_to_three_years',
          'three_to_five_years',
          'five_to_ten_years',
          'ten_years_or_more',
          'not_sure'
        )
      )
    )
  then
    raise exception using errcode = '22023', message = 'invalid response start input';
  end if;

  select
    link.id,
    link.secret_hash,
    link.kind,
    link.status,
    link.expires_at,
    play.pack_version_id,
    version.version
  into
    v_link_id,
    v_secret_hash,
    v_kind,
    v_status,
    v_expires_at,
    v_pack_version_id,
    v_pack_version
  from public.share_links as link
  join public.pack_plays as play
    on play.id = link.pack_play_id
  join public.pack_versions as version
    on version.id = play.pack_version_id
  where link.public_id = p_public_id
  for update of link;

  if not found or v_secret_hash <> p_secret_hash or v_kind <> 'public' then
    return jsonb_build_object('outcome', 'unavailable');
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

  if p_existing_response_id is not null then
    select response.share_link_id, response.status, response.session_expires_at
    into v_existing_link_id, v_existing_status, v_existing_expires_at
    from public.visitor_responses as response
    where response.id = p_existing_response_id
      and response.session_token_hash = p_existing_session_hash
    for update;

    if not found
      or v_existing_status <> 'draft'
      or v_existing_expires_at <= v_now
    then
      return jsonb_build_object('outcome', 'session_invalid');
    end if;

    if v_existing_link_id = v_link_id then
      return jsonb_build_object(
        'outcome', 'resumed',
        'response', private.visitor_response_state(p_existing_response_id)
      );
    end if;
  end if;

  if p_intent = 'resume' then
    return jsonb_build_object('outcome', 'no_session');
  end if;

  begin
    select *
    into strict v_limit
    from public.consume_rate_limit(
      p_rate_limit_key,
      'response_start',
      600,
      10
    );

    if not v_limit.allowed then
      v_retry_after_seconds := v_limit.retry_after_seconds;
      raise exception using errcode = 'P2201', message = 'response start rate limited';
    end if;

    v_now := clock_timestamp();
    insert into public.visitor_responses (
      id,
      share_link_id,
      pack_version_id,
      relationship_code,
      known_since_code,
      session_token_hash,
      session_expires_at,
      created_at
    ) values (
      p_new_response_id,
      v_link_id,
      v_pack_version_id,
      p_relationship_code,
      p_known_since_code,
      p_new_session_hash,
      v_now + interval '24 hours',
      v_now
    );

    insert into public.analytics_events (
      event_name,
      visitor_response_id,
      properties
    ) values
      (
        'relationship_selected',
        p_new_response_id,
        jsonb_build_object(
          'packVersion', v_pack_version,
          'linkKind', v_kind,
          'relationshipCode', p_relationship_code,
          'knownSinceCode', p_known_since_code
        )
      ),
      (
        'visitor_response_started',
        p_new_response_id,
        jsonb_build_object(
          'packVersion', v_pack_version,
          'linkKind', v_kind
        )
      );
  exception
    when sqlstate 'P2201' then
      return jsonb_build_object(
        'outcome', 'rate_limited',
        'retryAfterSeconds', v_retry_after_seconds
      );
    when unique_violation then
      return jsonb_build_object('outcome', 'collision');
  end;

  return jsonb_build_object(
    'outcome', 'created',
    'response', private.visitor_response_state(p_new_response_id)
  );
end
$function$;

grant create on schema public to gyeop_internal_rpc;
grant create on schema private to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

alter function private.visitor_response_state(uuid)
  owner to gyeop_internal_rpc;
alter function public.start_response(
  text,
  bytea,
  text,
  uuid,
  bytea,
  uuid,
  bytea,
  text,
  text,
  bytea
)
  owner to gyeop_internal_rpc;

revoke execute on function private.visitor_response_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.visitor_response_state(uuid)
  to gyeop_internal_rpc;

revoke execute on function public.start_response(
  text,
  bytea,
  text,
  uuid,
  bytea,
  uuid,
  bytea,
  text,
  text,
  bytea
)
  from public, anon, authenticated;
grant execute on function public.start_response(
  text,
  bytea,
  text,
  uuid,
  bytea,
  uuid,
  bytea,
  text,
  text,
  bytea
)
  to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke create on schema private from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

revoke all privileges on table public.visitor_responses
  from public, anon, authenticated, service_role;
revoke all privileges on table public.analytics_events
  from public, anon, authenticated, service_role;

commit;
