begin;

create table public.pack_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (
      length(slug) between 1 and 64
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  title text not null
    check (title = btrim(title) and length(title) between 1 and 80),
  target_relationship text not null
    check (target_relationship in ('old_friend')),
  sensitivity text not null
    check (sensitivity in ('low', 'medium', 'high')),
  is_active boolean not null default false,
  published_version_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, published_version_id)
);

create table public.pack_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null
    references public.pack_templates (id)
    on update restrict
    on delete restrict,
  version text not null
    check (
      length(version) between 1 and 80
      and version ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  published_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (template_id, version),
  unique (template_id, id)
);

alter table public.pack_templates
  add constraint pack_templates_published_version_fkey
  foreign key (id, published_version_id)
  references public.pack_versions (template_id, id)
  on update restrict
  on delete restrict;

create table public.pack_cards (
  pack_version_id uuid not null
    references public.pack_versions (id)
    on update restrict
    on delete restrict,
  id text not null
    check (
      length(id) between 1 and 64
      and id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  position smallint not null check (position between 1 and 10),
  owner_prompt text not null
    check (
      owner_prompt = btrim(owner_prompt)
      and length(owner_prompt) between 1 and 200
    ),
  visitor_prompt text not null
    check (
      visitor_prompt = btrim(visitor_prompt)
      and length(visitor_prompt) between 1 and 200
    ),
  option_a text not null
    check (option_a = btrim(option_a) and length(option_a) between 1 and 120),
  option_b text not null
    check (option_b = btrim(option_b) and length(option_b) between 1 and 120),
  is_signature boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (pack_version_id, id),
  unique (pack_version_id, position),
  check (option_a <> option_b)
);

alter table public.pack_templates enable row level security;
alter table public.pack_versions enable row level security;
alter table public.pack_cards enable row level security;

grant select, update on table public.pack_templates to gyeop_internal_rpc;
grant select, update on table public.pack_versions to gyeop_internal_rpc;
grant select on table public.pack_cards to gyeop_internal_rpc;

create policy pack_templates_internal_select
  on public.pack_templates
  for select
  to gyeop_internal_rpc
  using (true);

create policy pack_templates_internal_update
  on public.pack_templates
  for update
  to gyeop_internal_rpc
  using (true)
  with check (true);

create policy pack_versions_internal_select
  on public.pack_versions
  for select
  to gyeop_internal_rpc
  using (true);

create policy pack_versions_internal_update
  on public.pack_versions
  for update
  to gyeop_internal_rpc
  using (true)
  with check (true);

create policy pack_cards_internal_select
  on public.pack_cards
  for select
  to gyeop_internal_rpc
  using (true);

create or replace function public.guard_pack_version_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.published_at is not null then
    raise exception using errcode = '55000', message = 'published pack version is immutable';
  end if;

  if tg_op = 'UPDATE'
    and new.published_at is not null
    and coalesce(current_setting('gyeop.pack_publish_version_id', true), '') <> old.id::text
  then
    raise exception using errcode = '55000', message = 'pack version must be published through publish_pack_version';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create trigger guard_pack_version_immutability
before update or delete on public.pack_versions
for each row execute function public.guard_pack_version_immutability();

create or replace function public.guard_pack_template_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(new.published_version_id::text, '') <> coalesce(old.published_version_id::text, '')
    and coalesce(current_setting('gyeop.pack_publish_version_id', true), '') <> coalesce(new.published_version_id::text, '')
  then
    raise exception using errcode = '55000', message = 'pack template must be published through publish_pack_version';
  end if;
  return new;
end
$function$;

create trigger guard_pack_template_publication
before update of published_version_id on public.pack_templates
for each row execute function public.guard_pack_template_publication();

create or replace function public.guard_pack_card_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_version_id uuid;
  v_published_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.pack_version_id <> old.pack_version_id then
    raise exception using errcode = '55000', message = 'pack cards cannot move between versions';
  end if;

  if tg_op = 'DELETE' then
    v_version_id := old.pack_version_id;
  else
    v_version_id := new.pack_version_id;
  end if;

  select version.published_at
  into v_published_at
  from public.pack_versions as version
  where version.id = v_version_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'pack version does not exist';
  end if;
  if v_published_at is not null then
    raise exception using errcode = '55000', message = 'published pack cards are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create trigger guard_pack_card_mutation
before insert or update or delete on public.pack_cards
for each row execute function public.guard_pack_card_mutation();

create or replace function public.publish_pack_version(p_pack_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_template_id uuid;
  v_published_at timestamptz;
  v_card_count integer;
  v_distinct_positions integer;
  v_min_position integer;
  v_max_position integer;
  v_signature_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_pack_version_id is null then
    raise exception using errcode = '22023', message = 'pack version id is required';
  end if;

  select version.template_id, version.published_at
  into v_template_id, v_published_at
  from public.pack_versions as version
  where version.id = p_pack_version_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'pack version not found';
  end if;
  if v_published_at is not null then
    raise exception using errcode = '55000', message = 'pack version is already published';
  end if;

  perform 1
  from public.pack_templates as template
  where template.id = v_template_id
  for update;

  select
    count(*)::integer,
    count(distinct card.position)::integer,
    min(card.position)::integer,
    max(card.position)::integer,
    count(*) filter (where card.is_signature)::integer
  into
    v_card_count,
    v_distinct_positions,
    v_min_position,
    v_max_position,
    v_signature_count
  from public.pack_cards as card
  where card.pack_version_id = p_pack_version_id;

  if v_card_count <> 10
    or v_distinct_positions <> 10
    or v_min_position <> 1
    or v_max_position <> 10
    or v_signature_count <> 1
  then
    raise exception using errcode = '23514', message = 'pack version must contain positions 1 through 10 and exactly one signature card';
  end if;

  perform set_config('gyeop.pack_publish_version_id', p_pack_version_id::text, true);

  update public.pack_versions as version
  set published_at = v_now
  where version.id = p_pack_version_id;

  update public.pack_templates as template
  set published_version_id = p_pack_version_id,
      updated_at = v_now
  where template.id = v_template_id;

  return p_pack_version_id;
end
$function$;

create or replace function public.get_published_pack(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'slug', template.slug,
    'title', template.title,
    'version', version.version,
    'targetRelationship', template.target_relationship,
    'sensitivity', template.sensitivity,
    'cards', (
      select jsonb_agg(
        jsonb_build_object(
          'id', card.id,
          'position', card.position,
          'ownerPrompt', card.owner_prompt,
          'visitorPrompt', card.visitor_prompt,
          'optionA', card.option_a,
          'optionB', card.option_b,
          'isSignature', card.is_signature
        )
        order by card.position
      )
      from public.pack_cards as card
      where card.pack_version_id = version.id
    )
  )
  from public.pack_templates as template
  join public.pack_versions as version
    on version.template_id = template.id
   and version.id = template.published_version_id
  where p_slug is not null
    and length(p_slug) between 1 and 64
    and p_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and template.slug = p_slug
    and template.is_active
    and version.published_at is not null;
$function$;

grant create on schema public to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;
alter function public.guard_pack_version_immutability() owner to gyeop_internal_rpc;
alter function public.guard_pack_template_publication() owner to gyeop_internal_rpc;
alter function public.guard_pack_card_mutation() owner to gyeop_internal_rpc;
alter function public.publish_pack_version(uuid) owner to gyeop_internal_rpc;
alter function public.get_published_pack(text) owner to gyeop_internal_rpc;

revoke execute on function public.guard_pack_version_immutability()
  from public, anon, authenticated, service_role;
revoke execute on function public.guard_pack_template_publication()
  from public, anon, authenticated, service_role;
revoke execute on function public.guard_pack_card_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function public.publish_pack_version(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_published_pack(text)
  from public, anon, authenticated;
grant execute on function public.publish_pack_version(uuid) to service_role;
grant execute on function public.get_published_pack(text) to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

revoke all privileges on table public.pack_templates
  from public, anon, authenticated, service_role;
revoke all privileges on table public.pack_versions
  from public, anon, authenticated, service_role;
revoke all privileges on table public.pack_cards
  from public, anon, authenticated, service_role;

commit;
