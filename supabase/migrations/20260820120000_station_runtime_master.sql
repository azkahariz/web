create or replace function public.station_runtime_master()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
  v_station_name text;
  v_sites jsonb;
  v_site_subtypes jsonb;
  v_item_profiles jsonb;
  v_profile_items jsonb;
  v_legacy_submission_subtypes jsonb;
begin
  v_station_id := public.current_station_id();
  if v_station_id is null then
    raise exception 'Active station account is required.' using errcode = '42501';
  end if;

  select station.name
  into v_station_name
  from public.stations as station
  where station.id = v_station_id
    and station.active;

  if v_station_name is null then
    raise exception 'Active station master is required.' using errcode = '42501';
  end if;

  with relevant_sites as (
    select site.id, site.station_id, site.name, site.site_type_id, site_type.name as site_type_name
    from public.sites as site
    join public.site_types as site_type on site_type.id = site.site_type_id and site_type.active
    where site.station_id = v_station_id
      and site.active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', site.id,
    'stationId', site.station_id,
    'name', site.name,
    'siteTypeId', site.site_type_id,
    'siteTypeName', site.site_type_name
  ) order by site.name, site.id), '[]'::jsonb)
  into v_sites
  from relevant_sites as site;

  with relevant_types as (
    select distinct site.site_type_id
    from public.sites as site
    join public.site_types as site_type on site_type.id = site.site_type_id and site_type.active
    where site.station_id = v_station_id and site.active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', subtype.id,
    'siteTypeId', subtype.site_type_id,
    'siteTypeName', site_type.name,
    'name', subtype.name,
    'profileId', profile.id,
    'profileName', profile.name
  ) order by subtype.name, subtype.id), '[]'::jsonb)
  into v_site_subtypes
  from public.site_subtypes as subtype
  join relevant_types as type_scope on type_scope.site_type_id = subtype.site_type_id
  join public.site_types as site_type on site_type.id = subtype.site_type_id and site_type.active
  join public.item_profiles as profile on profile.id = subtype.item_profile_id and profile.active
  where subtype.active;

  with relevant_profiles as (
    select distinct subtype.item_profile_id as id
    from public.site_subtypes as subtype
    join public.sites as site on site.site_type_id = subtype.site_type_id and site.station_id = v_station_id and site.active
    join public.site_types as site_type on site_type.id = site.site_type_id and site_type.active
    join public.item_profiles as profile on profile.id = subtype.item_profile_id and profile.active
    where subtype.active and subtype.item_profile_id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', profile.id, 'name', profile.name) order by profile.name, profile.id), '[]'::jsonb)
  into v_item_profiles
  from public.item_profiles as profile
  join relevant_profiles as scope on scope.id = profile.id;

  with relevant_profiles as (
    select distinct subtype.item_profile_id as id
    from public.site_subtypes as subtype
    join public.sites as site on site.site_type_id = subtype.site_type_id and site.station_id = v_station_id and site.active
    join public.site_types as site_type on site_type.id = site.site_type_id and site_type.active
    join public.item_profiles as profile on profile.id = subtype.item_profile_id and profile.active
    where subtype.active and subtype.item_profile_id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', mapping.id,
    'profileId', profile.id,
    'profileName', profile.name,
    'itemId', item.id,
    'itemName', item.name
  ) order by profile.name, item.name, mapping.id), '[]'::jsonb)
  into v_profile_items
  from public.profile_items as mapping
  join relevant_profiles as scope on scope.id = mapping.item_profile_id
  join public.item_profiles as profile on profile.id = mapping.item_profile_id and profile.active
  join public.items as item on item.id = mapping.item_id and item.active
  where mapping.active;

  select coalesce(jsonb_object_agg(grouped.site_id::text, grouped.subtype_ids), '{}'::jsonb)
  into v_legacy_submission_subtypes
  from (
    select submission.site_id, jsonb_agg(distinct submission.site_subtype_id::text) as subtype_ids
    from public.submissions as submission
    join public.sites as site on site.id = submission.site_id
    where submission.station_id = v_station_id
      and submission.archived_at is null
      and site.station_id = v_station_id
    group by submission.site_id
  ) as grouped;

  return jsonb_build_object(
    'station', jsonb_build_object('id', v_station_id, 'name', v_station_name),
    'sites', v_sites,
    'siteSubtypes', v_site_subtypes,
    'itemProfiles', v_item_profiles,
    'profileItems', v_profile_items,
    'legacySubmissionSubtypeIdsBySite', v_legacy_submission_subtypes
  );
end;
$$;

revoke all on function public.station_runtime_master() from public, anon;
grant execute on function public.station_runtime_master() to authenticated;
