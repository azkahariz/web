-- Add category context to Product usage/reference results without changing
-- product identity, reference counts, or Submission payloads.
create or replace function public.submission_product_reference_category_rows(p_payload jsonb)
returns table (
  storage_category text,
  item_id text,
  item_ordinal bigint,
  product_id uuid,
  product_proposal_id uuid,
  unit_count integer,
  category_label text
)
language sql
immutable
parallel safe
set search_path = ''
as $$
  with entries as (
    select category.key as storage_category, entry.value as item, entry.ordinality as item_ordinal
    from jsonb_each(
      case when jsonb_typeof(coalesce(p_payload, '{}'::jsonb) -> 'inventory') = 'object'
        then p_payload -> 'inventory' else '{}'::jsonb end
    ) as category(key, value)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
    ) with ordinality as entry(value, ordinality)
    where jsonb_typeof(entry.value) = 'object'
  ), identified as (
    select storage_category, item, item_ordinal,
      nullif(btrim(item ->> 'id'), '') as item_id,
      case when coalesce(item ->> 'productId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item ->> 'productId')::uuid else null end as product_id,
      case when coalesce(item ->> 'productProposalId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item ->> 'productProposalId')::uuid else null end as product_proposal_id,
      case
        when jsonb_typeof(item -> 'units') = 'array' then jsonb_array_length(item -> 'units')
        when coalesce(item ->> 'quantity', '') ~ '^[0-9]+$' then greatest((item ->> 'quantity')::integer, 1)
        else 1
      end as unit_count
    from entries
  )
  select identified.storage_category, identified.item_id, identified.item_ordinal,
    identified.product_id, identified.product_proposal_id, identified.unit_count,
    public.submission_category_canonical_label(function_category.value)
  from identified
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(identified.item -> 'functionCategories') = 'array'
        and jsonb_array_length(identified.item -> 'functionCategories') > 0
      then identified.item -> 'functionCategories'
      else jsonb_build_array(identified.storage_category)
    end
  ) as function_category(value)
$$;

create or replace function public.admin_product_usage(
  p_product_id uuid,
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 1000);
  v_search text := nullif(btrim(p_search), '');
begin
  perform public.require_super_admin();
  return (
    with reference_facts as materialized (
      select submission.id as submission_id, submission.station_id, station.name as station_name,
        submission.site_id, site.name as site_name, site_type.name as site_type_name,
        submission.site_subtype_id, subtype.name as subtype_name,
        fact.storage_category, fact.item_ordinal, fact.category_label
      from public.submissions as submission
      join public.stations as station on station.id = submission.station_id
      join public.sites as site on site.id = submission.site_id
      join public.site_types as site_type on site_type.id = site.site_type_id
      join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
      cross join lateral public.submission_product_reference_category_rows(submission.payload) as fact
      left join public.product_proposals as proposal on proposal.id = fact.product_proposal_id
      where submission.archived_at is null
        and public.resolve_canonical_product_id(coalesce(
          fact.product_id,
          case when proposal.status in ('APPROVED', 'MERGED') then proposal.resolved_product_id end
        )) = p_product_id
    ), item_references as materialized (
      select submission_id, station_id, station_name, site_id, site_name, site_type_name,
        site_subtype_id, subtype_name, storage_category, item_ordinal,
        array_agg(distinct category_label order by category_label) as categories
      from reference_facts
      group by submission_id, station_id, station_name, site_id, site_name, site_type_name,
        site_subtype_id, subtype_name, storage_category, item_ordinal
    ), location_counts as materialized (
      select station_id, station_name, site_id, site_name, site_type_name,
        site_subtype_id, subtype_name, count(*)::integer as reference_count,
        array[]::text[] as categories
      from item_references
      group by station_id, station_name, site_id, site_name, site_type_name, site_subtype_id, subtype_name
    ), location_categories as materialized (
      select station_id, site_id, site_subtype_id,
        array_agg(distinct category_label order by category_label) as categories
      from item_references
      cross join lateral unnest(categories) as category_label
      group by station_id, site_id, site_subtype_id
    ), locations as materialized (
      select counts.station_id, counts.station_name, counts.site_id, counts.site_name, counts.site_type_name,
        counts.site_subtype_id, counts.subtype_name, counts.reference_count, categories.categories
      from location_counts as counts
      join location_categories as categories using (station_id, site_id, site_subtype_id)
    ), filtered as materialized (
      select * from locations where v_search is null
        or concat_ws(' ', station_name, site_name, site_type_name, subtype_name, array_to_string(categories, ' ')) ilike '%' || v_search || '%'
    ), paged as (
      select * from filtered order by station_name, site_name, subtype_name, site_subtype_id
      limit v_page_size offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'stationId', station_id, 'stationName', station_name, 'siteId', site_id,
        'siteName', site_name, 'siteTypeName', site_type_name,
        'siteSubtypeId', site_subtype_id, 'subtypeName', subtype_name,
        'referenceCount', reference_count, 'categories', categories
      ) order by station_name, site_name, subtype_name, site_subtype_id) from paged), '[]'::jsonb),
      'totalCount', (select count(*) from filtered),
      'stationCount', (select count(distinct station_id) from filtered),
      'siteCount', (select count(distinct site_id) from filtered),
      'referenceCount', coalesce((select sum(reference_count) from filtered), 0),
      'page', v_page, 'pageSize', v_page_size
    )
  );
end;
$$;

create or replace function public.admin_product_references(
  p_product_id uuid,
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := case when p_page_size in (50, 100, 200) then p_page_size else 50 end;
  v_search text := nullif(btrim(p_search), '');
begin
  perform public.require_super_admin();
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product was not found.' using errcode = 'P0002';
  end if;

  return (
    with direct_rows as materialized (
      select
        'DIRECT'::text as reference_type,
        'direct:' || submission.id::text || ':' || coalesce(fact.item_id, fact.storage_category || ':' || fact.item_ordinal::text) as reference_id,
        submission.id as submission_id, submission.version as expected_submission_version,
        null::uuid as proposal_id, null::timestamptz as expected_proposal_updated_at,
        station.name as station_name, site.name as site_name, site_type.name as site_type_name,
        subtype.name as site_subtype_name,
        min(fact.category_label) as category_name,
        array_agg(distinct fact.category_label order by fact.category_label) as categories,
        array_agg(distinct fact.category_label order by fact.category_label) as function_categories,
        fact.item_id, max(fact.unit_count)::integer as unit_count,
        submission.archived_at,
        (submission.locked_by_session_id is not null and submission.lock_last_activity_at >= now() - interval '5 minutes') as active_lock,
        submission.lock_operator_name as lock_operator_name, null::text as qc_status,
        null::text as proposed_brand, null::text as proposed_model
      from public.submissions as submission
      join public.stations as station on station.id = submission.station_id
      join public.sites as site on site.id = submission.site_id
      join public.site_types as site_type on site_type.id = site.site_type_id
      join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
      cross join lateral public.submission_product_reference_category_rows(submission.payload) as fact
      where fact.product_id = p_product_id
        and submission.archived_at is null
      group by submission.id, submission.version, station.name, site.name, site_type.name,
        subtype.name, fact.item_id, fact.storage_category, fact.item_ordinal, submission.archived_at,
        submission.locked_by_session_id, submission.lock_last_activity_at, submission.lock_operator_name
    ), qc_base as materialized (
      select proposal.id as proposal_id, proposal.updated_at as expected_proposal_updated_at,
        proposal.status as qc_status, proposal.proposed_brand, proposal.proposed_model,
        submission.id as submission_id, submission.version as expected_submission_version,
        station.name as station_name, site.name as site_name, site_type.name as site_type_name,
        subtype.name as site_subtype_name, submission.payload,
        (submission.locked_by_session_id is not null and submission.lock_last_activity_at >= now() - interval '5 minutes') as active_lock,
        null::text as lock_operator_name
      from public.product_proposals as proposal
      join public.submissions as submission on submission.id = proposal.submission_id and submission.archived_at is null
      join public.stations as station on station.id = submission.station_id
      join public.sites as site on site.id = submission.site_id
      join public.site_types as site_type on site_type.id = site.site_type_id
      join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
      where proposal.resolved_product_id = p_product_id
        and proposal.status in ('APPROVED', 'MERGED')
    ), qc_rows as materialized (
      select
        'QC_RESULT'::text as reference_type,
        'qc:' || base.proposal_id::text as reference_id,
        base.submission_id, base.expected_submission_version,
        base.proposal_id, base.expected_proposal_updated_at,
        base.station_name, base.site_name, base.site_type_name, base.site_subtype_name,
        null::text as category_name,
        coalesce(array_agg(distinct fact.category_label order by fact.category_label) filter (where fact.category_label is not null), '{}'::text[]) as categories,
        '{}'::text[] as function_categories, null::text as item_id, 0::integer as unit_count,
        null::timestamptz as archived_at, base.active_lock, base.lock_operator_name,
        base.qc_status, base.proposed_brand, base.proposed_model
      from qc_base as base
      left join lateral public.submission_product_reference_category_rows(base.payload) as fact
        on fact.product_proposal_id = base.proposal_id
      group by base.proposal_id, base.expected_proposal_updated_at, base.submission_id, base.expected_submission_version,
        base.station_name, base.site_name, base.site_type_name, base.site_subtype_name, base.active_lock,
        base.lock_operator_name, base.qc_status, base.proposed_brand, base.proposed_model
    ), rows as materialized (
      select * from direct_rows union all select * from qc_rows
    ), filtered as materialized (
      select * from rows
      where v_search is null or concat_ws(' ', station_name, site_name, site_type_name, site_subtype_name,
        array_to_string(categories, ' '), proposed_brand, proposed_model, qc_status) ilike '%' || v_search || '%'
    ), paged as (
      select * from filtered
      order by station_name, site_name, site_subtype_name, reference_type, reference_id
      limit v_page_size offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'referenceType', reference_type, 'referenceId', reference_id,
        'submissionId', submission_id, 'expectedSubmissionVersion', expected_submission_version,
        'proposalId', proposal_id, 'expectedProposalUpdatedAt', expected_proposal_updated_at,
        'stationName', station_name, 'siteName', site_name, 'siteTypeName', site_type_name,
        'siteSubtypeName', site_subtype_name, 'categoryName', category_name,
        'categories', categories, 'functionCategories', function_categories, 'itemId', item_id, 'unitCount', unit_count,
        'archivedAt', archived_at, 'activeLock', active_lock, 'lockOwnerDisplayName', lock_operator_name,
        'qcStatus', qc_status, 'proposedBrand', proposed_brand, 'proposedModel', proposed_model
      ) order by station_name, site_name, site_subtype_name, reference_type, reference_id) from paged), '[]'::jsonb),
      'totalCount', (select count(*)::integer from filtered), 'page', v_page, 'pageSize', v_page_size
    )
  );
end;
$$;

revoke all on function public.submission_product_reference_category_rows(jsonb) from public, anon, authenticated;
revoke all on function public.admin_product_usage(uuid, integer, integer, text) from public, anon;
revoke all on function public.admin_product_references(uuid, integer, integer, text) from public, anon;
grant execute on function public.admin_product_usage(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_product_references(uuid, integer, integer, text) to authenticated;

comment on function public.submission_product_reference_category_rows(jsonb) is
  'Canonical category labels for direct Product and Product QC proposal occurrences in one Submission payload.';
comment on function public.admin_product_usage(uuid, integer, integer, text) is
  'Read-only Super Admin Product usage summary with deduplicated category context.';
comment on function public.admin_product_references(uuid, integer, integer, text) is
  'Read-only, server-paginated Product references with category context and no Submission payload returned.';
