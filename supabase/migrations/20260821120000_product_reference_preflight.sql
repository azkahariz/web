-- Read-only Product Maintenance foundation. Mutation is intentionally out of scope.
create or replace function public.product_direct_reference_rows(p_product_id uuid)
returns table (
  submission_id uuid,
  submission_version integer,
  station_id uuid,
  station_name text,
  site_id uuid,
  site_name text,
  site_type_id uuid,
  site_type_name text,
  site_subtype_id uuid,
  site_subtype_name text,
  archived_at timestamptz,
  active_lock boolean,
  lock_operator_name text,
  category_name text,
  function_categories text[],
  function_category_ids jsonb,
  item_id text,
  product_id uuid,
  brand text,
  model text,
  unit_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    submission.id,
    submission.version,
    station.id,
    station.name,
    site.id,
    site.name,
    site_type.id,
    site_type.name,
    subtype.id,
    subtype.name,
    submission.archived_at,
    submission.locked_by_session_id is not null
      and submission.lock_last_activity_at >= now() - interval '5 minutes',
    submission.lock_operator_name,
    category.key,
    coalesce((
      select array_agg(distinct function_category.value order by function_category.value)
      from jsonb_array_elements_text(
        case when jsonb_typeof(item.value -> 'functionCategories') = 'array'
          then item.value -> 'functionCategories' else '[]'::jsonb end
      ) as function_category(value)
    ), array[category.key]),
    case when jsonb_typeof(item.value -> 'functionCategoryIds') = 'array'
      then item.value -> 'functionCategoryIds' else '[]'::jsonb end,
    nullif(item.value ->> 'id', ''),
    p_product_id,
    nullif(item.value ->> 'brand', ''),
    nullif(item.value ->> 'model', ''),
    case
      when jsonb_typeof(item.value -> 'units') = 'array' then jsonb_array_length(item.value -> 'units')
      when coalesce(item.value ->> 'quantity', '') ~ '^[0-9]+$' then greatest((item.value ->> 'quantity')::integer, 1)
      else 1
    end
  from public.submissions as submission
  join public.stations as station on station.id = submission.station_id
  join public.sites as site on site.id = submission.site_id
  join public.site_types as site_type on site_type.id = site.site_type_id
  join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
  cross join lateral jsonb_each(
    case when jsonb_typeof(coalesce(submission.payload, '{}'::jsonb) -> 'inventory') = 'object'
      then submission.payload -> 'inventory' else '{}'::jsonb end
  ) as category(key, value)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
  ) as item(value)
  where item.value ->> 'productId' = p_product_id::text;
$$;

create or replace function public.admin_product_dependencies(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
begin
  perform public.require_super_admin();
  select * into v_product from public.products as product where product.id = p_product_id;
  if not found then
    raise exception 'Product was not found.' using errcode = 'P0002';
  end if;

  return (
    with direct_references as materialized (
      select * from public.product_direct_reference_rows(p_product_id)
    ),
    qc as materialized (
      select proposal.id, proposal.proposed_brand, proposal.proposed_model, proposal.status,
        proposal.resolved_product_id, proposal.reviewed_at, proposal.review_note,
        coalesce(nullif(btrim(admin.display_name), ''), admin.username) as reviewer_name
      from public.product_proposals as proposal
      left join public.super_admins as admin on admin.auth_user_id = proposal.reviewed_by
      where proposal.resolved_product_id = p_product_id
        and proposal.status in ('APPROVED', 'MERGED')
    ),
    aliases as materialized (
      select alias.id, alias.brand_alias, alias.model_alias, alias.normalized_brand,
        alias.normalized_model, alias.source_proposal_id, alias.created_at
      from public.product_aliases as alias
      where alias.product_id = p_product_id
    )
    select jsonb_build_object(
      'product', jsonb_build_object(
        'id', v_product.id,
        'brand', v_product.brand,
        'model', v_product.model,
        'active', v_product.active,
        'sourceOrigin', v_product.source_origin,
        'spreadsheetSynced', v_product.spreadsheet_synced
      ),
      'preflight', jsonb_build_object(
        'productId', v_product.id,
        'currentDirectReferenceCount', (select count(*)::integer from direct_references where archived_at is null),
        'currentSiteCount', (select count(distinct site_id)::integer from direct_references where archived_at is null),
        'currentSubmissionCount', (select count(distinct submission_id)::integer from direct_references where archived_at is null),
        'archivedDirectReferenceCount', (select count(*)::integer from direct_references where archived_at is not null),
        'resolvedQcProposalCount', (select count(*)::integer from qc),
        'approvedQcCount', (select count(*)::integer from qc where status = 'APPROVED'),
        'mergedQcCount', (select count(*)::integer from qc where status = 'MERGED'),
        'aliasCount', (select count(*)::integer from aliases),
        'activeLockCount', (select count(distinct submission_id)::integer from direct_references where archived_at is null and active_lock),
        'mergeInboundCount', 0,
        'mergeOutboundCount', 0
      ),
      'qcProposals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'proposalId', id,
          'proposedBrand', proposed_brand,
          'proposedModel', proposed_model,
          'status', status,
          'resolvedProductId', resolved_product_id,
          'reviewerName', reviewer_name,
          'reviewedAt', reviewed_at,
          'reviewNote', review_note
        ) order by reviewed_at desc nulls last, id)
        from qc
      ), '[]'::jsonb),
      'aliases', coalesce((
        select jsonb_agg(jsonb_build_object(
          'aliasId', id,
          'brand', brand_alias,
          'model', model_alias,
          'normalizedBrand', normalized_brand,
          'normalizedModel', normalized_model,
          'sourceProposalId', source_proposal_id,
          'createdAt', created_at
        ) order by created_at desc, id)
        from aliases
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_product_direct_references(
  p_product_id uuid,
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null,
  p_archive_scope text default 'ALL'
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
  v_archive_scope text := case when upper(coalesce(p_archive_scope, 'ALL')) in ('ALL', 'CURRENT', 'ARCHIVED')
    then upper(coalesce(p_archive_scope, 'ALL')) else 'ALL' end;
begin
  perform public.require_super_admin();
  if not exists (select 1 from public.products as product where product.id = p_product_id) then
    raise exception 'Product was not found.' using errcode = 'P0002';
  end if;

  return (
    with rows as materialized (
      select * from public.product_direct_reference_rows(p_product_id)
    ),
    filtered as materialized (
      select * from rows
      where (v_archive_scope = 'ALL'
          or (v_archive_scope = 'CURRENT' and archived_at is null)
          or (v_archive_scope = 'ARCHIVED' and archived_at is not null))
        and (v_search is null or concat_ws(' ', station_name, site_name, site_type_name,
          site_subtype_name, category_name, array_to_string(function_categories, ' ')) ilike '%' || v_search || '%')
    ),
    paged as (
      select * from filtered
      order by archived_at nulls first, station_name, site_name, site_subtype_name, category_name, item_id
      limit v_page_size offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'submissionId', submission_id,
          'expectedSubmissionVersion', submission_version,
          'stationId', station_id,
          'stationName', station_name,
          'siteId', site_id,
          'siteName', site_name,
          'siteTypeId', site_type_id,
          'siteTypeName', site_type_name,
          'siteSubtypeId', site_subtype_id,
          'siteSubtypeName', site_subtype_name,
          'categoryName', category_name,
          'functionCategories', function_categories,
          'functionCategoryIds', function_category_ids,
          'itemId', item_id,
          'productId', product_id,
          'brand', brand,
          'model', model,
          'unitCount', unit_count,
          'archivedAt', archived_at,
          'activeLock', active_lock,
          'lockOwnerDisplayName', lock_operator_name
        ) order by archived_at nulls first, station_name, site_name, site_subtype_name, category_name, item_id)
        from paged
      ), '[]'::jsonb),
      'totalCount', (select count(*)::integer from filtered),
      'page', v_page,
      'pageSize', v_page_size
    )
  );
end;
$$;

revoke all on function public.product_direct_reference_rows(uuid) from public, anon, authenticated;
revoke all on function public.admin_product_dependencies(uuid) from public, anon;
revoke all on function public.admin_product_direct_references(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.admin_product_dependencies(uuid) to authenticated;
grant execute on function public.admin_product_direct_references(uuid, integer, integer, text, text) to authenticated;

comment on function public.admin_product_dependencies(uuid) is
  'Read-only Super Admin preflight for future Product maintenance. It performs no Product or Submission mutation.';
comment on function public.admin_product_direct_references(uuid, integer, integer, text, text) is
  'Read-only, server-paginated InstalledItem references for one canonical Product UUID.';
