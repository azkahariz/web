create or replace function public.station_completion_rows(p_station_id uuid default null)
returns table (
  station_id uuid,
  station_name text,
  site_id uuid,
  site_name text,
  site_type_id uuid,
  site_type_name text,
  site_subtype_id uuid,
  subtype_name text,
  profile_id uuid,
  is_expected boolean,
  is_warehouse boolean,
  active_submission_count integer,
  submission_id uuid,
  submission_version integer,
  status text,
  expected_category_count integer,
  filled_category_count integer,
  missing_categories jsonb,
  warehouse_category_count integer,
  warehouse_unit_count integer,
  pending_qc_count integer,
  content_last_saved_at timestamptz,
  issue_codes text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with expected as materialized (
    select * from public.station_completion_expected_contexts(p_station_id)
  ), submission_groups as materialized (
    select submission.station_id, submission.site_id, submission.site_subtype_id,
      count(*)::integer as active_count,
      (array_agg(submission.id order by submission.id))[1] as selected_submission_id
    from public.submissions as submission
    join public.stations as station
      on station.id = submission.station_id
     and station.active
    where submission.archived_at is null
      and (p_station_id is null or submission.station_id = p_station_id)
    group by submission.station_id, submission.site_id, submission.site_subtype_id
  ), selected_submissions as materialized (
    select submission_group.station_id, submission_group.site_id,
      submission_group.site_subtype_id, submission_group.active_count,
      submission.id, submission.version, submission.payload, submission.last_saved_at
    from submission_groups as submission_group
    join public.submissions as submission
      on submission.id = submission_group.selected_submission_id
  ), inventory_facts as materialized (
    select submission.id as submission_id,
      fact.category_label, fact.product_proposal_id, fact.recognized
    from selected_submissions as submission
    cross join lateral public.submission_inventory_facts(submission.payload) as fact
  ), inventory_summary as materialized (
    select fact.submission_id,
      coalesce(array_agg(distinct fact.category_label) filter (where fact.recognized), array[]::text[]) as recognized_category_labels,
      count(distinct proposal.id)::integer as pending_count
    from inventory_facts as fact
    left join public.product_proposals as proposal
      on proposal.id = fact.product_proposal_id
     and proposal.submission_id = fact.submission_id
     and proposal.status = 'PENDING'
    group by fact.submission_id
  ), expected_rows as (
    select context.station_id, context.station_name,
      context.site_id, context.site_name,
      context.site_type_id, context.site_type_name,
      context.site_subtype_id, context.subtype_name,
      context.profile_id,
      true as is_expected,
      context.is_warehouse,
      coalesce(submission.active_count, 0)::integer as active_submission_count,
      submission.id,
      submission.version,
      case
        when coalesce(array_length(context.issue_codes, 1), 0) > 0
          or coalesce(submission.active_count, 0) > 1 then 'PERLU_PERHATIAN'
        when coalesce(submission.active_count, 0) = 0 then 'BELUM_DIMULAI'
        when context.is_warehouse then 'GUDANG_TERSEDIA'
        when coalesce(coverage.total_count, 0) = 0 then 'PERLU_PERHATIAN'
        when coalesce(coverage.filled_count, 0) = 0 then 'KOSONG'
        when coverage.filled_count = coverage.total_count then 'LENGKAP'
        else 'TERISI_SEBAGIAN'
      end as status,
      case when context.is_warehouse then 0 else coalesce(coverage.total_count, context.expected_category_count, 0) end::integer,
      case when context.is_warehouse then 0 else coalesce(coverage.filled_count, 0) end::integer,
      case when context.is_warehouse then '[]'::jsonb else coalesce(coverage.missing_categories, '[]'::jsonb) end,
      case when context.is_warehouse and submission.active_count = 1 then coalesce(warehouse.category_count, 0) else 0 end::integer,
      case when context.is_warehouse and submission.active_count = 1 then coalesce(warehouse.unit_count, 0) else 0 end::integer,
      case when submission.active_count = 1 then coalesce(inventory.pending_count, 0) else 0 end::integer,
      case when submission.active_count = 1 then submission.last_saved_at else null end,
      context.issue_codes || case when coalesce(submission.active_count, 0) > 1
        then array['duplicate_active_submission']::text[] else array[]::text[] end
    from expected as context
    left join selected_submissions as submission
      on submission.station_id = context.station_id
     and submission.site_id = context.site_id
     and submission.site_subtype_id = context.site_subtype_id
     and context.site_subtype_id is not null
    left join inventory_summary as inventory on inventory.submission_id = submission.id
    left join lateral (
      select count(*)::integer as total_count,
        count(*) filter (where item.name = any(coalesce(inventory.recognized_category_labels, array[]::text[])))::integer as filled_count,
        coalesce(jsonb_agg(
          jsonb_build_object('id', item.id, 'label', item.name)
          order by item.name, item.id
        ) filter (where not (item.name = any(coalesce(inventory.recognized_category_labels, array[]::text[])))), '[]'::jsonb) as missing_categories
      from public.profile_items as mapping
      join public.items as item
        on item.id = mapping.item_id
       and item.active
      where mapping.item_profile_id = context.profile_id
        and mapping.active
        and context.profile_id <> '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid
        and exists (
          select 1 from public.item_profiles as profile
          where profile.id = context.profile_id and profile.active
        )
    ) as coverage on context.profile_id is not null and not context.is_warehouse
    left join lateral public.submission_warehouse_summary(coalesce(submission.payload, '{}'::jsonb)) as warehouse
      on context.is_warehouse and submission.active_count = 1
  ), unexpected_rows as (
    select station.id, station.name,
      site.id, site.name,
      site_type.id, site_type.name,
      subtype.id, subtype.name,
      profile.id,
      false as is_expected,
      false as is_warehouse,
      1::integer as active_submission_count,
      submission.id,
      submission.version,
      'PERLU_PERHATIAN'::text as status,
      0::integer as expected_category_count,
      0::integer as filled_category_count,
      '[]'::jsonb as missing_categories,
      0::integer as warehouse_category_count,
      0::integer as warehouse_unit_count,
      0::integer as pending_qc_count,
      submission.last_saved_at,
      array['unexpected_active_submission']::text[] as issue_codes
    from public.submissions as submission
    join public.stations as station on station.id = submission.station_id and station.active
    left join public.sites as site on site.id = submission.site_id
    left join public.site_types as site_type on site_type.id = site.site_type_id
    left join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
    left join public.item_profiles as profile on profile.id = subtype.item_profile_id
    where submission.archived_at is null
      and (p_station_id is null or submission.station_id = p_station_id)
      and not exists (
      select 1 from expected as context
      where context.station_id = submission.station_id
        and context.site_id = submission.site_id
        and context.site_subtype_id = submission.site_subtype_id
    )
  )
  select * from expected_rows
  union all
  select * from unexpected_rows
$$;

comment on function public.station_completion_rows(uuid) is
  'Canonical completion rows with one inventory expansion per selected active Submission. Archived Submissions never fulfill current expected contexts.';

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
    select site.id, site.site_type_id
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
      coalesce(category_counts.all_warehouse, false) as is_warehouse
    from site_type_site_counts as site_counts
    join public.site_types as site_type on site_type.id = site_counts.site_type_id and site_type.active
    left join site_type_category_counts as category_counts on category_counts.site_type_id = site_counts.site_type_id
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
        'is_warehouse', summary.is_warehouse
      ) order by summary.site_type_name, summary.site_type_id) from site_type_rows as summary), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.admin_completion_monitoring_summary() is
  'One-call Super Admin Station and Site Type completion summaries over one materialized canonical detail calculation.';

revoke all on function public.station_completion_rows(uuid) from public, anon, authenticated;
revoke all on function public.admin_completion_monitoring_summary() from public, anon;
grant execute on function public.admin_completion_monitoring_summary() to authenticated;
