begin;

create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, pg_catalog;

select plan(41);

select is(
  (
    select count(*)
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('pack_templates', 'pack_versions', 'pack_cards')
      and relation.relkind = 'r'
  ),
  3::bigint,
  'all three pack catalog tables exist'
);

select is(
  (
    select jsonb_build_object(
      'slug', slug,
      'title', title,
      'targetRelationship', target_relationship,
      'sensitivity', sensitivity,
      'active', is_active
    )
    from public.pack_templates
    where id = '11111111-1111-4111-8111-111111111111'
  ),
  '{"slug":"old-friend","title":"오래 본 너의 시선","targetRelationship":"old_friend","sensitivity":"low","active":true}'::jsonb,
  'seed recreates the frozen private-MVP active template'
);

select is(
  (
    select count(*)
    from public.pack_templates
    where is_active
      and published_version_id is not null
  ),
  4::bigint,
  'migration and seed expose exactly four active published packs'
);

select is(
  (select count(*) from public.pack_cards),
  40::bigint,
  'the four published packs contain exactly forty cards'
);

select is(
  (
    select jsonb_object_agg(slug, title order by slug)
    from public.pack_templates
    where slug in ('old-friend', 'first-impression', 'coworker', 'honest-self')
  ),
  '{
    "coworker":"같이 일한 너의 시선",
    "first-impression":"처음 만난 너의 시선",
    "honest-self":"가까운 너의 시선",
    "old-friend":"오래 본 너의 시선"
  }'::jsonb,
  'all four reviewed titles are materialized exactly'
);

select ok(
  (
    select published_at is not null
      and published_version_id = '15151515-1515-4515-8515-151515151515'
    from public.pack_templates template
    join public.pack_versions version
      on version.template_id = template.id
     and version.id = template.published_version_id
    where template.id = '11111111-1111-4111-8111-111111111111'
  ),
  'seed publishes v1 and sets the composite current pointer'
);

select is(
  (select count(*) from public.pack_cards where pack_version_id = '15151515-1515-4515-8515-151515151515'),
  10::bigint,
  'seed has exactly ten cards'
);

select is(
  (select count(*) from public.pack_cards where pack_version_id = '15151515-1515-4515-8515-151515151515' and is_signature),
  1::bigint,
  'seed has exactly one Signature card'
);

select is(
  (
    select jsonb_agg(
      jsonb_build_array(id, position, owner_prompt, visitor_prompt, option_a, option_b, is_signature)
      order by position
    )
    from public.pack_cards
    where pack_version_id = '15151515-1515-4515-8515-151515151515'
  ),
  '[
    ["conflict",1,"서운한 일이 생기면 나는?","서운한 일이 생기면 이 사람은?","바로 이야기한다","생각을 정리한 뒤 말한다",true],
    ["reunion",2,"오랜만에 친구를 만나면 나는?","오랜만에 친구를 만나면 이 사람은?","어제 본 듯 바로 편해진다","근황부터 천천히 맞춰 간다",false],
    ["plans",3,"약속을 잡을 때 나는?","약속을 잡을 때 이 사람은?","미리 날짜를 정한다","그때그때 편한 날을 본다",false],
    ["comfort",4,"친구가 고민을 털어놓으면 나는?","친구가 고민을 털어놓으면 이 사람은?","먼저 끝까지 들어준다","해결 방법부터 같이 찾는다",false],
    ["gathering",5,"여러 친구가 모인 자리에서 나는?","여러 친구가 모인 자리에서 이 사람은?","먼저 분위기를 띄운다","익숙한 사람 곁에서 시작한다",false],
    ["reconnect",6,"연락이 뜸해졌을 때 나는?","연락이 뜸해졌을 때 이 사람은?","짧게 안부부터 보낸다","만날 약속부터 잡는다",false],
    ["memory",7,"옛날 이야기가 나오면 나는?","옛날 이야기가 나오면 이 사람은?","구체적인 장면부터 떠올린다","그때 느낀 감정부터 떠올린다",false],
    ["travel",8,"친구와 여행 일정을 정할 때 나는?","친구와 여행 일정을 정할 때 이 사람은?","미리 계획을 세운다","현장에서 그때그때 정한다",false],
    ["celebration",9,"친구의 좋은 소식을 들은 직후 나는?","친구의 좋은 소식을 들은 직후 이 사람은?","바로 연락해 축하한다","다음에 만날 때 직접 축하한다",false],
    ["hard-day",10,"힘든 날에 나는?","힘든 날에 이 사람은?","먼저 연락해 털어놓는다","혼자 정리한 뒤 연락한다",false]
  ]'::jsonb,
  'seed cards exactly match the approved document'
);

select is(
  (
    select jsonb_build_object(
      'slug', pack->'slug',
      'version', pack->'version',
      'cardCount', jsonb_array_length(pack->'cards')
    )
    from (select public.get_published_pack('old-friend') pack) published
  ),
  '{"slug":"old-friend","version":"old-friend-v1","cardCount":10}'::jsonb,
  'active private-MVP seed exposes the reviewed published pack'
);

select ok(
  has_function_privilege('service_role', 'public.get_published_pack(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.publish_pack_version(uuid)', 'EXECUTE'),
  'service role can execute only the named pack RPCs'
);

select ok(
  not has_function_privilege('anon', 'public.get_published_pack(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.get_published_pack(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.publish_pack_version(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.publish_pack_version(uuid)', 'EXECUTE'),
  'public API roles cannot execute pack RPCs'
);

select ok(
  not exists (
    select 1
    from unnest(array['public', 'anon', 'authenticated', 'service_role']) role_name
    cross join unnest(array['pack_templates', 'pack_versions', 'pack_cards']) table_name
    where has_table_privilege(role_name, 'public.' || table_name, 'SELECT')
       or has_table_privilege(role_name, 'public.' || table_name, 'INSERT')
       or has_table_privilege(role_name, 'public.' || table_name, 'UPDATE')
       or has_table_privilege(role_name, 'public.' || table_name, 'DELETE')
  ),
  'public and Data API roles have no direct pack table access'
);

select is(
  (
    select array_agg(policyname order by policyname)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('pack_templates', 'pack_versions', 'pack_cards')
  ),
  array[
    'pack_cards_internal_select',
    'pack_templates_internal_select',
    'pack_templates_internal_update',
    'pack_versions_internal_select',
    'pack_versions_internal_update'
  ]::name[],
  'pack RLS policy names are the exact internal allowlist'
);

insert into public.pack_templates (id, slug, title, target_relationship, sensitivity)
values ('20000000-0000-4000-8000-000000000001', 'nine-card-pack', 'Nine', 'old_friend', 'low');
insert into public.pack_versions (id, template_id, version)
values ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'nine-v1');
insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b, is_signature)
select '21000000-0000-4000-8000-000000000001', 'card-' || value, value, 'Owner ' || value, 'Visitor ' || value, 'A ' || value, 'B ' || value, value = 1
from generate_series(1, 9) value;
select throws_ok(
  $$select public.publish_pack_version('21000000-0000-4000-8000-000000000001')$$,
  '23514',
  'pack version must contain positions 1 through 10 and exactly one signature card',
  'nine-card version cannot publish'
);

insert into public.pack_templates (id, slug, title, target_relationship, sensitivity)
values ('20000000-0000-4000-8000-000000000002', 'zero-signature-pack', 'Zero', 'old_friend', 'low');
insert into public.pack_versions (id, template_id, version)
values ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'zero-v1');
insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b)
select '21000000-0000-4000-8000-000000000002', 'card-' || value, value, 'Owner ' || value, 'Visitor ' || value, 'A ' || value, 'B ' || value
from generate_series(1, 10) value;
select throws_ok(
  $$select public.publish_pack_version('21000000-0000-4000-8000-000000000002')$$,
  '23514',
  'pack version must contain positions 1 through 10 and exactly one signature card',
  'zero-Signature version cannot publish'
);

insert into public.pack_templates (id, slug, title, target_relationship, sensitivity)
values ('20000000-0000-4000-8000-000000000003', 'two-signature-pack', 'Two', 'old_friend', 'low');
insert into public.pack_versions (id, template_id, version)
values ('21000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'two-v1');
insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b, is_signature)
select '21000000-0000-4000-8000-000000000003', 'card-' || value, value, 'Owner ' || value, 'Visitor ' || value, 'A ' || value, 'B ' || value, value <= 2
from generate_series(1, 10) value;
select throws_ok(
  $$select public.publish_pack_version('21000000-0000-4000-8000-000000000003')$$,
  '23514',
  'pack version must contain positions 1 through 10 and exactly one signature card',
  'two-Signature version cannot publish'
);

select throws_ok(
  $$insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b) values ('21000000-0000-4000-8000-000000000003', 'duplicate-position', 10, 'Owner', 'Visitor', 'A', 'B')$$,
  '23505',
  'duplicate key value violates unique constraint "pack_cards_pack_version_id_position_key"',
  'duplicate position is rejected'
);

select throws_ok(
  $$insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b) values ('21000000-0000-4000-8000-000000000003', 'card-11', 11, 'Owner', 'Visitor', 'A', 'B')$$,
  '23514',
  null,
  'eleventh position is rejected by the domain check'
);

select throws_ok(
  $$insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b) values ('21000000-0000-4000-8000-000000000003', 'null-prompt', 9, null, 'Visitor', 'A', 'B')$$,
  '23502',
  null,
  'null prompt is rejected'
);

select throws_ok(
  $$insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b) values ('21000000-0000-4000-8000-000000000003', 'blank-prompt', 9, ' ', 'Visitor', 'A', 'B')$$,
  '23514',
  null,
  'blank prompt is rejected'
);

select throws_ok(
  $$insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b) values ('21000000-0000-4000-8000-000000000003', 'Bad_Id', 9, 'Owner', 'Visitor', 'A', 'B')$$,
  '23514',
  null,
  'invalid card id is rejected'
);

select throws_ok(
  $$insert into public.pack_templates (slug, title, target_relationship, sensitivity) values ('bad-relationship', 'Bad', 'unknown', 'low')$$,
  '23514',
  null,
  'unknown relationship code is rejected'
);

select throws_ok(
  $$update public.pack_versions set version = 'changed' where id = '15151515-1515-4515-8515-151515151515'$$,
  '55000',
  'published pack version is immutable',
  'published version update is rejected'
);

select throws_ok(
  $$delete from public.pack_versions where id = '15151515-1515-4515-8515-151515151515'$$,
  '55000',
  'published pack version is immutable',
  'published version delete is rejected'
);

select throws_ok(
  $$update public.pack_cards set owner_prompt = 'Changed' where pack_version_id = '15151515-1515-4515-8515-151515151515' and id = 'conflict'$$,
  '55000',
  'published pack cards are immutable',
  'published card update is rejected'
);

select throws_ok(
  $$insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b) values ('15151515-1515-4515-8515-151515151515', 'late-card', 10, 'Owner', 'Visitor', 'A', 'B')$$,
  '55000',
  'published pack cards are immutable',
  'published card insert is rejected before uniqueness checks'
);

select throws_ok(
  $$delete from public.pack_cards where pack_version_id = '15151515-1515-4515-8515-151515151515' and id = 'conflict'$$,
  '55000',
  'published pack cards are immutable',
  'published card delete is rejected'
);

select throws_ok(
  $$update public.pack_cards set pack_version_id = '21000000-0000-4000-8000-000000000002' where pack_version_id = '21000000-0000-4000-8000-000000000003' and id = 'card-1'$$,
  '55000',
  'pack cards cannot move between versions',
  'draft cards cannot move between versions'
);

select lives_ok(
  $$insert into public.pack_cards (pack_version_id, id, position, owner_prompt, visitor_prompt, option_a, option_b) values ('21000000-0000-4000-8000-000000000001', 'card-10', 10, 'Owner 10', 'Visitor 10', 'A 10', 'B 10')$$,
  'new draft card work remains possible'
);

select throws_ok(
  $$update public.pack_versions set published_at = clock_timestamp() where id = '21000000-0000-4000-8000-000000000001'$$,
  '55000',
  'pack version must be published through publish_pack_version',
  'direct published timestamp update is rejected'
);

select throws_ok(
  $$update public.pack_templates set published_version_id = '21000000-0000-4000-8000-000000000002' where id = '20000000-0000-4000-8000-000000000001'$$,
  '55000',
  'pack template must be published through publish_pack_version',
  'direct cross-template publication pointer is rejected'
);

update public.pack_templates set is_active = true where id = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$set local role service_role; select public.get_published_pack('old-friend'); reset role$$,
  'service role executes the RLS-backed published read'
);

select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(public.get_published_pack('old-friend')) key
  ),
  array['cards', 'sensitivity', 'slug', 'targetRelationship', 'title', 'version']::text[],
  'published root fields are an exact allowlist'
);

select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(public.get_published_pack('old-friend')->'cards'->0) key
  ),
  array['id', 'isSignature', 'optionA', 'optionB', 'ownerPrompt', 'position', 'visitorPrompt']::text[],
  'published card fields are an exact allowlist'
);

select ok(
  not (public.get_published_pack('old-friend') ?| array['id', 'published_at', 'status', 'draft', 'answers', 'token']),
  'published pack does not leak internal or answer fields'
);

update public.pack_templates set is_active = false where id = '11111111-1111-4111-8111-111111111111';
select is(public.get_published_pack('old-friend'), null::jsonb, 'deactivation takes effect immediately');

select ok(
  (select bool_and(attnotnull) from pg_catalog.pg_attribute where attrelid = 'public.pack_cards'::regclass and attnum > 0 and not attisdropped),
  'every pack card column is NOT NULL'
);

select ok(
  (select bool_and(attnotnull) from pg_catalog.pg_attribute where attrelid = 'public.pack_versions'::regclass and attname in ('id', 'template_id', 'version', 'created_at'))
  and (select bool_and(attnotnull) from pg_catalog.pg_attribute where attrelid = 'public.pack_templates'::regclass and attname in ('id', 'slug', 'title', 'target_relationship', 'sensitivity', 'is_active', 'created_at', 'updated_at')),
  'required template and version columns are NOT NULL'
);

select lives_ok(
  $$set local role service_role; select public.publish_pack_version('21000000-0000-4000-8000-000000000001'); reset role$$,
  'service role publishes a valid version through RLS-backed policies'
);

select is(
  (select count(*) from public.pack_versions where id in ('21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000003') and published_at is not null),
  1::bigint,
  'only the explicitly valid fixture publishes'
);

select * from finish();
rollback;
