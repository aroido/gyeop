begin;

create schema if not exists private authorization postgres;
revoke all privileges on schema private
  from public, anon, authenticated, service_role;
grant usage on schema private to gyeop_internal_rpc;

create table public.pack_plays (
  id uuid primary key,
  pack_version_id uuid not null
    references public.pack_versions (id)
    on update restrict
    on delete restrict,
  management_secret_hash bytea,
  management_expires_at timestamptz not null,
  last_active_at timestamptz not null,
  management_revoked_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'completed')),
  current_position smallint not null default 1
    check (current_position between 1 and 10),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (id, pack_version_id),
  constraint pack_plays_management_hash_check check (
    management_secret_hash is null
    or octet_length(management_secret_hash) = 32
  ),
  constraint pack_plays_management_lifecycle_check check (
    (
      management_secret_hash is not null
      and management_revoked_at is null
    )
    or (
      management_secret_hash is null
      and management_revoked_at is not null
    )
  ),
  constraint pack_plays_management_expiry_check check (
    management_expires_at = last_active_at + interval '7 days'
  ),
  constraint pack_plays_completion_check check (
    (status = 'draft' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create unique index pack_plays_live_management_hash_idx
  on public.pack_plays (management_secret_hash)
  where management_secret_hash is not null;

create index pack_plays_management_expires_at_idx
  on public.pack_plays (management_expires_at);

create table public.self_answers (
  pack_play_id uuid not null,
  pack_version_id uuid not null,
  card_id text not null,
  choice text not null check (choice in ('a', 'b')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (pack_play_id, card_id),
  foreign key (pack_play_id, pack_version_id)
    references public.pack_plays (id, pack_version_id)
    on update restrict
    on delete cascade,
  foreign key (pack_version_id, card_id)
    references public.pack_cards (pack_version_id, id)
    on update restrict
    on delete restrict
);

alter table public.pack_plays enable row level security;
alter table public.self_answers enable row level security;

grant select, insert, update on table public.pack_plays
  to gyeop_internal_rpc;
grant select, insert, update on table public.self_answers
  to gyeop_internal_rpc;

create policy pack_plays_internal_select
  on public.pack_plays
  for select
  to gyeop_internal_rpc
  using (true);

create policy pack_plays_internal_insert
  on public.pack_plays
  for insert
  to gyeop_internal_rpc
  with check (true);

create policy pack_plays_internal_update
  on public.pack_plays
  for update
  to gyeop_internal_rpc
  using (true)
  with check (true);

create policy self_answers_internal_select
  on public.self_answers
  for select
  to gyeop_internal_rpc
  using (true);

create policy self_answers_internal_insert
  on public.self_answers
  for insert
  to gyeop_internal_rpc
  with check (true);

create policy self_answers_internal_update
  on public.self_answers
  for update
  to gyeop_internal_rpc
  using (true)
  with check (true);

create or replace function public.guard_self_answer_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_play_id uuid := case when tg_op = 'DELETE' then old.pack_play_id else new.pack_play_id end;
  v_status text;
begin
  if tg_op = 'UPDATE'
    and (
      new.pack_play_id <> old.pack_play_id
      or new.pack_version_id <> old.pack_version_id
      or new.card_id <> old.card_id
    )
  then
    raise exception using errcode = '55000', message = 'self answer identity is immutable';
  end if;

  select play.status
  into v_status
  from public.pack_plays as play
  where play.id = v_play_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'owner play not found';
  end if;
  if v_status = 'completed' then
    raise exception using errcode = '55000', message = 'completed owner answers are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create trigger guard_self_answer_mutation
before insert or update or delete on public.self_answers
for each row execute function public.guard_self_answer_mutation();

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
  v_expires_at timestamptz;
begin
  if p_play_id is null
    or p_management_secret_hash is null
    or octet_length(p_management_secret_hash) <> 32
    or p_touch is null
  then
    raise exception using errcode = '22023', message = 'invalid owner capability';
  end if;

  select play.management_expires_at
  into v_expires_at
  from public.pack_plays as play
  where play.id = p_play_id
    and play.management_secret_hash = p_management_secret_hash
    and play.management_revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_expires_at <= v_now then
    update public.pack_plays as play
    set management_secret_hash = null,
        management_revoked_at = v_now,
        updated_at = v_now
    where play.id = p_play_id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  if p_touch then
    update public.pack_plays as play
    set last_active_at = v_now,
        management_expires_at = v_now + interval '7 days',
        updated_at = v_now
    where play.id = p_play_id;
  end if;

  return jsonb_build_object('outcome', 'authorized');
end
$function$;

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
    'managementExpiresAt', play.management_expires_at,
    'managementTtlSeconds',
      extract(epoch from (play.management_expires_at - play.last_active_at))::integer
  )
  from public.pack_plays as play
  join public.pack_versions as version
    on version.id = play.pack_version_id
  join public.pack_templates as template
    on template.id = version.template_id
  where play.id = p_play_id;
$function$;

create or replace function public.create_or_resume_play(
  p_pack_slug text,
  p_existing_play_id uuid,
  p_existing_secret_hash bytea,
  p_new_play_id uuid,
  p_new_secret_hash bytea,
  p_network_key bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth jsonb;
  v_limit record;
  v_now timestamptz;
  v_pack_slug text;
  v_retry_after_seconds integer;
  v_version_id uuid;
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
  then
    raise exception using errcode = '22023', message = 'invalid owner play input';
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

    select template.slug
    into v_pack_slug
    from public.pack_plays as play
    join public.pack_versions as version
      on version.id = play.pack_version_id
    join public.pack_templates as template
      on template.id = version.template_id
    where play.id = p_existing_play_id;

    if v_pack_slug <> p_pack_slug then
      return jsonb_build_object('outcome', 'wrong_pack');
    end if;

    v_now := clock_timestamp();
    update public.pack_plays as play
    set last_active_at = v_now,
        management_expires_at = v_now + interval '7 days',
        updated_at = v_now
    where play.id = p_existing_play_id;

    return jsonb_build_object(
      'outcome', 'resumed',
      'play', private.owner_play_state(p_existing_play_id)
    );
  end if;

  select version.id
  into v_version_id
  from public.pack_templates as template
  join public.pack_versions as version
    on version.template_id = template.id
   and version.id = template.published_version_id
  where template.slug = p_pack_slug
    and template.is_active
    and version.published_at is not null
  for update;

  if not found then
    return jsonb_build_object('outcome', 'pack_not_found');
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
    insert into public.pack_plays (
      id,
      pack_version_id,
      management_secret_hash,
      management_expires_at,
      last_active_at,
      status,
      current_position,
      created_at,
      updated_at
    )
    values (
      p_new_play_id,
      v_version_id,
      p_new_secret_hash,
      v_now + interval '7 days',
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

  return jsonb_build_object(
    'outcome', 'created',
    'play', private.owner_play_state(p_new_play_id)
  );
end
$function$;

create or replace function public.get_owner_play(
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
begin
  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    true
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;
  return jsonb_build_object(
    'outcome', 'authorized',
    'play', private.owner_play_state(p_play_id)
  );
end
$function$;

create or replace function public.save_owner_answer(
  p_play_id uuid,
  p_management_secret_hash bytea,
  p_card_id text,
  p_choice text,
  p_current_position smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth jsonb;
  v_now timestamptz;
  v_pack_version_id uuid;
  v_status text;
begin
  if p_choice not in ('a', 'b')
    or p_current_position not between 1 and 10
  then
    raise exception using errcode = '22023', message = 'invalid owner answer input';
  end if;

  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    false
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;

  select play.pack_version_id, play.status
  into v_pack_version_id, v_status
  from public.pack_plays as play
  where play.id = p_play_id;

  v_now := clock_timestamp();
  if v_status = 'completed' then
    update public.pack_plays as play
    set last_active_at = v_now,
        management_expires_at = v_now + interval '7 days',
        updated_at = v_now
    where play.id = p_play_id;
    return jsonb_build_object(
      'outcome', 'completed',
      'play', private.owner_play_state(p_play_id)
    );
  end if;

  if p_card_id is null
    or not exists (
      select 1
      from public.pack_cards as card
      where card.pack_version_id = v_pack_version_id
        and card.id = p_card_id
    )
  then
    return jsonb_build_object('outcome', 'invalid_card');
  end if;

  insert into public.self_answers (
    pack_play_id,
    pack_version_id,
    card_id,
    choice,
    created_at,
    updated_at
  )
  values (
    p_play_id,
    v_pack_version_id,
    p_card_id,
    p_choice,
    v_now,
    v_now
  )
  on conflict (pack_play_id, card_id)
  do update set
    choice = excluded.choice,
    updated_at = excluded.updated_at;

  update public.pack_plays as play
  set current_position = p_current_position,
      last_active_at = v_now,
      management_expires_at = v_now + interval '7 days',
      updated_at = v_now
  where play.id = p_play_id;

  return jsonb_build_object(
    'outcome', 'saved',
    'play', private.owner_play_state(p_play_id)
  );
end
$function$;

create or replace function public.complete_owner_play(
  p_play_id uuid,
  p_management_secret_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_answer_count integer;
  v_auth jsonb;
  v_now timestamptz;
  v_status text;
begin
  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    false
  );
  if v_auth->>'outcome' <> 'authorized' then
    return v_auth;
  end if;

  select play.status
  into v_status
  from public.pack_plays as play
  where play.id = p_play_id;

  v_now := clock_timestamp();
  if v_status = 'completed' then
    update public.pack_plays as play
    set last_active_at = v_now,
        management_expires_at = v_now + interval '7 days',
        updated_at = v_now
    where play.id = p_play_id;
    return jsonb_build_object(
      'outcome', 'completed',
      'play', private.owner_play_state(p_play_id)
    );
  end if;

  select count(*)::integer
  into v_answer_count
  from public.self_answers as answer
  where answer.pack_play_id = p_play_id;

  if v_answer_count <> 10 then
    update public.pack_plays as play
    set last_active_at = v_now,
        management_expires_at = v_now + interval '7 days',
        updated_at = v_now
    where play.id = p_play_id;
    return jsonb_build_object(
      'outcome', 'incomplete',
      'play', private.owner_play_state(p_play_id)
    );
  end if;

  update public.pack_plays as play
  set status = 'completed',
      completed_at = v_now,
      last_active_at = v_now,
      management_expires_at = v_now + interval '7 days',
      updated_at = v_now
  where play.id = p_play_id;

  return jsonb_build_object(
    'outcome', 'completed',
    'play', private.owner_play_state(p_play_id)
  );
end
$function$;

create or replace function public.revoke_owner_play_session(
  p_play_id uuid,
  p_management_secret_hash bytea
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth jsonb;
  v_now timestamptz;
begin
  v_auth := private.authorize_owner_play_capability(
    p_play_id,
    p_management_secret_hash,
    false
  );

  if v_auth->>'outcome' = 'expired' then
    return true;
  end if;
  if v_auth->>'outcome' <> 'authorized' then
    return false;
  end if;

  v_now := clock_timestamp();
  update public.pack_plays as play
  set management_secret_hash = null,
      management_revoked_at = v_now,
      updated_at = v_now
  where play.id = p_play_id;
  return true;
end
$function$;

grant create on schema public to gyeop_internal_rpc;
grant create on schema private to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;

alter function public.guard_self_answer_mutation()
  owner to gyeop_internal_rpc;
alter function private.authorize_owner_play_capability(uuid, bytea, boolean)
  owner to gyeop_internal_rpc;
alter function private.owner_play_state(uuid)
  owner to gyeop_internal_rpc;
alter function public.create_or_resume_play(text, uuid, bytea, uuid, bytea, bytea)
  owner to gyeop_internal_rpc;
alter function public.get_owner_play(uuid, bytea)
  owner to gyeop_internal_rpc;
alter function public.save_owner_answer(uuid, bytea, text, text, smallint)
  owner to gyeop_internal_rpc;
alter function public.complete_owner_play(uuid, bytea)
  owner to gyeop_internal_rpc;
alter function public.revoke_owner_play_session(uuid, bytea)
  owner to gyeop_internal_rpc;

revoke execute on function public.guard_self_answer_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function private.authorize_owner_play_capability(uuid, bytea, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function private.owner_play_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.authorize_owner_play_capability(uuid, bytea, boolean)
  to gyeop_internal_rpc;
grant execute on function private.owner_play_state(uuid)
  to gyeop_internal_rpc;

revoke execute on function public.create_or_resume_play(text, uuid, bytea, uuid, bytea, bytea)
  from public, anon, authenticated;
revoke execute on function public.get_owner_play(uuid, bytea)
  from public, anon, authenticated;
revoke execute on function public.save_owner_answer(uuid, bytea, text, text, smallint)
  from public, anon, authenticated;
revoke execute on function public.complete_owner_play(uuid, bytea)
  from public, anon, authenticated;
revoke execute on function public.revoke_owner_play_session(uuid, bytea)
  from public, anon, authenticated;

grant execute on function public.create_or_resume_play(text, uuid, bytea, uuid, bytea, bytea)
  to service_role;
grant execute on function public.get_owner_play(uuid, bytea)
  to service_role;
grant execute on function public.save_owner_answer(uuid, bytea, text, text, smallint)
  to service_role;
grant execute on function public.complete_owner_play(uuid, bytea)
  to service_role;
grant execute on function public.revoke_owner_play_session(uuid, bytea)
  to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke create on schema private from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

revoke all privileges on table public.pack_plays
  from public, anon, authenticated, service_role;
revoke all privileges on table public.self_answers
  from public, anon, authenticated, service_role;

commit;
