begin;

create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, pg_catalog;

select plan(20);

select is(
  (
    select count(*)
    from pg_catalog.pg_roles
    where rolname = 'gyeop_internal_rpc'
      and not rolcanlogin
      and not rolinherit
      and not rolsuper
      and not rolcreatedb
      and not rolcreaterole
      and not rolreplication
      and not rolbypassrls
  ),
  1::bigint,
  'internal RPC owner has only the required role attributes'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_catalog.pg_roles member_role on member_role.oid = membership.member
    where granted_role.rolname = 'gyeop_internal_rpc'
      and (
        member_role.rolname <> 'postgres'
        or membership.inherit_option
        or membership.set_option
      )
  ),
  0::bigint,
  'no runtime role can inherit or set the internal RPC owner'
);

select ok(
  has_schema_privilege('gyeop_internal_rpc', 'public', 'USAGE'),
  'internal RPC owner can resolve public objects'
);

select ok(
  not has_schema_privilege('gyeop_internal_rpc', 'public', 'CREATE'),
  'internal RPC owner cannot create public objects'
);

select ok(
  has_table_privilege('gyeop_internal_rpc', 'public.rate_limit_buckets', 'SELECT'),
  'internal RPC owner can read rate limit buckets'
);

select ok(
  has_table_privilege('gyeop_internal_rpc', 'public.rate_limit_buckets', 'INSERT'),
  'internal RPC owner can insert rate limit buckets'
);

select ok(
  has_table_privilege('gyeop_internal_rpc', 'public.rate_limit_buckets', 'UPDATE'),
  'internal RPC owner can update rate limit buckets'
);

select ok(
  not has_table_privilege('gyeop_internal_rpc', 'public.rate_limit_buckets', 'DELETE'),
  'internal RPC owner cannot delete rate limit buckets'
);

select ok(
  not has_table_privilege('gyeop_internal_rpc', 'public.analytics_events', 'SELECT')
  and has_table_privilege('gyeop_internal_rpc', 'public.analytics_events', 'INSERT')
  and not has_table_privilege('gyeop_internal_rpc', 'public.analytics_events', 'UPDATE')
  and not has_table_privilege('gyeop_internal_rpc', 'public.analytics_events', 'DELETE'),
  'internal RPC owner can only insert allowlisted analytics events'
);
select is(
  (
    select coalesce(
      array_agg(
        relation.relname || ':' || grant_row.privilege_type
        order by relation.relname || ':' || grant_row.privilege_type
      ),
      array[]::text[]
    )
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) grant_row
    join pg_catalog.pg_roles grantee on grantee.oid = grant_row.grantee
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and grantee.rolname = 'gyeop_internal_rpc'
  ),
  array[
    'analytics_events:INSERT',
    'pack_cards:SELECT',
    'pack_plays:INSERT',
    'pack_plays:SELECT',
    'pack_plays:UPDATE',
    'pack_templates:SELECT',
    'pack_templates:UPDATE',
    'pack_versions:SELECT',
    'pack_versions:UPDATE',
    'rate_limit_buckets:INSERT',
    'rate_limit_buckets:SELECT',
    'rate_limit_buckets:UPDATE',
    'self_answers:INSERT',
    'self_answers:SELECT',
    'self_answers:UPDATE',
    'share_links:INSERT',
    'share_links:SELECT',
    'share_links:UPDATE',
    'visitor_answers:INSERT',
    'visitor_answers:SELECT',
    'visitor_answers:UPDATE',
    'visitor_assignments:INSERT',
    'visitor_assignments:SELECT',
    'visitor_responses:INSERT',
    'visitor_responses:SELECT',
    'visitor_responses:UPDATE'
  ]::text[],
  'internal RPC owner relation privileges match the exact allowlist'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
      and not exists (
        select 1
        from pg_catalog.pg_depend dependency
        where dependency.classid = 'pg_class'::regclass
          and dependency.objid = relation.oid
          and dependency.deptype = 'e'
      )
  ),
  'every public application table has RLS enabled'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) grant_row
    left join pg_catalog.pg_roles grantee on grantee.oid = grant_row.grantee
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_catalog.pg_depend dependency
        where dependency.classid = 'pg_class'::regclass
          and dependency.objid = relation.oid
          and dependency.deptype = 'e'
      )
      and (grant_row.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role'))
      and grant_row.privilege_type in (
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
        'MAINTAIN'
      )
  ),
  'public API roles have no direct application table privileges'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class sequence
    join pg_catalog.pg_namespace namespace on namespace.oid = sequence.relnamespace
    cross join lateral aclexplode(
      coalesce(sequence.relacl, acldefault('S', sequence.relowner))
    ) grant_row
    left join pg_catalog.pg_roles grantee on grantee.oid = grant_row.grantee
    where namespace.nspname = 'public'
      and sequence.relkind = 'S'
      and (grant_row.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role'))
  ),
  'public API roles have no direct public sequence privileges'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_default_acl defaults
    join pg_catalog.pg_roles owner_role on owner_role.oid = defaults.defaclrole
    join pg_catalog.pg_namespace namespace on namespace.oid = defaults.defaclnamespace
    cross join lateral aclexplode(defaults.defaclacl) grant_row
    left join pg_catalog.pg_roles grantee on grantee.oid = grant_row.grantee
    where owner_role.rolname = 'postgres'
      and namespace.nspname = 'public'
      and (grant_row.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role'))
  ),
  'postgres public-schema default privileges are fail closed'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    cross join lateral aclexplode(
      coalesce(function.proacl, acldefault('f', function.proowner))
    ) grant_row
    left join pg_catalog.pg_roles grantee on grantee.oid = grant_row.grantee
    where namespace.nspname = 'public'
      and not exists (
        select 1
        from pg_catalog.pg_depend dependency
        where dependency.classid = 'pg_proc'::regclass
          and dependency.objid = function.oid
          and dependency.deptype = 'e'
      )
      and (grant_row.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      and grant_row.privilege_type = 'EXECUTE'
  ),
  'PUBLIC, anon, and authenticated cannot execute application functions'
);

select is(
  (
    select coalesce(
      array_agg(function.oid::regprocedure::text order by function.oid::regprocedure::text),
      array[]::text[]
    )
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and has_function_privilege('service_role', function.oid, 'EXECUTE')
      and not exists (
        select 1
        from pg_catalog.pg_depend dependency
        where dependency.classid = 'pg_proc'::regclass
          and dependency.objid = function.oid
          and dependency.deptype = 'e'
      )
  ),
  array[
    'complete_owner_play(uuid,bytea)',
    'consume_rate_limit(bytea,text,integer,integer)',
    'create_or_resume_play(text,uuid,bytea,uuid,bytea,bytea)',
    'create_share_link(uuid,bytea,uuid,text,bytea,text,timestamp with time zone)',
    'disable_share_link(uuid,bytea,uuid)',
    'get_invite_metadata(text,bytea)',
    'get_owner_play(uuid,bytea)',
    'get_owner_profile(uuid,bytea)',
    'get_published_pack(text)',
    'get_visitor_response(uuid,bytea)',
    'list_owner_share_links(uuid,bytea)',
    'publish_pack_version(uuid)',
    'record_owner_profile_event(uuid,bytea,text)',
    'record_owner_share_action(uuid,bytea,uuid,text)',
    'record_visitor_response_event(uuid,bytea,text)',
    'revoke_owner_play_session(uuid,bytea)',
    'rotate_share_link(uuid,bytea,uuid,uuid,text,bytea)',
    'save_owner_answer(uuid,bytea,text,text,smallint)',
    'save_response_answer(uuid,bytea,text,text)',
    'start_required_response(text,bytea,text,uuid,bytea,uuid,bytea,text,text,bytea)',
    'start_response(text,bytea,text,uuid,bytea,uuid,bytea,text,text,bytea)',
    'submit_response(uuid,bytea,bytea)'
  ]::text[],
  'service_role function grants match the exact RPC allowlist'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid = function.proowner
    where namespace.nspname = 'public'
      and function.prosecdef
      and not exists (
        select 1
        from pg_catalog.pg_depend dependency
        where dependency.classid = 'pg_proc'::regclass
          and dependency.objid = function.oid
          and dependency.deptype = 'e'
      )
      and (
        owner_role.rolname <> 'gyeop_internal_rpc'
        or not coalesce(function.proconfig, array[]::text[]) @> array['search_path=""']::text[]
      )
  ),
  'every SECURITY DEFINER application function has the minimal owner and empty search path'
);

select ok(
  (
    select function.prosrc like '%public.rate_limit_buckets%'
    from pg_catalog.pg_proc function
    where function.oid = 'public.consume_rate_limit(bytea,text,integer,integer)'::regprocedure
  ),
  'consume_rate_limit schema-qualifies its application relation'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    cross join lateral regexp_matches(
      function.prosrc,
      '(?:\mfrom|\mjoin|\mupdate|\minsert\s+into|\mdelete\s+from)\s+([a-z_][a-z0-9_$.]*)',
      'gi'
    ) relation_match
    where namespace.nspname = 'public'
      and function.prosecdef
      and lower(relation_match[1]) <> 'set'
      and lower(relation_match[1]) <> 'of'
      and lower(relation_match[1]) !~ '^(public|private|pg_catalog)\.'
      and not exists (
        select 1
        from pg_catalog.pg_depend dependency
        where dependency.classid = 'pg_proc'::regclass
          and dependency.objid = function.oid
          and dependency.deptype = 'e'
      )
  ),
  'every SECURITY DEFINER application function schema-qualifies relation references'
);

select ok(
  (
    select count(*) = 1
      and bool_and(policy.roles = array['gyeop_internal_rpc']::name[])
      and bool_and(policy.cmd = 'ALL')
      and bool_and(policy.qual = 'true')
      and bool_and(policy.with_check = 'true')
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'rate_limit_buckets'
  ),
  'rate limit RLS exposes one internal-owner policy only'
);

select * from finish();

rollback;
