drop function if exists public.admin_list_submissions(integer, integer, text, uuid, uuid, text, text, text);

create function public.admin_list_submissions(
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
        progress.filled_count,
        progress.total_count,
        case when progress.total_count = 0 then 0
          else round(progress.filled_count * 100.0 / progress.total_count)::integer end as progress_percent,
        case
          when progress.total_count = 0 then 'Belum terpetakan'
          when progress.filled_count = 0 then 'Kosong'
          when progress.filled_count = progress.total_count then 'Lengkap'
          else 'Terisi Sebagian'
        end as progress_status,
        submission.archived_at,
        submission.archive_reason,
        coalesce(submission.last_saved_at, submission.updated_at) as activity_at
      from public.submissions as submission
      join public.stations as station on station.id = submission.station_id
      join public.sites as site on site.id = submission.site_id
      join public.site_types as site_type on site_type.id = site.site_type_id
      join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
      left join lateral public.submission_progress(submission.payload, subtype.item_profile_id) as progress on true
      where (
        (coalesce(p_archive_filter, 'ACTIVE') = 'ACTIVE' and submission.archived_at is null)
        or (coalesce(p_archive_filter, 'ACTIVE') = 'ARCHIVED' and submission.archived_at is not null)
      )
    ),
    filtered as materialized (
      select * from summaries
      where (v_search is null or concat_ws(' ', station_name, site_name, site_type_name, subtype_name, operator_name) ilike '%' || v_search || '%')
        and (p_station_id is null or station_id = p_station_id)
        and (p_site_type_id is null or site_type_id = p_site_type_id)
        and (nullif(btrim(p_progress_status), '') is null or progress_status = p_progress_status)
        and (
          coalesce(p_updated_filter, 'ALL') = 'ALL'
          or (p_updated_filter = 'TODAY' and activity_at >= date_trunc('day', now()))
          or (p_updated_filter = 'LAST_7_DAYS' and activity_at >= now() - interval '7 days')
          or (p_updated_filter = 'OLDER' and activity_at < now() - interval '7 days')
        )
    ),
    ordered as materialized (
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
        case when v_sort_field = 'progress' and v_sort_direction = 'asc' then progress_percent end asc nulls last,
        case when v_sort_field = 'progress' and v_sort_direction = 'desc' then progress_percent end desc nulls last,
        case when v_sort_field = 'version' and v_sort_direction = 'asc' then version end asc nulls last,
        case when v_sort_field = 'version' and v_sort_direction = 'desc' then version end desc nulls last,
        case when v_sort_field = 'operator' and v_sort_direction = 'asc' then lower(operator_name) end asc nulls last,
        case when v_sort_field = 'operator' and v_sort_direction = 'desc' then lower(operator_name) end desc nulls last,
        case when v_sort_field = 'updated' and v_sort_direction = 'asc' then activity_at end asc nulls last,
        case when v_sort_field = 'updated' and v_sort_direction = 'desc' then activity_at end desc nulls last,
        id asc
    ),
    paged as (
      select id, station_id, station_name, site_id, site_name, site_type_id,
        site_type_name, site_subtype_id, subtype_name, version, operator_name,
        updated_at, last_saved_at, filled_count, total_count, progress_percent,
        progress_status, archived_at, archive_reason
      from ordered
      limit v_page_size
      offset (v_page - 1) * v_page_size
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

create function public.admin_permanently_delete_submission(p_submission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_submission public.submissions%rowtype;
begin
  v_admin_id := public.require_super_admin();
  select * into v_submission
  from public.submissions as submission
  where submission.id = p_submission_id
  for update;
  if not found then
    raise exception 'Submission does not exist.' using errcode = 'P0002';
  end if;
  if v_submission.locked_by_session_id is not null
     and v_submission.lock_last_activity_at is not null
     and v_submission.lock_last_activity_at >= now() - interval '5 minutes' then
    raise exception 'Submission has an active editor lock.' using errcode = '55000';
  end if;

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'SUBMISSION_PERMANENT_DELETE', 'submission', v_submission.id,
    jsonb_build_object(
      'submission_id', v_submission.id,
      'station_id', v_submission.station_id,
      'site_id', v_submission.site_id,
      'site_subtype_id', v_submission.site_subtype_id,
      'version', v_submission.version,
      'operator_name', v_submission.operator_name,
      'was_archived', v_submission.archived_at is not null
    )
  );

  delete from public.submissions as submission where submission.id = p_submission_id;
  return found;
end;
$$;

revoke all on function public.admin_list_submissions(integer, integer, text, uuid, uuid, text, text, text, text, text) from public, anon;
revoke all on function public.admin_permanently_delete_submission(uuid) from public, anon;
grant execute on function public.admin_list_submissions(integer, integer, text, uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_permanently_delete_submission(uuid) to authenticated;

comment on function public.admin_permanently_delete_submission(uuid) is
  'Permanently deletes one unlocked submission. Product proposals are preserved through their ON DELETE SET NULL relationship; audit metadata never contains payload.';
