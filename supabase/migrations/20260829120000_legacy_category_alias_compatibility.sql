-- Keep the canonical item name in master while recognizing one historical
-- payload key whose spelling predates the current item UUID/name contract.
create or replace function public.submission_category_canonical_label(p_category_label text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_category_label = 'SIstem Catu Daya Tidak Terputus'
      then 'Sistem Catu Daya Tidak Terputus'
    else p_category_label
  end
$$;

comment on function public.submission_category_canonical_label(text) is
  'Canonicalizes only the explicit legacy alias for items.id=58c2e908-fa5d-4b08-830b-746ecd65b612; all other category labels remain exact.';

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
  select public.submission_category_canonical_label(function_category.name), normalized.product_proposal_id, normalized.recognized
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
      and fact.category_label = public.submission_category_canonical_label(p_item_name)
  )
$$;

revoke all on function public.submission_category_canonical_label(text) from public, anon, authenticated;
