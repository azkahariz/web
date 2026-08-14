create or replace function public.list_station_submission_summaries()
returns table (
  site_id uuid,
  site_subtype_id uuid,
  filled_count integer,
  total_count integer,
  progress_kind text,
  warehouse_category_count integer,
  warehouse_unit_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
begin
  v_station_id := public.current_station_id();
  if v_station_id is null then
    raise exception 'Active station account is required.' using errcode = '42501';
  end if;

  return query
  select
    submission.site_id,
    submission.site_subtype_id,
    case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 0 else progress.filled_count end,
    case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 0 else progress.total_count end,
    case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 'WAREHOUSE' else 'EXPECTED' end,
    case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then warehouse.category_count else 0 end,
    case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then warehouse.unit_count else 0 end
  from public.submissions as submission
  join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
  join public.item_profiles as profile on profile.id = subtype.item_profile_id
  left join lateral public.submission_progress(submission.payload, subtype.item_profile_id) as progress on true
  left join lateral public.submission_warehouse_summary(submission.payload) as warehouse
    on profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid
  where submission.station_id = v_station_id
    and submission.archived_at is null;
end;
$$;

revoke all on function public.list_station_submission_summaries() from public, anon;
grant execute on function public.list_station_submission_summaries() to authenticated;
