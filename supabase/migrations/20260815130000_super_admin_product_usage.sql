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
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_search text := nullif(btrim(p_search), '');
begin
  perform public.require_super_admin();

  return (
    with item_references as materialized (
      select
        submission.station_id,
        station.name as station_name,
        submission.site_id,
        site.name as site_name,
        site_type.name as site_type_name,
        submission.site_subtype_id,
        subtype.name as subtype_name,
        category.key as category_name,
        item.value as item
      from public.submissions as submission
      join public.stations as station on station.id = submission.station_id
      join public.sites as site on site.id = submission.site_id
      join public.site_types as site_type on site_type.id = site.site_type_id
      join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
      cross join lateral jsonb_each(
        case when jsonb_typeof(coalesce(submission.payload, '{}'::jsonb) -> 'inventory') = 'object'
          then submission.payload -> 'inventory' else '{}'::jsonb end
      ) as category
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
      ) as item
      left join public.product_proposals as proposal
        on proposal.id::text = nullif(item.value ->> 'productProposalId', '')
      where submission.archived_at is null
        and (
          item.value ->> 'productId' = p_product_id::text
          or (
            proposal.status in ('APPROVED', 'MERGED')
            and proposal.resolved_product_id = p_product_id
          )
        )
    ),
    locations as materialized (
      select
        station_id, station_name, site_id, site_name, site_type_name,
        site_subtype_id, subtype_name,
        count(*)::integer as reference_count,
        array_agg(distinct category_name order by category_name) as categories
      from item_references
      group by station_id, station_name, site_id, site_name, site_type_name, site_subtype_id, subtype_name
    ),
    filtered as materialized (
      select *
      from locations
      where v_search is null
        or concat_ws(' ', station_name, site_name, site_type_name, subtype_name) ilike '%' || v_search || '%'
    ),
    paged as (
      select *
      from filtered
      order by station_name, site_name, subtype_name, site_subtype_id
      limit v_page_size
      offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'stationId', station_id,
          'stationName', station_name,
          'siteId', site_id,
          'siteName', site_name,
          'siteTypeName', site_type_name,
          'siteSubtypeId', site_subtype_id,
          'subtypeName', subtype_name,
          'referenceCount', reference_count,
          'categories', categories
        ) order by station_name, site_name, subtype_name, site_subtype_id)
        from paged
      ), '[]'::jsonb),
      'totalCount', (select count(*) from filtered),
      'stationCount', (select count(distinct station_id) from filtered),
      'siteCount', (select count(distinct site_id) from filtered),
      'referenceCount', coalesce((select sum(reference_count) from filtered), 0),
      'page', v_page,
      'pageSize', v_page_size
    )
  );
end;
$$;

revoke all on function public.admin_product_usage(uuid, integer, integer, text) from public, anon;
grant execute on function public.admin_product_usage(uuid, integer, integer, text) to authenticated;
