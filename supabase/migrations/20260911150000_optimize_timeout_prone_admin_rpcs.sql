-- Reduce repeated Submission JSON work in the two dominant timeout-prone Admin reads.
create or replace function public.admin_pending_product_proposal_summary()
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

  with pending as materialized (
    select proposal.id, proposal.submission_id
    from public.product_proposals as proposal
    where proposal.status = 'PENDING'
  ), inventory_references as materialized (
    select pending.id as proposal_id,
      pending.submission_id as owner_submission_id,
      submission.id as submission_id,
      submission.station_id,
      submission.site_id,
      submission.site_subtype_id,
      submission.archived_at
    from public.submissions as submission
    cross join lateral public.submission_inventory_facts(submission.payload) as fact
    join pending on pending.id = fact.product_proposal_id
  ), expected as materialized (
    select context.station_id, context.site_id, context.site_subtype_id, context.is_warehouse
    from public.station_completion_expected_contexts(null) as context
  ), buckets as materialized (
    select pending.id,
      case
        when exists (
          select 1
          from inventory_references as reference
          join expected
            on expected.station_id = reference.station_id
           and expected.site_id = reference.site_id
           and expected.site_subtype_id = reference.site_subtype_id
          where reference.proposal_id = pending.id
            and reference.submission_id = reference.owner_submission_id
            and reference.archived_at is null
            and not expected.is_warehouse
        ) then 'PENGISIAN'
        when exists (
          select 1
          from inventory_references as reference
          join expected
            on expected.station_id = reference.station_id
           and expected.site_id = reference.site_id
           and expected.site_subtype_id = reference.site_subtype_id
          where reference.proposal_id = pending.id
            and reference.submission_id = reference.owner_submission_id
            and reference.archived_at is null
            and expected.is_warehouse
        ) then 'GUDANG'
        when not exists (
          select 1
          from inventory_references as reference
          where reference.proposal_id = pending.id
        ) then 'TIDAK_DIGUNAKAN_SAAT_INI'
        else null
      end as bucket
    from pending
  )
  select jsonb_build_object(
    'total_pending', count(*)::integer,
    'pending_pengisian', count(*) filter (where bucket = 'PENGISIAN')::integer,
    'pending_gudang', count(*) filter (where bucket = 'GUDANG')::integer,
    'pending_tidak_digunakan', count(*) filter (where bucket = 'TIDAK_DIGUNAKAN_SAAT_INI')::integer
  ) into v_result
  from buckets;

  if (v_result->>'total_pending')::integer <>
    (v_result->>'pending_pengisian')::integer +
    (v_result->>'pending_gudang')::integer +
    (v_result->>'pending_tidak_digunakan')::integer then
    raise exception 'Pending product proposal context could not be classified.' using errcode = '22023';
  end if;

  return v_result;
end;
$$;

comment on function public.admin_pending_product_proposal_summary() is
  'One-call Super Admin QC Pending context aggregation using one Submission inventory scan. Counts PENDING proposals only and never returns Submission payloads.';

revoke all on function public.admin_pending_product_proposal_summary() from public, anon;
grant execute on function public.admin_pending_product_proposal_summary() to authenticated;

create or replace function public.admin_product_page_enrichment(p_product_ids uuid[])
returns table (product_id uuid, reference_count integer, categories text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();

  return query
  with recursive requested as materialized (
    select distinct requested_id as product_id
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) as requested_id
    where requested_id is not null
  ), usage_product_map(product_id, canonical_product_id, path) as materialized (
    select requested.product_id, requested.product_id, array[requested.product_id]
    from requested
    join public.products as product on product.id = requested.product_id
    where product.merged_into_product_id is null
    union all
    select child.id, mapping.canonical_product_id, mapping.path || child.id
    from usage_product_map as mapping
    join public.products as child on child.merged_into_product_id = mapping.product_id
    where not child.id = any(mapping.path)
      and cardinality(mapping.path) < 100
  ), current_items as materialized (
    select category.key as storage_category,
      case when jsonb_typeof(item.value -> 'functionCategories') = 'array'
          and jsonb_array_length(item.value -> 'functionCategories') > 0
        then item.value -> 'functionCategories'
        else jsonb_build_array(category.key)
      end as category_sources,
      nullif(item.value ->> 'productId', '')::uuid as direct_product_id,
      proposal.status as proposal_status,
      proposal.resolved_product_id
    from public.submissions as submission
    cross join lateral jsonb_each(
      case when jsonb_typeof(coalesce(submission.payload, '{}'::jsonb) -> 'inventory') = 'object'
        then submission.payload -> 'inventory' else '{}'::jsonb end
    ) as category(key, value)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
    ) as item(value)
    left join public.product_proposals as proposal
      on proposal.id::text = nullif(item.value ->> 'productProposalId', '')
    where submission.archived_at is null
  ), resolved_items as materialized (
    select item.*, usage_mapping.canonical_product_id as usage_product_id
    from current_items as item
    left join usage_product_map as usage_mapping on usage_mapping.product_id = coalesce(
      item.direct_product_id,
      case when item.proposal_status in ('APPROVED', 'MERGED') then item.resolved_product_id end
    )
    where usage_mapping.product_id is not null
       or item.direct_product_id in (select requested.product_id from requested)
       or (
         item.proposal_status in ('APPROVED', 'MERGED')
         and item.resolved_product_id in (select requested.product_id from requested)
       )
  ), usage_counts as (
    select item.usage_product_id as product_id, count(*)::integer as reference_count
    from resolved_items as item
    where item.usage_product_id is not null
    group by item.usage_product_id
  ), category_references as materialized (
    select item.direct_product_id as product_id,
      public.submission_category_canonical_label(function_category.value) as category_label
    from resolved_items as item
    cross join lateral jsonb_array_elements_text(item.category_sources) as function_category(value)
    join requested on requested.product_id = item.direct_product_id
    where item.direct_product_id is not null
    union all
    select item.resolved_product_id as product_id,
      public.submission_category_canonical_label(function_category.value) as category_label
    from resolved_items as item
    cross join lateral jsonb_array_elements_text(item.category_sources) as function_category(value)
    join requested on requested.product_id = item.resolved_product_id
    where item.proposal_status in ('APPROVED', 'MERGED')
      and item.resolved_product_id is not null
  ), category_summaries as (
    select reference.product_id,
      array_agg(distinct btrim(reference.category_label) order by btrim(reference.category_label))
        filter (where nullif(btrim(reference.category_label), '') is not null) as categories
    from category_references as reference
    group by reference.product_id
  )
  select requested.product_id,
    coalesce(usage.reference_count, 0)::integer,
    coalesce(category.categories, '{}'::text[])
  from requested
  left join usage_counts as usage on usage.product_id = requested.product_id
  left join category_summaries as category on category.product_id = requested.product_id
  order by requested.product_id;
end;
$$;

revoke all on function public.admin_product_page_enrichment(uuid[]) from public, anon;
grant execute on function public.admin_product_page_enrichment(uuid[]) to authenticated;

comment on function public.admin_product_page_enrichment(uuid[]) is
  'Read-only page enrichment: existing usage-count and category semantics with set-based canonical mapping and deferred category expansion.';
