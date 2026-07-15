begin;

create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

select plan(1);
select pass('local Supabase runs pgTAP tests');
select * from finish();

rollback;
