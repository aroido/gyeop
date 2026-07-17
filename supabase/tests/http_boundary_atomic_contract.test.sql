begin;

select plan(13);

create schema http_boundary_test;

create table http_boundary_test.domain_rows (
  id bigint generated always as identity primary key,
  context_key text not null unique
);

create table http_boundary_test.assignment_rows (
  domain_id bigint not null references http_boundary_test.domain_rows(id),
  value text not null
);

create function http_boundary_test.atomic_resume_or_create(
  p_key_hash bytea,
  p_context_key text,
  p_limit integer,
  p_failure text default null
)
returns text
language plpgsql
set search_path = ''
as $function$
declare
  v_domain_id bigint;
  v_limit record;
begin
  select row.id
  into v_domain_id
  from http_boundary_test.domain_rows row
  where row.context_key = p_context_key;

  if found then
    return 'resumed';
  end if;

  begin
    select *
    into strict v_limit
    from public.consume_rate_limit(
      p_key_hash,
      'http_boundary_contract',
      3600,
      p_limit
    );

    if not v_limit.allowed then
      raise exception using errcode = 'P1401', message = 'rate_limited';
    end if;

    insert into http_boundary_test.domain_rows (context_key)
    values (p_context_key)
    returning id into v_domain_id;

    if p_failure = 'domain' then
      raise exception using errcode = 'P1402', message = 'domain_failure';
    end if;

    insert into http_boundary_test.assignment_rows (domain_id, value)
    values (v_domain_id, 'assigned');

    if p_failure = 'assignment' then
      raise exception using errcode = 'P1402', message = 'assignment_failure';
    end if;

    return 'created';
  exception
    when sqlstate 'P1401' then
      return 'rate_limited';
    when sqlstate 'P1402' then
      return 'failed';
  end;
end
$function$;

select is(
  http_boundary_test.atomic_resume_or_create(
    decode(repeat('11', 32), 'hex'),
    'resume-context',
    5
  ),
  'created',
  'new context creates one domain row'
);

select is(
  (
    select count
    from public.rate_limit_buckets
    where key_hash = decode(repeat('11', 32), 'hex')
      and action = 'http_boundary_contract'
  ),
  1,
  'new context consumes one quota unit'
);

select is(
  http_boundary_test.atomic_resume_or_create(
    decode(repeat('11', 32), 'hex'),
    'resume-context',
    5
  ),
  'resumed',
  'valid same-context resume returns before rate limiting'
);

select is(
  (
    select count
    from public.rate_limit_buckets
    where key_hash = decode(repeat('11', 32), 'hex')
      and action = 'http_boundary_contract'
  ),
  1,
  'valid resume leaves the bucket count unchanged'
);

select is(
  (
    select allowed
    from public.consume_rate_limit(
      decode(repeat('22', 32), 'hex'),
      'http_boundary_contract',
      3600,
      1
    )
  ),
  true,
  'rate-limit fixture fills the allowed slot'
);

select is(
  http_boundary_test.atomic_resume_or_create(
    decode(repeat('22', 32), 'hex'),
    'limited-context',
    1
  ),
  'rate_limited',
  'limit plus one returns a normal rate_limited outcome'
);

select is(
  (
    select count
    from public.rate_limit_buckets
    where key_hash = decode(repeat('22', 32), 'hex')
      and action = 'http_boundary_contract'
  ),
  1,
  'rate_limited subtransaction rolls the increment back'
);

select is(
  (select count(*) from http_boundary_test.domain_rows where context_key = 'limited-context'),
  0::bigint,
  'rate_limited subtransaction leaves no domain row'
);

select is(
  http_boundary_test.atomic_resume_or_create(
    decode(repeat('33', 32), 'hex'),
    'domain-failure',
    5,
    'domain'
  ),
  'failed',
  'domain failure returns a generic failed outcome'
);

select is(
  (select count(*) from public.rate_limit_buckets where key_hash = decode(repeat('33', 32), 'hex')),
  0::bigint,
  'domain failure rolls the bucket back'
);

select is(
  (select count(*) from http_boundary_test.domain_rows where context_key = 'domain-failure'),
  0::bigint,
  'domain failure rolls the domain row back'
);

select is(
  http_boundary_test.atomic_resume_or_create(
    decode(repeat('44', 32), 'hex'),
    'assignment-failure',
    5,
    'assignment'
  ),
  'failed',
  'assignment failure returns a generic failed outcome'
);

select ok(
  not exists (
    select 1
    from public.rate_limit_buckets
    where key_hash = decode(repeat('44', 32), 'hex')
  )
  and not exists (
    select 1
    from http_boundary_test.domain_rows
    where context_key = 'assignment-failure'
  )
  and not exists (
    select 1
    from http_boundary_test.assignment_rows assignment
    join http_boundary_test.domain_rows domain on domain.id = assignment.domain_id
    where domain.context_key = 'assignment-failure'
  ),
  'assignment failure rolls bucket, domain, and assignment back together'
);

select * from finish();

rollback;
