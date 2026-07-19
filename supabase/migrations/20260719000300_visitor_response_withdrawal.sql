begin;

alter table public.visitor_responses
  drop constraint visitor_responses_state_check;

alter table public.visitor_responses
  alter column pack_version_id drop not null,
  alter column session_expires_at drop not null,
  alter column created_at drop not null;

alter table public.visitor_responses
  add constraint visitor_responses_state_check check (
    (
      status in ('draft', 'submitted')
      and pack_version_id is not null
      and relationship_code is not null
      and relationship_code in (
        'old_friend', 'school_friend', 'coworker', 'romantic', 'family',
        'online_friend', 'social_follower', 'other'
      )
      and known_since_code is not null
      and known_since_code in (
        'under_one_year', 'one_to_three_years', 'three_to_five_years',
        'five_to_ten_years', 'ten_years_or_more', 'not_sure'
      )
      and session_token_hash is not null
      and session_expires_at is not null
      and created_at is not null
      and session_expires_at = created_at + interval '24 hours'
      and withdrawn_at is null
      and (
        (
          status = 'draft'
          and management_token_hash is null
          and submitted_at is null
        )
        or (
          status = 'submitted'
          and management_token_hash is not null
          and octet_length(management_token_hash) = 32
          and submitted_at is not null
        )
      )
    )
    or (
      status = 'withdrawn'
      and pack_version_id is null
      and relationship_code is null
      and known_since_code is null
      and session_token_hash is null
      and session_expires_at is null
      and management_token_hash is null
      and created_at is null
      and submitted_at is not null
      and withdrawn_at is not null
    )
  );

drop trigger visitor_response_analytics_scrub
  on public.visitor_responses;
drop function private.scrub_withdrawn_analytics_subject();

grant delete on table public.visitor_answers, public.visitor_assignments
  to gyeop_internal_rpc;

create policy visitor_answers_internal_delete
  on public.visitor_answers
  for delete
  to gyeop_internal_rpc
  using (true);

create policy visitor_assignments_internal_delete
  on public.visitor_assignments
  for delete
  to gyeop_internal_rpc
  using (true);

grant update (
  owner_play_id,
  share_link_id,
  visitor_response_id,
  properties
) on table public.analytics_events to gyeop_internal_rpc;
grant select (visitor_response_id)
  on table public.analytics_events to gyeop_internal_rpc;

create policy analytics_withdrawal_subject_internal_select
  on public.analytics_events
  for select
  to gyeop_internal_rpc
  using (true);

create policy analytics_withdrawal_scrub_internal_update
  on public.analytics_events
  for update
  to gyeop_internal_rpc
  using (visitor_response_id is not null)
  with check (
    owner_play_id is null
    and share_link_id is null
    and visitor_response_id is null
    and properties = '{}'::jsonb
  );

create function private.enforce_analytics_withdrawal_scrub()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.visitor_response_id is null
    or new.id <> old.id
    or new.event_name <> old.event_name
    or new.occurred_at <> old.occurred_at
    or new.owner_play_id is not null
    or new.share_link_id is not null
    or new.visitor_response_id is not null
    or new.properties <> '{}'::jsonb
  then
    raise exception using
      errcode = '42501',
      message = 'analytics withdrawal denied';
  end if;
  return new;
end
$function$;

revoke execute on function private.enforce_analytics_withdrawal_scrub()
  from public, anon, authenticated, service_role;

create trigger analytics_withdrawal_scrub_guard
before update on public.analytics_events
for each row execute function private.enforce_analytics_withdrawal_scrub();

create function private.scrub_deleted_response_analytics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.analytics_events as event
  set owner_play_id = null,
      share_link_id = null,
      visitor_response_id = null,
      properties = '{}'::jsonb
  where event.visitor_response_id = old.id;
  return old;
end
$function$;

revoke execute on function private.scrub_deleted_response_analytics()
  from public, anon, authenticated, service_role;

create trigger visitor_response_delete_analytics_scrub
before delete on public.visitor_responses
for each row execute function private.scrub_deleted_response_analytics();

create policy analytics_withdrawal_internal_insert
  on public.analytics_events
  for insert
  to gyeop_internal_rpc
  with check (
    event_name = 'response_withdrawn'
    and owner_play_id is null
    and share_link_id is null
    and visitor_response_id is null
    and properties = '{}'::jsonb
  );

create function public.withdraw_response(p_management_hash bytea)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_response_id uuid;
  v_now timestamptz;
begin
  if p_management_hash is null
    or octet_length(p_management_hash) <> 32
  then
    raise exception using
      errcode = '22023',
      message = 'invalid visitor management capability';
  end if;

  select response.id
  into v_response_id
  from public.visitor_responses as response
  where response.management_token_hash = p_management_hash
    and response.status = 'submitted'
  for update;

  if not found then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  v_now := clock_timestamp();

  delete from public.visitor_answers as answer
  where answer.response_id = v_response_id;

  delete from public.visitor_assignments as assignment
  where assignment.response_id = v_response_id;

  update public.analytics_events as event
  set owner_play_id = null,
      share_link_id = null,
      visitor_response_id = null,
      properties = '{}'::jsonb
  where event.visitor_response_id = v_response_id;

  update public.visitor_responses as response
  set status = 'withdrawn',
      pack_version_id = null,
      relationship_code = null,
      known_since_code = null,
      session_token_hash = null,
      session_expires_at = null,
      management_token_hash = null,
      created_at = null,
      withdrawn_at = v_now
  where response.id = v_response_id;

  insert into public.analytics_events (event_name, properties)
  values ('response_withdrawn', '{}'::jsonb);

  return jsonb_build_object('outcome', 'withdrawn');
end
$function$;

grant gyeop_internal_rpc to postgres;
grant create on schema public to gyeop_internal_rpc;

alter function public.withdraw_response(bytea)
  owner to gyeop_internal_rpc;

revoke execute on function public.withdraw_response(bytea)
  from public, anon, authenticated;
grant execute on function public.withdraw_response(bytea)
  to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke create on schema private from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

revoke all privileges on table public.visitor_answers
  from public, anon, authenticated, service_role;
revoke all privileges on table public.visitor_assignments
  from public, anon, authenticated, service_role;
revoke all privileges on table public.visitor_responses
  from public, anon, authenticated, service_role;
revoke all privileges on table public.analytics_events
  from public, anon, authenticated, service_role;

commit;
