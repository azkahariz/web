create or replace function public.admin_product_usage_counts(p_product_ids uuid[])
returns table(product_id uuid, reference_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();

  return query
  with requested_products as materialized (
    select distinct requested.product_id
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) as requested(product_id)
    where requested.product_id is not null
  ),
  item_references as materialized (
    select coalesce(direct_product.product_id, resolved_product.product_id) as product_id
    from public.submissions as submission
    cross join lateral jsonb_each(
      case when jsonb_typeof(coalesce(submission.payload, '{}'::jsonb) -> 'inventory') = 'object'
        then submission.payload -> 'inventory' else '{}'::jsonb end
    ) as category
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
    ) as item
    left join requested_products as direct_product
      on direct_product.product_id::text = nullif(item.value ->> 'productId', '')
    left join public.product_proposals as proposal
      on proposal.id::text = nullif(item.value ->> 'productProposalId', '')
    left join requested_products as resolved_product
      on resolved_product.product_id = proposal.resolved_product_id
      and proposal.status in ('APPROVED', 'MERGED')
    where submission.archived_at is null
      and (direct_product.product_id is not null or resolved_product.product_id is not null)
  )
  select
    requested_products.product_id,
    count(item_references.product_id)::integer as reference_count
  from requested_products
  left join item_references on item_references.product_id = requested_products.product_id
  group by requested_products.product_id;
end;
$$;

revoke all on function public.admin_product_usage_counts(uuid[]) from public, anon;
grant execute on function public.admin_product_usage_counts(uuid[]) to authenticated;
