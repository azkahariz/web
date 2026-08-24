create or replace function public.admin_site_type_completion_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.require_super_admin();

  with site_scope as materialized (
    select site.id, site.site_type_id
    from public.sites as site
    join public.stations as station on station.id = site.station_id and station.active
    join public.site_types as site_type on site_type.id = site.site_type_id and site_type.active
    where site.active
  ), site_counts as (
    select site_type_id, count(distinct id)::integer as site_count
    from site_scope
    group by site_type_id
  ), category_counts as (
    select detail.site_type_id,
      coalesce(sum(detail.expected_category_count) filter (where detail.is_expected and not detail.is_warehouse), 0)::integer as expected_category_count,
      coalesce(sum(detail.filled_category_count) filter (where detail.is_expected and not detail.is_warehouse), 0)::integer as filled_category_count,
      bool_and(detail.is_warehouse) filter (where detail.is_expected) as all_warehouse
    from public.station_completion_rows(null) as detail
    group by detail.site_type_id
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'site_type_id', site_type.id,
      'site_type_name', site_type.name,
      'site_count', site_counts.site_count,
      'expected_category_count', coalesce(category_counts.expected_category_count, 0),
      'filled_category_count', coalesce(category_counts.filled_category_count, 0),
      'category_progress', case
        when coalesce(category_counts.all_warehouse, false)
          or coalesce(category_counts.expected_category_count, 0) = 0 then null
        else round(category_counts.filled_category_count * 100.0 / category_counts.expected_category_count)::integer
      end,
      'is_warehouse', coalesce(category_counts.all_warehouse, false)
    ) order by site_type.name, site_type.id), '[]'::jsonb)
  ) into v_result
  from site_counts
  join public.site_types as site_type on site_type.id = site_counts.site_type_id and site_type.active
  left join category_counts on category_counts.site_type_id = site_counts.site_type_id;

  return v_result;
end;
$$;

comment on function public.admin_site_type_completion_summary() is
  'One-call Super Admin Site Type completion aggregation. Returns counts only and never returns Submission payloads.';

revoke all on function public.admin_site_type_completion_summary() from public, anon;
grant execute on function public.admin_site_type_completion_summary() to authenticated;
