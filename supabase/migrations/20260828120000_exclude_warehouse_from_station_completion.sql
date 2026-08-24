create or replace function public.station_completion_is_warehouse_site_type(p_site_type_id uuid)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_site_type_id = 'da5d00b1-cd15-4b1d-8087-1057eb31c7d8'::uuid
$$;

comment on function public.station_completion_is_warehouse_site_type(uuid) is
  'Canonical Station completion scope predicate. Gudang is informational inventory and is never assessed for completeness.';

create or replace function public.station_completion_summary_rows(p_station_id uuid default null)
returns table (
  station_id uuid,
  station_name text,
  site_count integer,
  expected_submission_count integer,
  existing_submission_count integer,
  complete_submission_count integer,
  partial_submission_count integer,
  empty_submission_count integer,
  not_started_count integer,
  expected_attention_count integer,
  unexpected_submission_count integer,
  attention_count integer,
  expected_category_count integer,
  filled_category_count integer,
  category_progress integer,
  warehouse_expected_count integer,
  warehouse_existing_count integer,
  warehouse_category_count integer,
  warehouse_unit_count integer,
  pending_qc_count integer,
  content_last_updated timestamptz,
  station_status text,
  issue_codes text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with station_scope as materialized (
    select station.id, station.name
    from public.stations as station
    where station.active
      and (p_station_id is null or station.id = p_station_id)
  ), site_counts as (
    select site.station_id, count(*)::integer as site_count
    from public.sites as site
    join public.site_types as site_type on site_type.id = site.site_type_id and site_type.active
    where site.active
      and exists (select 1 from station_scope as station where station.id = site.station_id)
    group by site.station_id
  ), detail as materialized (
    select * from public.station_completion_rows(p_station_id)
  ), aggregated as (
    select station.id as station_id,
      count(*) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
      )::integer as expected_submission_count,
      count(*) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
          and detail.active_submission_count = 1
      )::integer as existing_submission_count,
      count(*) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
          and detail.status = 'LENGKAP'
      )::integer as complete_submission_count,
      count(*) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
          and detail.status = 'TERISI_SEBAGIAN'
      )::integer as partial_submission_count,
      count(*) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
          and detail.status = 'KOSONG'
      )::integer as empty_submission_count,
      count(*) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
          and detail.status = 'BELUM_DIMULAI'
      )::integer as not_started_count,
      count(*) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
          and detail.status = 'PERLU_PERHATIAN'
      )::integer as expected_attention_count,
      count(*) filter (
        where not detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
      )::integer as unexpected_submission_count,
      coalesce(sum(detail.expected_category_count) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
      ), 0)::integer as expected_category_count,
      coalesce(sum(detail.filled_category_count) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
      ), 0)::integer as filled_category_count,
      count(distinct detail.site_id) filter (
        where detail.is_expected
          and public.station_completion_is_warehouse_site_type(detail.site_type_id)
      )::integer as warehouse_expected_count,
      coalesce(sum(detail.active_submission_count) filter (
        where public.station_completion_is_warehouse_site_type(detail.site_type_id)
      ), 0)::integer as warehouse_existing_count,
      coalesce(sum(detail.warehouse_category_count) filter (
        where detail.is_expected
          and public.station_completion_is_warehouse_site_type(detail.site_type_id)
      ), 0)::integer as warehouse_category_count,
      coalesce(sum(detail.warehouse_unit_count) filter (
        where detail.is_expected
          and public.station_completion_is_warehouse_site_type(detail.site_type_id)
      ), 0)::integer as warehouse_unit_count,
      coalesce(sum(detail.pending_qc_count) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
      ), 0)::integer as pending_qc_count,
      max(detail.content_last_saved_at) filter (
        where detail.is_expected
          and not public.station_completion_is_warehouse_site_type(detail.site_type_id)
      ) as content_last_updated
    from station_scope as station
    left join detail on detail.station_id = station.id
    group by station.id
  ), row_issues as (
    select detail.station_id, issue.code
    from detail
    cross join lateral unnest(detail.issue_codes) as issue(code)
    where not public.station_completion_is_warehouse_site_type(detail.site_type_id)
  ), issues as (
    select station.id as station_id,
      array(
        select distinct code
        from (
          select row_issue.code
          from row_issues as row_issue
          where row_issue.station_id = station.id
          union all
          select 'station_has_no_active_site'
          where coalesce(site_count.site_count, 0) = 0
        ) as issue_union(code)
        order by code
      )::text[] as issue_codes
    from station_scope as station
    left join site_counts as site_count on site_count.station_id = station.id
  ), calculated as (
    select station.id, station.name,
      coalesce(site_count.site_count, 0)::integer as site_count,
      aggregate.*,
      issue.issue_codes,
      (
        aggregate.expected_attention_count
        + aggregate.unexpected_submission_count
        + case when coalesce(site_count.site_count, 0) = 0 then 1 else 0 end
      )::integer as attention_count
    from station_scope as station
    join aggregated as aggregate on aggregate.station_id = station.id
    join issues as issue on issue.station_id = station.id
    left join site_counts as site_count on site_count.station_id = station.id
  )
  select calculated.id, calculated.name, calculated.site_count,
    calculated.expected_submission_count,
    calculated.existing_submission_count,
    calculated.complete_submission_count,
    calculated.partial_submission_count,
    calculated.empty_submission_count,
    calculated.not_started_count,
    calculated.expected_attention_count,
    calculated.unexpected_submission_count,
    calculated.attention_count,
    calculated.expected_category_count,
    calculated.filled_category_count,
    case when calculated.expected_category_count = 0 then null
      else round(calculated.filled_category_count * 100.0 / calculated.expected_category_count)::integer end,
    calculated.warehouse_expected_count,
    calculated.warehouse_existing_count,
    calculated.warehouse_category_count,
    calculated.warehouse_unit_count,
    calculated.pending_qc_count,
    calculated.content_last_updated,
    case
      when calculated.attention_count > 0 then 'PERLU_PERHATIAN'
      when calculated.expected_submission_count = 0 then 'TIDAK_DINILAI'
      when calculated.existing_submission_count = 0 then 'BELUM_DIMULAI'
      when calculated.existing_submission_count = calculated.expected_submission_count
        and calculated.complete_submission_count = calculated.expected_submission_count
        then 'LENGKAP'
      else 'TERISI_SEBAGIAN'
    end,
    calculated.issue_codes
  from calculated
$$;

comment on function public.station_completion_summary_rows(uuid) is
  'Canonical Station aggregation over assessed non-Gudang Site/Subtype pairs. Gudang inventory is informational only and never changes completeness.';

create or replace function public.admin_station_completion_detail(p_station_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_summary record;
  v_rows jsonb;
begin
  perform public.require_super_admin();

  if p_station_id is null then
    raise exception 'station_id is required.' using errcode = '22023';
  end if;

  select * into v_summary
  from public.station_completion_summary_rows(p_station_id)
  limit 1;

  if v_summary.station_id is null then
    raise exception 'Active Station does not exist.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'site_id', detail.site_id,
    'site_name', detail.site_name,
    'site_type_id', detail.site_type_id,
    'site_type_name', detail.site_type_name,
    'site_subtype_id', detail.site_subtype_id,
    'subtype_name', detail.subtype_name,
    'profile_id', detail.profile_id,
    'is_expected', detail.is_expected,
    'is_warehouse', false,
    'active_submission_count', detail.active_submission_count,
    'submission_id', detail.submission_id,
    'submission_version', detail.submission_version,
    'status', detail.status,
    'expected_category_count', detail.expected_category_count,
    'filled_category_count', detail.filled_category_count,
    'missing_categories', detail.missing_categories,
    'warehouse_category_count', 0,
    'warehouse_unit_count', 0,
    'pending_qc_count', detail.pending_qc_count,
    'content_last_saved_at', detail.content_last_saved_at,
    'issues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', issue.code,
        'label', public.station_completion_issue_label(issue.code)
      ) order by issue.code)
      from unnest(detail.issue_codes) as issue(code)
    ), '[]'::jsonb)
  ) order by detail.site_name nulls last, detail.subtype_name nulls last, detail.submission_id), '[]'::jsonb)
  into v_rows
  from public.station_completion_rows(p_station_id) as detail
  where not public.station_completion_is_warehouse_site_type(detail.site_type_id);

  return jsonb_build_object(
    'station_id', v_summary.station_id,
    'station_name', v_summary.station_name,
    'summary', (to_jsonb(v_summary) - 'issue_codes') || jsonb_build_object(
      'issues', coalesce((
        select jsonb_agg(jsonb_build_object(
          'code', issue.code,
          'label', public.station_completion_issue_label(issue.code)
        ) order by issue.code)
        from unnest(v_summary.issue_codes) as issue(code)
      ), '[]'::jsonb)
    ),
    'rows', v_rows
  );
end;
$$;

comment on function public.admin_station_completion_detail(uuid) is
  'Lazy Super Admin detail for assessed non-Gudang Site/Subtype pairs. Gudang inventory remains available as informational summary fields only.';

revoke all on function public.station_completion_is_warehouse_site_type(uuid) from public, anon, authenticated;
revoke all on function public.station_completion_summary_rows(uuid) from public, anon, authenticated;
revoke all on function public.admin_station_completion_detail(uuid) from public, anon;

grant execute on function public.admin_station_completion_detail(uuid) to authenticated;
