create or replace function public.submission_inventory_facts(p_payload jsonb)
returns table (
  category_label text,
  product_proposal_id uuid,
  recognized boolean
)
language sql
immutable
parallel safe
set search_path = ''
as $$
  with entries as (
    select category.key as storage_category, entry.value as item
    from jsonb_each(
      case when jsonb_typeof(coalesce(p_payload, '{}'::jsonb) -> 'inventory') = 'object'
        then p_payload -> 'inventory' else '{}'::jsonb end
    ) as category(key, value)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
    ) as entry(value)
    where jsonb_typeof(entry.value) = 'object'
  ), normalized as (
    select storage_category, item,
      (
        (item ->> 'itemKind' = 'material' and nullif(btrim(item ->> 'material'), '') is not null)
        or (coalesce(item ->> 'itemKind', 'product') <> 'material'
          and nullif(btrim(item ->> 'brand'), '') is not null
          and nullif(btrim(item ->> 'model'), '') is not null)
      ) as recognized,
      case when coalesce(item ->> 'productProposalId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item ->> 'productProposalId')::uuid else null end as product_proposal_id
    from entries
  )
  select function_category.name, normalized.product_proposal_id, normalized.recognized
  from normalized
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(normalized.item -> 'functionCategories') = 'array'
        and jsonb_array_length(normalized.item -> 'functionCategories') > 0
        then normalized.item -> 'functionCategories'
      else jsonb_build_array(normalized.storage_category)
    end
  ) as function_category(name)
$$;

comment on function public.submission_inventory_facts(jsonb) is
  'Canonical inventory facts for category coverage and current Product proposal references. Metadata and optional Unit fields are excluded.';

create or replace function public.submission_item_is_filled(
  p_payload jsonb,
  p_item_name text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select exists (
    select 1
    from public.submission_inventory_facts(p_payload) as fact
    where fact.recognized
      and fact.category_label = p_item_name
  )
$$;

create or replace function public.submission_category_coverage(
  p_payload jsonb,
  p_item_profile_id uuid
)
returns table (
  category_id uuid,
  category_label text,
  filled boolean
)
language sql
stable
set search_path = ''
as $$
  with covered as materialized (
    select distinct fact.category_label
    from public.submission_inventory_facts(p_payload) as fact
    where fact.recognized
  )
  select item.id, item.name, covered.category_label is not null
  from public.item_profiles as profile
  join public.profile_items as mapping
    on mapping.item_profile_id = profile.id
   and mapping.active
  join public.items as item
    on item.id = mapping.item_id
   and item.active
  left join covered on covered.category_label = item.name
  where profile.id = p_item_profile_id
    and profile.active
    and profile.id <> '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid
  order by item.name, item.id
$$;

comment on function public.submission_category_coverage(jsonb, uuid) is
  'Expected non-Warehouse category coverage keyed by authoritative items.id and using canonical inventory recognition facts.';

create or replace function public.submission_progress(
  p_payload jsonb,
  p_item_profile_id uuid
)
returns table (filled_count integer, total_count integer)
language sql
stable
set search_path = ''
as $$
  select count(*) filter (where coverage.filled)::integer, count(*)::integer
  from public.submission_category_coverage(p_payload, p_item_profile_id) as coverage
$$;

comment on function public.submission_progress(jsonb, uuid) is
  'Canonical existing Submission progress, now delegated to UUID-backed category coverage without changing recognition semantics.';

create or replace function public.station_completion_issue_label(p_code text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_code
    when 'station_has_no_active_site' then 'Belum Ada Konfigurasi'
    when 'site_has_no_expected_subtype' then 'Site tidak memiliki Subtipe aktif yang valid'
    when 'subtype_has_no_profile' then 'Subtipe tidak memiliki profil kategori'
    when 'profile_is_inactive' then 'Profil kategori tidak aktif'
    when 'profile_has_no_expected_category' then 'Profil non-Gudang tidak memiliki kategori expected'
    when 'duplicate_active_submission' then 'Terdapat lebih dari satu Submission aktif untuk pengisian yang sama'
    when 'unexpected_active_submission' then 'Submission aktif tidak termasuk konfigurasi current expected'
    else p_code
  end
$$;

create or replace function public.station_completion_expected_contexts(p_station_id uuid default null)
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
  is_warehouse boolean,
  expected_category_count integer,
  issue_codes text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select station.id, station.name,
    site.id, site.name,
    site_type.id, site_type.name,
    subtype.id, subtype.name,
    profile.id,
    coalesce(
      site_type.id = 'da5d00b1-cd15-4b1d-8087-1057eb31c7d8'::uuid
      and subtype.id = '346cfc56-437c-4c5d-9c6b-c9f75926a31c'::uuid
      and profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid,
      false
    ) as is_warehouse,
    coalesce(category_summary.category_count, 0)::integer,
    array_remove(array[
      case when subtype.id is null then 'site_has_no_expected_subtype' end,
      case when subtype.id is not null and subtype.item_profile_id is null then 'subtype_has_no_profile' end,
      case when subtype.item_profile_id is not null and (profile.id is null or not profile.active) then 'profile_is_inactive' end,
      case when profile.active
        and profile.id <> '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid
        and coalesce(category_summary.category_count, 0) = 0
        then 'profile_has_no_expected_category' end
    ], null)::text[] as issue_codes
  from public.stations as station
  join public.sites as site
    on site.station_id = station.id
   and site.active
  join public.site_types as site_type
    on site_type.id = site.site_type_id
   and site_type.active
  left join lateral (
    select candidate.id, candidate.name, candidate.item_profile_id
    from public.site_subtypes as candidate
    where candidate.site_type_id = site_type.id
      and candidate.active
      and (
        not site_type.requires_site_subtype_assignment
        or exists (
          select 1
          from public.site_subtype_assignments as assignment
          where assignment.site_id = site.id
            and assignment.site_subtype_id = candidate.id
            and assignment.site_type_id = site_type.id
            and assignment.active
        )
      )
    order by candidate.name, candidate.id
  ) as subtype on true
  left join public.item_profiles as profile on profile.id = subtype.item_profile_id
  left join lateral (
    select count(*)::integer as category_count
    from public.profile_items as mapping
    join public.items as item on item.id = mapping.item_id and item.active
    where mapping.item_profile_id = profile.id
      and mapping.active
      and profile.active
      and profile.id <> '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid
  ) as category_summary on true
  where station.active
    and (p_station_id is null or station.id = p_station_id)
$$;

comment on function public.station_completion_expected_contexts(uuid) is
  'Current expected Site/Subtype contexts. Assignment-required Site Types use site_subtype_assignments; other active types use active type-wide Subtypes.';

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
      case when submission.active_count = 1 then coalesce(qc.pending_count, 0) else 0 end::integer,
      case when submission.active_count = 1 then submission.last_saved_at else null end,
      context.issue_codes || case when coalesce(submission.active_count, 0) > 1
        then array['duplicate_active_submission']::text[] else array[]::text[] end
    from expected as context
    left join lateral (
      select count(*)::integer as active_count,
        (array_agg(current_submission.id order by current_submission.id))[1] as id,
        (array_agg(current_submission.version order by current_submission.id))[1] as version,
        (array_agg(current_submission.payload order by current_submission.id))[1] as payload,
        (array_agg(current_submission.last_saved_at order by current_submission.id))[1] as last_saved_at
      from public.submissions as current_submission
      where current_submission.station_id = context.station_id
        and current_submission.site_id = context.site_id
        and current_submission.site_subtype_id = context.site_subtype_id
        and current_submission.archived_at is null
    ) as submission on context.site_subtype_id is not null
    left join lateral (
      select count(*)::integer as total_count,
        count(*) filter (where category.filled)::integer as filled_count,
        coalesce(jsonb_agg(
          jsonb_build_object('id', category.category_id, 'label', category.category_label)
          order by category.category_label, category.category_id
        ) filter (where not category.filled), '[]'::jsonb) as missing_categories
      from public.submission_category_coverage(coalesce(submission.payload, '{}'::jsonb), context.profile_id) as category
    ) as coverage on context.profile_id is not null and not context.is_warehouse
    left join lateral public.submission_warehouse_summary(coalesce(submission.payload, '{}'::jsonb)) as warehouse
      on context.is_warehouse and submission.active_count = 1
    left join lateral (
      select count(distinct proposal.id)::integer as pending_count
      from public.submission_inventory_facts(coalesce(submission.payload, '{}'::jsonb)) as fact
      join public.product_proposals as proposal
        on proposal.id = fact.product_proposal_id
       and proposal.submission_id = submission.id
       and proposal.status = 'PENDING'
    ) as qc on submission.active_count = 1
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
      and (p_station_id is null or station.id = p_station_id)
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
  'Canonical expected and unexpected completion rows. Archived Submissions never fulfill current expected contexts.';

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
      count(*) filter (where detail.is_expected)::integer as expected_submission_count,
      count(*) filter (where detail.is_expected and detail.active_submission_count = 1)::integer as existing_submission_count,
      count(*) filter (where detail.is_expected and detail.status = 'LENGKAP')::integer as complete_submission_count,
      count(*) filter (where detail.is_expected and detail.status = 'TERISI_SEBAGIAN')::integer as partial_submission_count,
      count(*) filter (where detail.is_expected and detail.status = 'KOSONG')::integer as empty_submission_count,
      count(*) filter (where detail.is_expected and detail.status = 'BELUM_DIMULAI')::integer as not_started_count,
      count(*) filter (where detail.is_expected and detail.status = 'PERLU_PERHATIAN')::integer as expected_attention_count,
      count(*) filter (where not detail.is_expected)::integer as unexpected_submission_count,
      coalesce(sum(detail.expected_category_count) filter (where detail.is_expected and not detail.is_warehouse), 0)::integer as expected_category_count,
      coalesce(sum(detail.filled_category_count) filter (where detail.is_expected and not detail.is_warehouse), 0)::integer as filled_category_count,
      count(*) filter (where detail.is_expected and detail.is_warehouse)::integer as warehouse_expected_count,
      count(*) filter (where detail.is_expected and detail.status = 'GUDANG_TERSEDIA')::integer as warehouse_existing_count,
      coalesce(sum(detail.warehouse_category_count) filter (where detail.is_expected and detail.is_warehouse), 0)::integer as warehouse_category_count,
      coalesce(sum(detail.warehouse_unit_count) filter (where detail.is_expected and detail.is_warehouse), 0)::integer as warehouse_unit_count,
      coalesce(sum(detail.pending_qc_count) filter (where detail.is_expected), 0)::integer as pending_qc_count,
      max(detail.content_last_saved_at) filter (where detail.is_expected) as content_last_updated
    from station_scope as station
    left join detail on detail.station_id = station.id
    group by station.id
  ), row_issues as (
    select detail.station_id, issue.code
    from detail
    cross join lateral unnest(detail.issue_codes) as issue(code)
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
      when calculated.attention_count > 0 or calculated.expected_submission_count = 0 then 'PERLU_PERHATIAN'
      when calculated.existing_submission_count = 0 then 'BELUM_DIMULAI'
      when calculated.existing_submission_count = calculated.expected_submission_count
        and calculated.complete_submission_count + calculated.warehouse_existing_count = calculated.expected_submission_count
        then 'LENGKAP'
      else 'TERISI_SEBAGIAN'
    end,
    calculated.issue_codes
  from calculated
$$;

comment on function public.station_completion_summary_rows(uuid) is
  'Canonical Station aggregation. Missing Submission categories remain in the non-Warehouse denominator; Warehouse completion is structural only.';

create or replace function public.admin_station_completion_summary()
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

  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(
      (to_jsonb(summary) - 'issue_codes') || jsonb_build_object(
        'issues', coalesce((
          select jsonb_agg(jsonb_build_object(
            'code', issue.code,
            'label', public.station_completion_issue_label(issue.code)
          ) order by issue.code)
          from unnest(summary.issue_codes) as issue(code)
        ), '[]'::jsonb)
      )
      order by summary.station_name, summary.station_id
    ), '[]'::jsonb)
  ) into v_result
  from public.station_completion_summary_rows() as summary;

  return v_result;
end;
$$;

comment on function public.admin_station_completion_summary() is
  'One-call Super Admin Station completion summary. Returns aggregate counts only and never returns Submission payloads.';

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
    'is_warehouse', detail.is_warehouse,
    'active_submission_count', detail.active_submission_count,
    'submission_id', detail.submission_id,
    'submission_version', detail.submission_version,
    'status', detail.status,
    'expected_category_count', detail.expected_category_count,
    'filled_category_count', detail.filled_category_count,
    'missing_categories', detail.missing_categories,
    'warehouse_category_count', detail.warehouse_category_count,
    'warehouse_unit_count', detail.warehouse_unit_count,
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
  from public.station_completion_rows(p_station_id) as detail;

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
  'Lazy Super Admin detail for one active Station, including UUID-backed missing categories and structural issues without metadata.';

revoke all on function public.submission_inventory_facts(jsonb) from public, anon, authenticated;
revoke all on function public.submission_category_coverage(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.station_completion_issue_label(text) from public, anon, authenticated;
revoke all on function public.station_completion_expected_contexts(uuid) from public, anon, authenticated;
revoke all on function public.station_completion_rows(uuid) from public, anon, authenticated;
revoke all on function public.station_completion_summary_rows(uuid) from public, anon, authenticated;
revoke all on function public.admin_station_completion_summary() from public, anon;
revoke all on function public.admin_station_completion_detail(uuid) from public, anon;

grant execute on function public.admin_station_completion_summary() to authenticated;
grant execute on function public.admin_station_completion_detail(uuid) to authenticated;
