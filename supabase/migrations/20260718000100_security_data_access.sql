begin;

alter default privileges for role postgres in schema public
  revoke all privileges on tables
  from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences
  from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions
  from public, anon, authenticated, service_role;

revoke all privileges on all tables in schema public
  from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema public
  from public, anon, authenticated, service_role;
revoke execute on all functions in schema public
  from public, anon, authenticated, service_role;

do $role$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'gyeop_internal_rpc') then
    create role gyeop_internal_rpc
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  elsif exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'gyeop_internal_rpc'
      and (
        rolcanlogin
        or rolinherit
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolreplication
        or rolbypassrls
      )
  ) then
    raise exception 'gyeop_internal_rpc role attributes are unsafe';
  end if;
end
$role$;

revoke all privileges on schema public from gyeop_internal_rpc;
grant usage on schema public to gyeop_internal_rpc;

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_]{0,63}$'),
  properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(properties) = 'object'),
  occurred_at timestamptz not null default clock_timestamp()
);

create index analytics_events_event_name_occurred_at_idx
  on public.analytics_events (event_name, occurred_at);

create table public.rate_limit_buckets (
  key_hash bytea not null check (octet_length(key_hash) = 32),
  action text not null check (action ~ '^[a-z][a-z0-9_]{0,63}$'),
  window_start timestamptz not null,
  count integer not null check (count > 0),
  expires_at timestamptz not null,
  primary key (key_hash, action, window_start),
  constraint rate_limit_buckets_expiry_check check (
    expires_at > window_start
    and expires_at <= window_start + interval '24 hours'
  )
);

create index rate_limit_buckets_expires_at_idx
  on public.rate_limit_buckets (expires_at);

alter table public.analytics_events enable row level security;
alter table public.rate_limit_buckets enable row level security;

grant select, insert, update on table public.rate_limit_buckets
  to gyeop_internal_rpc;

create policy rate_limit_buckets_internal_rpc
  on public.rate_limit_buckets
  for all
  to gyeop_internal_rpc
  using (true)
  with check (true);

create or replace function public.consume_rate_limit(
  p_key_hash bytea,
  p_action text,
  p_window_seconds integer,
  p_limit integer
)
returns table (
  allowed boolean,
  current_count integer,
  limit_count integer,
  retry_after_seconds integer,
  window_start timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_window_start timestamptz;
  v_expires_at timestamptz;
  v_count integer;
begin
  if p_key_hash is null or octet_length(p_key_hash) <> 32 then
    raise exception using errcode = '22023', message = 'invalid rate limit key';
  end if;
  if p_action is null or p_action !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception using errcode = '22023', message = 'invalid rate limit action';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'invalid rate limit window';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception using errcode = '22023', message = 'invalid rate limit limit';
  end if;

  v_window := make_interval(secs => p_window_seconds);
  v_window_start := date_bin(
    v_window,
    v_now,
    timestamptz '1970-01-01 00:00:00+00'
  );
  v_expires_at := v_window_start + v_window;

  insert into public.rate_limit_buckets (
    key_hash,
    action,
    window_start,
    count,
    expires_at
  )
  values (
    p_key_hash,
    p_action,
    v_window_start,
    1,
    v_expires_at
  )
  on conflict on constraint rate_limit_buckets_pkey
  do update set
    count = public.rate_limit_buckets.count + 1,
    expires_at = excluded.expires_at
  returning public.rate_limit_buckets.count into v_count;

  return query
  select
    v_count <= p_limit,
    v_count,
    p_limit,
    greatest(1, ceil(extract(epoch from (v_expires_at - v_now)))::integer),
    v_window_start,
    v_expires_at;
end
$function$;

grant gyeop_internal_rpc to postgres;
grant create on schema public to gyeop_internal_rpc;
alter function public.consume_rate_limit(bytea, text, integer, integer)
  owner to gyeop_internal_rpc;
revoke execute on function public.consume_rate_limit(bytea, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(bytea, text, integer, integer)
  to service_role;
revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
