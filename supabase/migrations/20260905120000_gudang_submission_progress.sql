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
    select site.id, site.station_id, site.site_type_id
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
  ), warehouse_counts as (
    select site.site_type_id,
      count(distinct site.station_id)::integer as warehouse_station_count,
      count(distinct submission.station_id) filter (where submission.id is not null)::integer as warehouse_submitted_station_count
    from site_scope as site
    left join public.submissions as submission
      on submission.station_id = site.station_id
     and submission.site_id = site.id
     and submission.archived_at is null
    where public.station_completion_is_warehouse_site_type(site.site_type_id)
    group by site.site_type_id
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
      'is_warehouse', public.station_completion_is_warehouse_site_type(site_type.id),
      'warehouse_station_count', case
        when public.station_completion_is_warehouse_site_type(site_type.id)
          then coalesce(warehouse_counts.warehouse_station_count, 0)
        else null
      end,
      'warehouse_submitted_station_count', case
        when public.station_completion_is_warehouse_site_type(site_type.id)
          then coalesce(warehouse_counts.warehouse_submitted_station_count, 0)
        else null
      end,
      'warehouse_progress_percent', case
        when public.station_completion_is_warehouse_site_type(site_type.id)
          and coalesce(warehouse_counts.warehouse_station_count, 0) > 0
          then round(warehouse_counts.warehouse_submitted_station_count * 100.0 / warehouse_counts.warehouse_station_count)::integer
        else null
      end
    ) order by site_type.name, site_type.id), '[]'::jsonb)
  ) into v_result
  from site_counts
  join public.site_types as site_type on site_type.id = site_counts.site_type_id and site_type.active
  left join category_counts on category_counts.site_type_id = site_counts.site_type_id
  left join warehouse_counts on warehouse_counts.site_type_id = site_counts.site_type_id;

  return v_result;
end;
$$;

comment on function public.admin_site_type_completion_summary() is
  'One-call Super Admin Site Type completion aggregation with informational Gudang Submission coverage by distinct Station. Returns counts only and never returns Submission payloads.';

revoke all on function public.admin_site_type_completion_summary() from public, anon;
grant execute on function public.admin_site_type_completion_summary() to authenticated;

create or replace function public.admin_completion_monitoring_summary()
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

  with detail as materialized (
    select * from public.station_completion_rows(null)
  ), station_scope as materialized (
    select station.id, station.name
    from public.stations as station
    where station.active
  ), station_site_counts as (
    select site.station_id, count(*)::integer as site_count
    from public.sites as site
    join public.site_types as site_type on site_type.id = site.site_type_id and site_type.active
    where site.active
      and exists (select 1 from station_scope as station where station.id = site.station_id)
    group by site.station_id
  ), station_aggregated as (
    select station.id as station_id,
      count(*) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id))::integer as expected_submission_count,
      count(*) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id) and detail.active_submission_count = 1)::integer as existing_submission_count,
      count(*) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id) and detail.status = 'LENGKAP')::integer as complete_submission_count,
      count(*) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id) and detail.status = 'TERISI_SEBAGIAN')::integer as partial_submission_count,
      count(*) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id) and detail.status = 'KOSONG')::integer as empty_submission_count,
      count(*) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id) and detail.status = 'BELUM_DIMULAI')::integer as not_started_count,
      count(*) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id) and detail.status = 'PERLU_PERHATIAN')::integer as expected_attention_count,
      count(*) filter (where not detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id))::integer as unexpected_submission_count,
      coalesce(sum(detail.expected_category_count) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id)), 0)::integer as expected_category_count,
      coalesce(sum(detail.filled_category_count) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id)), 0)::integer as filled_category_count,
      count(distinct detail.site_id) filter (where detail.is_expected and public.station_completion_is_warehouse_site_type(detail.site_type_id))::integer as warehouse_expected_count,
      coalesce(sum(detail.active_submission_count) filter (where public.station_completion_is_warehouse_site_type(detail.site_type_id)), 0)::integer as warehouse_existing_count,
      coalesce(sum(detail.warehouse_category_count) filter (where detail.is_expected and public.station_completion_is_warehouse_site_type(detail.site_type_id)), 0)::integer as warehouse_category_count,
      coalesce(sum(detail.warehouse_unit_count) filter (where detail.is_expected and public.station_completion_is_warehouse_site_type(detail.site_type_id)), 0)::integer as warehouse_unit_count,
      coalesce(sum(detail.pending_qc_count) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id)), 0)::integer as pending_qc_count,
      max(detail.content_last_saved_at) filter (where detail.is_expected and not public.station_completion_is_warehouse_site_type(detail.site_type_id)) as content_last_updated
    from station_scope as station
    left join detail on detail.station_id = station.id
    group by station.id
  ), station_row_issues as (
    select detail.station_id, issue.code
    from detail
    cross join lateral unnest(detail.issue_codes) as issue(code)
    where not public.station_completion_is_warehouse_site_type(detail.site_type_id)
  ), station_issues as (
    select station.id as station_id,
      array(
        select distinct code
        from (
          select row_issue.code
          from station_row_issues as row_issue
          where row_issue.station_id = station.id
          union all
          select 'station_has_no_active_site'
          where coalesce(site_count.site_count, 0) = 0
        ) as issue_union(code)
        order by code
      )::text[] as issue_codes
    from station_scope as station
    left join station_site_counts as site_count on site_count.station_id = station.id
  ), station_calculated as (
    select station.id, station.name,
      coalesce(site_count.site_count, 0)::integer as site_count,
      aggregate.*,
      issue.issue_codes,
      (aggregate.expected_attention_count + aggregate.unexpected_submission_count
        + case when coalesce(site_count.site_count, 0) = 0 then 1 else 0 end)::integer as attention_count
    from station_scope as station
    join station_aggregated as aggregate on aggregate.station_id = station.id
    join station_issues as issue on issue.station_id = station.id
    left join station_site_counts as site_count on site_count.station_id = station.id
  ), station_rows as (
    select calculated.id as station_id, calculated.name as station_name, calculated.site_count,
      calculated.expected_submission_count, calculated.existing_submission_count,
      calculated.complete_submission_count, calculated.partial_submission_count,
      calculated.empty_submission_count, calculated.not_started_count,
      calculated.expected_attention_count, calculated.unexpected_submission_count,
      calculated.attention_count, calculated.expected_category_count,
      calculated.filled_category_count,
      case when calculated.expected_category_count = 0 then null
        else round(calculated.filled_category_count * 100.0 / calculated.expected_category_count)::integer end as category_progress,
      calculated.warehouse_expected_count, calculated.warehouse_existing_count,
      calculated.warehouse_category_count, calculated.warehouse_unit_count,
      calculated.pending_qc_count, calculated.content_last_updated,
      case
        when calculated.attention_count > 0 then 'PERLU_PERHATIAN'
        when calculated.expected_submission_count = 0 then 'TIDAK_DINILAI'
        when calculated.existing_submission_count = 0 then 'BELUM_DIMULAI'
        when calculated.existing_submission_count = calculated.expected_submission_count
          and calculated.complete_submission_count = calculated.expected_submission_count then 'LENGKAP'
        else 'TERISI_SEBAGIAN'
      end as station_status,
      calculated.issue_codes
    from station_calculated as calculated
  ), site_scope as materialized (
    select site.id, site.station_id, site.site_type_id
    from public.sites as site
    join public.stations as station on station.id = site.station_id and station.active
    join public.site_types as site_type on site_type.id = site.site_type_id and site_type.active
    where site.active
  ), site_type_site_counts as (
    select site_type_id, count(distinct id)::integer as site_count
    from site_scope
    group by site_type_id
  ), site_type_category_counts as (
    select detail.site_type_id,
      coalesce(sum(detail.expected_category_count) filter (where detail.is_expected and not detail.is_warehouse), 0)::integer as expected_category_count,
      coalesce(sum(detail.filled_category_count) filter (where detail.is_expected and not detail.is_warehouse), 0)::integer as filled_category_count,
      bool_and(detail.is_warehouse) filter (where detail.is_expected) as all_warehouse
    from detail
    group by detail.site_type_id
  ), site_type_warehouse_counts as (
    select site.site_type_id,
      count(distinct site.station_id)::integer as warehouse_station_count,
      count(distinct submission.station_id) filter (where submission.id is not null)::integer as warehouse_submitted_station_count
    from site_scope as site
    left join public.submissions as submission
      on submission.station_id = site.station_id
     and submission.site_id = site.id
     and submission.archived_at is null
    where public.station_completion_is_warehouse_site_type(site.site_type_id)
    group by site.site_type_id
  ), site_type_rows as (
    select site_type.id as site_type_id, site_type.name as site_type_name,
      site_counts.site_count,
      coalesce(category_counts.expected_category_count, 0) as expected_category_count,
      coalesce(category_counts.filled_category_count, 0) as filled_category_count,
      case
        when coalesce(category_counts.all_warehouse, false)
          or coalesce(category_counts.expected_category_count, 0) = 0 then null
        else round(category_counts.filled_category_count * 100.0 / category_counts.expected_category_count)::integer
      end as category_progress,
      public.station_completion_is_warehouse_site_type(site_type.id) as is_warehouse,
      case when public.station_completion_is_warehouse_site_type(site_type.id)
        then coalesce(warehouse_counts.warehouse_station_count, 0) else null end as warehouse_station_count,
      case when public.station_completion_is_warehouse_site_type(site_type.id)
        then coalesce(warehouse_counts.warehouse_submitted_station_count, 0) else null end as warehouse_submitted_station_count,
      case
        when public.station_completion_is_warehouse_site_type(site_type.id)
          and coalesce(warehouse_counts.warehouse_station_count, 0) > 0
          then round(warehouse_counts.warehouse_submitted_station_count * 100.0 / warehouse_counts.warehouse_station_count)::integer
        else null
      end as warehouse_progress_percent
    from site_type_site_counts as site_counts
    join public.site_types as site_type on site_type.id = site_counts.site_type_id and site_type.active
    left join site_type_category_counts as category_counts on category_counts.site_type_id = site_counts.site_type_id
    left join site_type_warehouse_counts as warehouse_counts on warehouse_counts.site_type_id = site_counts.site_type_id
  )
  select jsonb_build_object(
    'station_summary', jsonb_build_object(
      'rows', coalesce((select jsonb_agg(
        (to_jsonb(summary) - 'issue_codes') || jsonb_build_object(
          'issues', coalesce((select jsonb_agg(jsonb_build_object(
            'code', issue.code,
            'label', public.station_completion_issue_label(issue.code)
          ) order by issue.code) from unnest(summary.issue_codes) as issue(code)), '[]'::jsonb)
        ) order by summary.station_name, summary.station_id
      ) from station_rows as summary), '[]'::jsonb)
    ),
    'site_type_summary', jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'site_type_id', summary.site_type_id,
        'site_type_name', summary.site_type_name,
        'site_count', summary.site_count,
        'expected_category_count', summary.expected_category_count,
        'filled_category_count', summary.filled_category_count,
        'category_progress', summary.category_progress,
        'is_warehouse', summary.is_warehouse,
        'warehouse_station_count', summary.warehouse_station_count,
        'warehouse_submitted_station_count', summary.warehouse_submitted_station_count,
        'warehouse_progress_percent', summary.warehouse_progress_percent
      ) order by summary.site_type_name, summary.site_type_id) from site_type_rows as summary), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.admin_completion_monitoring_summary() is
  'One-call Super Admin Station and Site Type completion summaries with informational Gudang Submission coverage over set-based current Submission existence.';

revoke all on function public.admin_completion_monitoring_summary() from public, anon;
grant execute on function public.admin_completion_monitoring_summary() to authenticated;
