create or replace function public.submission_item_is_filled(
  p_payload jsonb,
  p_item_name text
)
returns boolean
language sql
immutable
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
      and (
        (entry.value ->> 'itemKind' = 'material' and nullif(btrim(entry.value ->> 'material'), '') is not null)
        or (coalesce(entry.value ->> 'itemKind', 'product') <> 'material'
          and nullif(btrim(entry.value ->> 'brand'), '') is not null
          and nullif(btrim(entry.value ->> 'model'), '') is not null)
      )
  )
  select exists (
    select 1
    from entries
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(item -> 'functionCategories') = 'array'
          and jsonb_array_length(item -> 'functionCategories') > 0
          then item -> 'functionCategories'
        else jsonb_build_array(storage_category)
      end
    ) as function_category(name)
    where function_category.name = p_item_name
  )
$$;

comment on function public.submission_item_is_filled(jsonb, text) is
  'Expected category progress includes optional multi-function membership. Legacy rows fall back to their inventory category.';

create or replace function public.submission_progress(
  p_payload jsonb,
  p_item_profile_id uuid
)
returns table (filled_count integer, total_count integer)
language sql
stable
set search_path = ''
as $$
  select
    count(*) filter (where public.submission_item_is_filled(p_payload, item.name))::integer,
    count(*)::integer
  from public.item_profiles as profile
  join public.profile_items as profile_item on profile_item.item_profile_id = profile.id and profile_item.active
  join public.items as item on item.id = profile_item.item_id and item.active
  where profile.id = p_item_profile_id
    and profile.active
    and profile.id <> '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid
$$;

create or replace function public.submission_warehouse_summary(p_payload jsonb)
returns table (category_count integer, unit_count integer)
language sql
immutable
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
      and (
        (entry.value ->> 'itemKind' = 'material' and nullif(btrim(entry.value ->> 'material'), '') is not null)
        or (coalesce(entry.value ->> 'itemKind', 'product') <> 'material'
          and nullif(btrim(entry.value ->> 'brand'), '') is not null
          and nullif(btrim(entry.value ->> 'model'), '') is not null)
      )
  ), functions as (
    select distinct function_category.name
    from entries
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(item -> 'functionCategories') = 'array'
          and jsonb_array_length(item -> 'functionCategories') > 0
          then item -> 'functionCategories'
        else jsonb_build_array(storage_category)
      end
    ) as function_category(name)
  ), unit_rows as (
    select nullif(btrim(unit.value ->> 'id'), '') as unit_id
    from entries
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(item -> 'units') = 'array'
        and jsonb_array_length(item -> 'units') > 0
        then item -> 'units' else '[]'::jsonb end
    ) as unit(value)
    where jsonb_typeof(unit.value) = 'object'
  ), quantity_only as (
    select coalesce(sum(greatest(case when coalesce(item ->> 'quantity', '') ~ '^[0-9]+$'
      then (item ->> 'quantity')::integer else 1 end, 1)), 0)::integer as count
    from entries
    where not coalesce(jsonb_typeof(item -> 'units') = 'array'
      and jsonb_array_length(item -> 'units') > 0, false)
  )
  select
    (select count(*)::integer from functions),
    ((select count(distinct unit_id)::integer from unit_rows where unit_id is not null)
      + (select count(*)::integer from unit_rows where unit_id is null)
      + (select count from quantity_only))::integer
$$;

create or replace function public.admin_list_submissions(
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null,
  p_station_id uuid default null,
  p_site_type_id uuid default null,
  p_progress_status text default null,
  p_updated_filter text default 'ALL',
  p_archive_filter text default 'ACTIVE',
  p_sort_field text default 'updated',
  p_sort_direction text default 'desc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 10), 1000);
  v_search text := nullif(btrim(p_search), '');
  v_sort_field text := coalesce(nullif(btrim(p_sort_field), ''), 'updated');
  v_sort_direction text := lower(coalesce(nullif(btrim(p_sort_direction), ''), 'desc'));
begin
  perform public.require_super_admin();
  if coalesce(p_archive_filter, 'ACTIVE') not in ('ACTIVE', 'ARCHIVED') then
    raise exception 'Invalid archive filter.' using errcode = '22023';
  end if;
  if coalesce(p_updated_filter, 'ALL') not in ('ALL', 'TODAY', 'LAST_7_DAYS', 'OLDER') then
    raise exception 'Invalid updated filter.' using errcode = '22023';
  end if;
  if v_sort_field not in ('station', 'site', 'siteType', 'subtype', 'progress', 'version', 'operator', 'updated') then
    raise exception 'Invalid sort field.' using errcode = '22023';
  end if;
  if v_sort_direction not in ('asc', 'desc') then
    raise exception 'Invalid sort direction.' using errcode = '22023';
  end if;

  return (
    with summaries as materialized (
      select
        submission.id,
        station.id as station_id,
        station.name as station_name,
        site.id as site_id,
        site.name as site_name,
        site_type.id as site_type_id,
        site_type.name as site_type_name,
        subtype.id as site_subtype_id,
        subtype.name as subtype_name,
        submission.version,
        submission.operator_name,
        submission.updated_at,
        submission.last_saved_at,
        case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 0 else progress.filled_count end as filled_count,
        case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 0 else progress.total_count end as total_count,
        case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid or progress.total_count = 0 then 0
          else round(progress.filled_count * 100.0 / progress.total_count)::integer end as progress_percent,
        case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 'Gudang'
          when progress.total_count = 0 then 'Belum terpetakan'
          when progress.filled_count = 0 then 'Kosong'
          when progress.filled_count = progress.total_count then 'Lengkap'
          else 'Terisi Sebagian' end as progress_status,
        case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 'WAREHOUSE' else 'EXPECTED' end as progress_kind,
        case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then warehouse.category_count else 0 end as warehouse_category_count,
        case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then warehouse.unit_count else 0 end as warehouse_unit_count,
        case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then warehouse.unit_count
          when progress.total_count = 0 then 0
          else round(progress.filled_count * 100.0 / progress.total_count)::integer end as progress_sort_value,
        submission.archived_at,
        submission.archive_reason,
        coalesce(submission.last_saved_at, submission.updated_at) as activity_at
      from public.submissions as submission
      join public.stations as station on station.id = submission.station_id
      join public.sites as site on site.id = submission.site_id
      join public.site_types as site_type on site_type.id = site.site_type_id
      join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
      join public.item_profiles as profile on profile.id = subtype.item_profile_id
      left join lateral public.submission_progress(submission.payload, subtype.item_profile_id) as progress on true
      left join lateral public.submission_warehouse_summary(submission.payload) as warehouse on profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid
      where ((coalesce(p_archive_filter, 'ACTIVE') = 'ACTIVE' and submission.archived_at is null)
        or (coalesce(p_archive_filter, 'ACTIVE') = 'ARCHIVED' and submission.archived_at is not null))
    ), filtered as materialized (
      select * from summaries
      where (v_search is null or concat_ws(' ', station_name, site_name, site_type_name, subtype_name, operator_name) ilike '%' || v_search || '%')
        and (p_station_id is null or station_id = p_station_id)
        and (p_site_type_id is null or site_type_id = p_site_type_id)
        and (nullif(btrim(p_progress_status), '') is null or progress_status = p_progress_status)
        and (coalesce(p_updated_filter, 'ALL') = 'ALL'
          or (p_updated_filter = 'TODAY' and activity_at >= date_trunc('day', now()))
          or (p_updated_filter = 'LAST_7_DAYS' and activity_at >= now() - interval '7 days')
          or (p_updated_filter = 'OLDER' and activity_at < now() - interval '7 days'))
    ), ordered as materialized (
      select * from filtered
      order by
        case when v_sort_field = 'station' and v_sort_direction = 'asc' then lower(station_name) end asc nulls last,
        case when v_sort_field = 'station' and v_sort_direction = 'desc' then lower(station_name) end desc nulls last,
        case when v_sort_field = 'site' and v_sort_direction = 'asc' then lower(site_name) end asc nulls last,
        case when v_sort_field = 'site' and v_sort_direction = 'desc' then lower(site_name) end desc nulls last,
        case when v_sort_field = 'siteType' and v_sort_direction = 'asc' then lower(site_type_name) end asc nulls last,
        case when v_sort_field = 'siteType' and v_sort_direction = 'desc' then lower(site_type_name) end desc nulls last,
        case when v_sort_field = 'subtype' and v_sort_direction = 'asc' then lower(subtype_name) end asc nulls last,
        case when v_sort_field = 'subtype' and v_sort_direction = 'desc' then lower(subtype_name) end desc nulls last,
        case when v_sort_field = 'progress' and v_sort_direction = 'asc' then progress_sort_value end asc nulls last,
        case when v_sort_field = 'progress' and v_sort_direction = 'desc' then progress_sort_value end desc nulls last,
        case when v_sort_field = 'version' and v_sort_direction = 'asc' then version end asc nulls last,
        case when v_sort_field = 'version' and v_sort_direction = 'desc' then version end desc nulls last,
        case when v_sort_field = 'operator' and v_sort_direction = 'asc' then lower(operator_name) end asc nulls last,
        case when v_sort_field = 'operator' and v_sort_direction = 'desc' then lower(operator_name) end desc nulls last,
        case when v_sort_field = 'updated' and v_sort_direction = 'asc' then activity_at end asc nulls last,
        case when v_sort_field = 'updated' and v_sort_direction = 'desc' then activity_at end desc nulls last,
        id asc
    ), paged as (
      select id, station_id, station_name, site_id, site_name, site_type_id, site_type_name,
        site_subtype_id, subtype_name, version, operator_name, updated_at, last_saved_at,
        filled_count, total_count, progress_percent, progress_status, progress_kind,
        warehouse_category_count, warehouse_unit_count, archived_at, archive_reason
      from ordered limit v_page_size offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(paged)) from paged), '[]'::jsonb),
      'totalCount', (select count(*) from filtered),
      'page', v_page,
      'pageSize', v_page_size
    )
  );
end;
$$;

create or replace function public.admin_get_submission_detail(p_submission_id uuid)
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
    'id', submission.id,
    'station_id', station.id,
    'station_name', station.name,
    'site_id', site.id,
    'site_name', site.name,
    'site_type_id', site_type.id,
    'site_type_name', site_type.name,
    'site_subtype_id', subtype.id,
    'subtype_name', subtype.name,
    'version', submission.version,
    'operator_name', submission.operator_name,
    'updated_at', submission.updated_at,
    'last_saved_at', submission.last_saved_at,
    'filled_count', case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 0 else progress.filled_count end,
    'total_count', case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 0 else progress.total_count end,
    'progress_percent', case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid or progress.total_count = 0 then 0 else round(progress.filled_count * 100.0 / progress.total_count)::integer end,
    'progress_status', case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 'Gudang'
      when progress.total_count = 0 then 'Belum terpetakan'
      when progress.filled_count = 0 then 'Kosong'
      when progress.filled_count = progress.total_count then 'Lengkap'
      else 'Terisi Sebagian' end,
    'progress_kind', case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then 'WAREHOUSE' else 'EXPECTED' end,
    'warehouse_category_count', case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then warehouse.category_count else 0 end,
    'warehouse_unit_count', case when profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid then warehouse.unit_count else 0 end,
    'archived_at', submission.archived_at,
    'archive_reason', submission.archive_reason,
    'payload', submission.payload,
    'expected_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', item.name,
        'filled', public.submission_item_is_filled(submission.payload, item.name)
      ) order by item.name)
      from public.profile_items as profile_item
      join public.items as item on item.id = profile_item.item_id and item.active
      where profile_item.item_profile_id = profile.id
        and profile_item.active
        and (profile.id <> '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid
          or coalesce(submission.payload -> 'inventory', '{}'::jsonb) ? item.name
          or public.submission_item_is_filled(submission.payload, item.name))
    ), '[]'::jsonb),
    'qc_pending_count', (
      select count(*) from public.product_proposals as proposal
      where proposal.submission_id = submission.id and proposal.status = 'PENDING'
    )
  ) into v_result
  from public.submissions as submission
  join public.stations as station on station.id = submission.station_id
  join public.sites as site on site.id = submission.site_id
  join public.site_types as site_type on site_type.id = site.site_type_id
  join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
  join public.item_profiles as profile on profile.id = subtype.item_profile_id
  left join lateral public.submission_progress(submission.payload, subtype.item_profile_id) as progress on true
  left join lateral public.submission_warehouse_summary(submission.payload) as warehouse on profile.id = '78b3c5db-2606-43fb-bd5e-ab6e379b9e6e'::uuid
  where submission.id = p_submission_id;

  if v_result is null then
    raise exception 'Submission does not exist.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public.submission_warehouse_summary(jsonb) from public, anon, authenticated;

comment on function public.submission_warehouse_summary(jsonb) is
  'Warehouse monitoring counts recorded function categories and unique physical units without expected completeness.';
