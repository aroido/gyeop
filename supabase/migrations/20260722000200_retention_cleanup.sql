begin;

alter table public.visitor_responses
  drop constraint visitor_responses_state_check;

alter table public.visitor_responses
  add constraint visitor_responses_state_check check (
    (
      status = 'draft'
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
      and session_expires_at >= created_at + interval '24 hours'
      and management_token_hash is null
      and submitted_at is null
      and withdrawn_at is null
    )
    or (
      status = 'submitted'
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
      and session_expires_at is not null
      and created_at is not null
      and management_token_hash is not null
      and octet_length(management_token_hash) = 32
      and submitted_at is not null
      and session_expires_at = submitted_at + interval '24 hours'
      and withdrawn_at is null
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

grant gyeop_internal_rpc to postgres;
grant create on schema public to gyeop_internal_rpc;
grant create on schema private to gyeop_internal_rpc;

grant delete on table
  public.anonymous_owners,
  public.visitor_responses,
  public.rate_limit_buckets,
  public.analytics_events
to gyeop_internal_rpc;

grant select (id, occurred_at)
  on table public.analytics_events
  to gyeop_internal_rpc;

create policy anonymous_owners_internal_delete
  on public.anonymous_owners
  for delete
  to gyeop_internal_rpc
  using (true);

create policy visitor_responses_internal_delete
  on public.visitor_responses
  for delete
  to gyeop_internal_rpc
  using (true);

create policy analytics_retention_internal_delete
  on public.analytics_events
  for delete
  to gyeop_internal_rpc
  using (true);

create or replace function private.extend_draft_visitor_session_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
begin
  if tg_op = 'UPDATE' and old.choice = new.choice then
    return new;
  end if;

  update public.visitor_responses as response
  set session_expires_at = v_now + interval '24 hours'
  where response.id = new.response_id
    and response.status = 'draft'
    and response.session_expires_at > v_now;

  return new;
end
$function$;

revoke execute on function private.extend_draft_visitor_session_expiry()
  from public, anon, authenticated, service_role;
alter function private.extend_draft_visitor_session_expiry()
  owner to gyeop_internal_rpc;

create trigger visitor_answer_session_expiry_touch
after insert or update of choice on public.visitor_answers
for each row execute function private.extend_draft_visitor_session_expiry();

create or replace function private.set_submitted_visitor_session_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status = 'draft' and new.status = 'submitted' then
    if new.submitted_at is null then
      raise exception using errcode = '22023', message = 'submitted response requires submitted_at';
    end if;

    new.session_expires_at := new.submitted_at + interval '24 hours';
  end if;

  return new;
end
$function$;

revoke execute on function private.set_submitted_visitor_session_expiry()
  from public, anon, authenticated, service_role;
alter function private.set_submitted_visitor_session_expiry()
  owner to gyeop_internal_rpc;

create trigger visitor_response_submit_session_expiry
before update of status on public.visitor_responses
for each row execute function private.set_submitted_visitor_session_expiry();

create or replace function private.run_local_retention_cleanup(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_chunk integer := 100;
  v_anonymous_owner_trees jsonb;
  v_visitor_drafts jsonb;
  v_submitted_sessions jsonb;
  v_rate_limit_buckets jsonb;
  v_analytics_events jsonb;
  v_anonymous_deleted integer;
  v_drafts_deleted integer;
  v_submitted_updated integer;
  v_buckets_deleted integer;
  v_analytics_deleted integer;
begin
  if p_now is null then
    raise exception using errcode = '22023', message = 'invalid cleanup time';
  end if;

  begin
  delete from public.anonymous_owners as owner
  where owner.id in (
    select candidate.id
    from public.anonymous_owners as candidate
    where candidate.management_expires_at <= p_now
      and not exists (
        select 1
        from public.pack_plays as play
        where play.anonymous_owner_id = candidate.id
          and play.owner_id is not null
      )
    order by candidate.management_expires_at, candidate.id
    limit v_chunk
  );
  get diagnostics v_anonymous_deleted = row_count;
  v_anonymous_owner_trees := jsonb_build_object(
    'outcome', 'ok',
    'deleted_count', v_anonymous_deleted,
    'remaining_count', (
      select count(*)
      from public.anonymous_owners as owner
      where owner.management_expires_at <= p_now
        and not exists (
          select 1
          from public.pack_plays as play
          where play.anonymous_owner_id = owner.id
            and play.owner_id is not null
        )
    ),
    'oldest_due_at', (
      select min(owner.management_expires_at)
      from public.anonymous_owners as owner
      where owner.management_expires_at <= p_now
        and not exists (
          select 1
          from public.pack_plays as play
          where play.anonymous_owner_id = owner.id
            and play.owner_id is not null
        )
    )
  );
  exception when others then
    v_anonymous_owner_trees := jsonb_build_object(
      'outcome', 'error',
      'error_code', 'category_failed',
      'deleted_count', 0,
      'remaining_count', null,
      'oldest_due_at', null
    );
  end;

  begin
  delete from public.visitor_responses as response
  where response.id in (
    select candidate.id
    from public.visitor_responses as candidate
    where candidate.status = 'draft'
      and candidate.session_expires_at <= p_now
    order by candidate.session_expires_at, candidate.id
    limit v_chunk
  );
  get diagnostics v_drafts_deleted = row_count;
  v_visitor_drafts := jsonb_build_object(
    'outcome', 'ok',
    'deleted_count', v_drafts_deleted,
    'remaining_count', (
      select count(*)
      from public.visitor_responses as response
      where response.status = 'draft'
        and response.session_expires_at <= p_now
    ),
    'oldest_due_at', (
      select min(response.session_expires_at)
      from public.visitor_responses as response
      where response.status = 'draft'
        and response.session_expires_at <= p_now
    )
  );
  exception when others then
    v_visitor_drafts := jsonb_build_object(
      'outcome', 'error',
      'error_code', 'category_failed',
      'deleted_count', 0,
      'remaining_count', null,
      'oldest_due_at', null
    );
  end;

  begin
  update public.visitor_responses as response
  set session_token_hash = null
  where response.id in (
    select candidate.id
    from public.visitor_responses as candidate
    where candidate.status = 'submitted'
      and candidate.session_token_hash is not null
      and candidate.session_expires_at <= p_now
    order by candidate.session_expires_at, candidate.id
    limit v_chunk
  );
  get diagnostics v_submitted_updated = row_count;
  v_submitted_sessions := jsonb_build_object(
    'outcome', 'ok',
    'updated_count', v_submitted_updated,
    'remaining_count', (
      select count(*)
      from public.visitor_responses as response
      where response.status = 'submitted'
        and response.session_token_hash is not null
        and response.session_expires_at <= p_now
    ),
    'oldest_due_at', (
      select min(response.session_expires_at)
      from public.visitor_responses as response
      where response.status = 'submitted'
        and response.session_token_hash is not null
        and response.session_expires_at <= p_now
    )
  );
  exception when others then
    v_submitted_sessions := jsonb_build_object(
      'outcome', 'error',
      'error_code', 'category_failed',
      'updated_count', 0,
      'remaining_count', null,
      'oldest_due_at', null
    );
  end;

  begin
  delete from public.rate_limit_buckets as bucket
  where (bucket.key_hash, bucket.action, bucket.window_start) in (
    select candidate.key_hash, candidate.action, candidate.window_start
    from public.rate_limit_buckets as candidate
    where candidate.expires_at + interval '24 hours' <= p_now
    order by
      candidate.expires_at,
      candidate.action,
      candidate.window_start,
      candidate.key_hash
    limit v_chunk
  );
  get diagnostics v_buckets_deleted = row_count;
  v_rate_limit_buckets := jsonb_build_object(
    'outcome', 'ok',
    'deleted_count', v_buckets_deleted,
    'remaining_count', (
      select count(*)
      from public.rate_limit_buckets as bucket
      where bucket.expires_at + interval '24 hours' <= p_now
    ),
    'oldest_due_at', (
      select min(bucket.expires_at + interval '24 hours')
      from public.rate_limit_buckets as bucket
      where bucket.expires_at + interval '24 hours' <= p_now
    )
  );
  exception when others then
    v_rate_limit_buckets := jsonb_build_object(
      'outcome', 'error',
      'error_code', 'category_failed',
      'deleted_count', 0,
      'remaining_count', null,
      'oldest_due_at', null
    );
  end;

  begin
  delete from public.analytics_events as event
  where event.id in (
    select candidate.id
    from public.analytics_events as candidate
    where candidate.occurred_at + interval '30 days' <= p_now
    order by candidate.occurred_at, candidate.id
    limit v_chunk
  );
  get diagnostics v_analytics_deleted = row_count;
  v_analytics_events := jsonb_build_object(
    'outcome', 'ok',
    'deleted_count', v_analytics_deleted,
    'remaining_count', (
      select count(*)
      from public.analytics_events as event
      where event.occurred_at + interval '30 days' <= p_now
    ),
    'oldest_due_at', (
      select min(event.occurred_at + interval '30 days')
      from public.analytics_events as event
      where event.occurred_at + interval '30 days' <= p_now
    )
  );
  exception when others then
    v_analytics_events := jsonb_build_object(
      'outcome', 'error',
      'error_code', 'category_failed',
      'deleted_count', 0,
      'remaining_count', null,
      'oldest_due_at', null
    );
  end;

  return jsonb_build_object(
    'outcome', 'ok',
    'anonymous_owner_trees', v_anonymous_owner_trees,
    'visitor_drafts', v_visitor_drafts,
    'submitted_sessions', v_submitted_sessions,
    'rate_limit_buckets', v_rate_limit_buckets,
    'analytics_events', v_analytics_events
  );
end
$function$;

revoke execute on function private.run_local_retention_cleanup(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function private.run_local_retention_cleanup(timestamptz)
  to gyeop_internal_rpc;
alter function private.run_local_retention_cleanup(timestamptz)
  owner to gyeop_internal_rpc;

create or replace function public.run_local_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not pg_try_advisory_xact_lock(
    hashtextextended('public.run_local_retention_cleanup', 0)
  ) then
    return jsonb_build_object(
      'outcome', 'busy',
      'anonymous_owner_trees', jsonb_build_object(
        'outcome', 'busy',
        'deleted_count', 0,
        'remaining_count', null,
        'oldest_due_at', null
      ),
      'visitor_drafts', jsonb_build_object(
        'outcome', 'busy',
        'deleted_count', 0,
        'remaining_count', null,
        'oldest_due_at', null
      ),
      'submitted_sessions', jsonb_build_object(
        'outcome', 'busy',
        'updated_count', 0,
        'remaining_count', null,
        'oldest_due_at', null
      ),
      'rate_limit_buckets', jsonb_build_object(
        'outcome', 'busy',
        'deleted_count', 0,
        'remaining_count', null,
        'oldest_due_at', null
      ),
      'analytics_events', jsonb_build_object(
        'outcome', 'busy',
        'deleted_count', 0,
        'remaining_count', null,
        'oldest_due_at', null
      )
    );
  end if;

  return private.run_local_retention_cleanup(clock_timestamp());
end
$function$;

alter function public.run_local_retention_cleanup()
  owner to gyeop_internal_rpc;
revoke execute on function public.run_local_retention_cleanup()
  from public, anon, authenticated;
grant execute on function public.run_local_retention_cleanup()
  to service_role;

revoke create on schema public from gyeop_internal_rpc;
revoke create on schema private from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
