-- Resolve Product usage counts and category labels from one current-reference scan.
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
  with requested as materialized (
    select distinct requested_id as product_id
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) as requested_id
    where requested_id is not null
  ), current_items as materialized (
    select submission.id as submission_id, category.key as storage_category,
      item.ordinality as item_ordinal,
      nullif(item.value ->> 'productId', '')::uuid as direct_product_id,
      proposal.status as proposal_status, proposal.resolved_product_id,
      array(
        select public.submission_category_canonical_label(function_category.value)
        from jsonb_array_elements_text(
          case when jsonb_typeof(item.value -> 'functionCategories') = 'array'
              and jsonb_array_length(item.value -> 'functionCategories') > 0
            then item.value -> 'functionCategories'
            else jsonb_build_array(category.key)
          end
        ) as function_category(value)
      ) as category_labels
    from public.submissions as submission
    cross join lateral jsonb_each(
      case when jsonb_typeof(coalesce(submission.payload, '{}'::jsonb) -> 'inventory') = 'object'
        then submission.payload -> 'inventory' else '{}'::jsonb end
    ) as category(key, value)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
    ) with ordinality as item(value, ordinality)
    left join public.product_proposals as proposal
      on proposal.id::text = nullif(item.value ->> 'productProposalId', '')
    where submission.archived_at is null
  ), usage_product_candidates as materialized (
    select distinct coalesce(
      item.direct_product_id,
      case when item.proposal_status in ('APPROVED', 'MERGED') then item.resolved_product_id end
    ) as product_id
    from current_items as item
  ), canonical_usage_products as materialized (
    select candidate.product_id,
      public.resolve_canonical_product_id(candidate.product_id) as canonical_product_id
    from usage_product_candidates as candidate
    where candidate.product_id is not null
  ), resolved_items as materialized (
    select item.*, canonical.canonical_product_id as usage_product_id
    from current_items as item
    left join canonical_usage_products as canonical on canonical.product_id = coalesce(
      item.direct_product_id,
      case when item.proposal_status in ('APPROVED', 'MERGED') then item.resolved_product_id end
    )
  ), usage_counts as (
    select item.usage_product_id as product_id, count(*)::integer as reference_count
    from resolved_items as item
    join requested on requested.product_id = item.usage_product_id
    group by item.usage_product_id
  ), category_references as materialized (
    select item.direct_product_id as product_id, category_label
    from resolved_items as item
    cross join lateral unnest(item.category_labels) as category_label
    join requested on requested.product_id = item.direct_product_id
    where item.direct_product_id is not null
    union all
    select item.resolved_product_id as product_id, category_label
    from resolved_items as item
    cross join lateral unnest(item.category_labels) as category_label
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
  'Read-only page enrichment: existing usage-count and category semantics from one current Submission item scan.';
