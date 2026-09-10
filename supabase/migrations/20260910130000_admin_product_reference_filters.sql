-- Read-only, same-occurrence filters for the Super Admin Product list.
create or replace function public.admin_product_reference_filter_occurrences()
returns table (
  product_id uuid,
  category_label text,
  station_category_id uuid,
  site_type_id uuid
)
language sql
stable
set search_path = ''
as $$
  with current_facts as materialized (
    select submission.station_id, submission.site_id,
      fact.product_id, fact.product_proposal_id,
      nullif(btrim(fact.category_label), '') as category_label
    from public.submissions as submission
    cross join lateral public.submission_product_reference_category_rows(submission.payload) as fact
    where submission.archived_at is null
  ), resolved as (
    select fact.product_id, fact.category_label, fact.station_id, fact.site_id
    from current_facts as fact
    where fact.product_id is not null
    union all
    select proposal.resolved_product_id, fact.category_label, fact.station_id, fact.site_id
    from current_facts as fact
    join public.product_proposals as proposal on proposal.id = fact.product_proposal_id
    where proposal.status in ('APPROVED', 'MERGED')
      and proposal.resolved_product_id is not null
  )
  select resolved.product_id, resolved.category_label,
    station.station_category_id, site.site_type_id
  from resolved
  join public.stations as station on station.id = resolved.station_id
  join public.sites as site on site.id = resolved.site_id
$$;

create or replace function public.admin_product_reference_filter_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();

  return (
    with occurrence as materialized (
      select * from public.admin_product_reference_filter_occurrences()
    )
    select jsonb_build_object(
      'categories', coalesce((
        select jsonb_agg(category_label order by category_label)
        from (select distinct category_label from occurrence where category_label is not null) as categories
      ), '[]'::jsonb),
      'stationGroups', coalesce((
        select jsonb_agg(jsonb_build_object('id', category.id, 'name', category.name) order by
          case category.code when 'METEOROLOGI' then 1 when 'KLIMATOLOGI' then 2 when 'GEOFISIKA' then 3 else 4 end)
        from public.station_categories as category
        where category.active
          and category.code in ('METEOROLOGI', 'KLIMATOLOGI', 'GEOFISIKA')
          and exists (select 1 from occurrence where station_category_id = category.id)
      ), '[]'::jsonb),
      'siteTypes', coalesce((
        select jsonb_agg(jsonb_build_object('id', site_type.id, 'name', site_type.name) order by site_type.name)
        from public.site_types as site_type
        where exists (select 1 from occurrence where site_type_id = site_type.id)
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_product_reference_filter_ids(
  p_categories text[] default '{}'::text[],
  p_station_category_id uuid default null,
  p_site_type_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_categories text[];
begin
  perform public.require_super_admin();

  select coalesce(array_agg(distinct btrim(value) order by btrim(value)), '{}'::text[])
  into v_categories
  from unnest(coalesce(p_categories, '{}'::text[])) as value
  where nullif(btrim(value), '') is not null;

  if cardinality(v_categories) > 200 then
    raise exception 'Maximum 200 categories may be selected.' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(product_id order by product_id)
    from (
      select distinct occurrence.product_id
      from public.admin_product_reference_filter_occurrences() as occurrence
      where (cardinality(v_categories) = 0 or occurrence.category_label = any(v_categories))
        and (p_station_category_id is null or occurrence.station_category_id = p_station_category_id)
        and (p_site_type_id is null or occurrence.site_type_id = p_site_type_id)
    ) as matching
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_product_reference_filter_occurrences() from public, anon, authenticated;
revoke all on function public.admin_product_reference_filter_options() from public, anon;
revoke all on function public.admin_product_reference_filter_ids(text[], uuid, uuid) from public, anon;
grant execute on function public.admin_product_reference_filter_options() to authenticated;
grant execute on function public.admin_product_reference_filter_ids(text[], uuid, uuid) to authenticated;

comment on function public.admin_product_reference_filter_occurrences() is
  'Internal current DIRECT and resolved QC Product occurrence context. Not callable by application roles.';
comment on function public.admin_product_reference_filter_options() is
  'Read-only Super Admin filter options derived from current Product reference occurrences.';
comment on function public.admin_product_reference_filter_ids(text[], uuid, uuid) is
  'Read-only Super Admin Product IDs matching category, Station group, and Site Type on the same occurrence.';
