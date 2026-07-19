begin;

truncate table
  public.analytics_events,
  public.visitor_answers,
  public.visitor_assignments,
  public.visitor_responses,
  public.share_links,
  public.self_answers,
  public.pack_plays,
  public.rate_limit_buckets;

update private.analytics_measurement_markers
set started_at = clock_timestamp()
where name = 'core_funnel_v1';

do $cutover$
begin
  if (select count(*) from private.analytics_measurement_markers
      where name = 'core_funnel_v1') <> 1 then
    raise exception 'core funnel measurement marker is missing';
  end if;
end
$cutover$;

commit;
