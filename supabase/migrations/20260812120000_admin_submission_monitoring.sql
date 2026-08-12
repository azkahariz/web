alter table public.submissions
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users(id) on delete restrict,
  add column archive_reason text check (
    archive_reason is null or char_length(btrim(archive_reason)) between 1 and 500
  );

create index submissions_active_updated_idx
  on public.submissions (updated_at desc, id)
  where archived_at is null;
create index submissions_archived_updated_idx
  on public.submissions (archived_at desc, id)
  where archived_at is not null;

drop policy if exists submissions_select_own_station on public.submissions;
create policy submissions_select_own_station
on public.submissions for select
to authenticated
using (station_id = public.current_station_id() and archived_at is null);

create or replace function public.submission_item_is_filled(
  p_payload jsonb,
  p_item_name text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(p_payload, '{}'::jsonb) -> 'inventory' -> p_item_name) = 'array'
          then p_payload -> 'inventory' -> p_item_name
        else '[]'::jsonb
      end
    ) as entry(value)
    where jsonb_typeof(entry.value) = 'object'
      and (
        (
          entry.value ->> 'itemKind' = 'material'
          and nullif(btrim(entry.value ->> 'material'), '') is not null
        )
        or (
          coalesce(entry.value ->> 'itemKind', 'product') <> 'material'
          and nullif(btrim(entry.value ->> 'brand'), '') is not null
          and nullif(btrim(entry.value ->> 'model'), '') is not null
        )
      )
  )
$$;

comment on function public.submission_item_is_filled(jsonb, text) is
  'Progress contract: an expected category is filled by at least one valid product or material row. Site metadata and optional unit fields are excluded.';

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
    count(*) filter (
      where public.submission_item_is_filled(p_payload, item.name)
    )::integer as filled_count,
    count(*)::integer as total_count
  from public.item_profiles as profile
  join public.profile_items as profile_item
    on profile_item.item_profile_id = profile.id
   and profile_item.active
  join public.items as item
    on item.id = profile_item.item_id
   and item.active
  where profile.id = p_item_profile_id
    and profile.active
$$;

create or replace function public.admin_list_submissions(
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null,
  p_station_id uuid default null,
  p_site_type_id uuid default null,
  p_progress_status text default null,
  p_updated_filter text default 'ALL',
  p_archive_filter text default 'ACTIVE'
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
  if coalesce(p_archive_filter, 'ACTIVE') not in ('ACTIVE', 'ARCHIVED') then
    raise exception 'Invalid archive filter.' using errcode = '22023';
  end if;
  if coalesce(p_updated_filter, 'ALL') not in ('ALL', 'TODAY', 'LAST_7_DAYS', 'OLDER') then
    raise exception 'Invalid updated filter.' using errcode = '22023';
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
        case
          when progress.total_count = 0 then 0
          else round(progress.filled_count * 100.0 / progress.total_count)::integer
        end as progress_percent,
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
      left join lateral public.submission_progress(
        submission.payload,
        subtype.item_profile_id
      ) as progress on true
      where (
        (coalesce(p_archive_filter, 'ACTIVE') = 'ACTIVE' and submission.archived_at is null)
        or (coalesce(p_archive_filter, 'ACTIVE') = 'ARCHIVED' and submission.archived_at is not null)
      )
    ),
    filtered as materialized (
      select *
      from summaries
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
    paged as (
      select
        id, station_id, station_name, site_id, site_name, site_type_id,
        site_type_name, site_subtype_id, subtype_name, version, operator_name,
        updated_at, last_saved_at, filled_count, total_count, progress_percent,
        progress_status, archived_at, archive_reason
      from filtered
      order by activity_at desc, id
      limit v_page_size
      offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(paged) order by coalesce(last_saved_at, updated_at) desc, id) from paged), '[]'::jsonb),
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
    'filled_count', progress.filled_count,
    'total_count', progress.total_count,
    'progress_percent', case when progress.total_count = 0 then 0 else round(progress.filled_count * 100.0 / progress.total_count)::integer end,
    'progress_status', case
      when progress.total_count = 0 then 'Belum terpetakan'
      when progress.filled_count = 0 then 'Kosong'
      when progress.filled_count = progress.total_count then 'Lengkap'
      else 'Terisi Sebagian'
    end,
    'archived_at', submission.archived_at,
    'archive_reason', submission.archive_reason,
    'payload', submission.payload,
    'expected_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', item.name,
        'filled', public.submission_item_is_filled(submission.payload, item.name)
      ) order by item.name)
      from public.item_profiles as profile
      join public.profile_items as profile_item on profile_item.item_profile_id = profile.id and profile_item.active
      join public.items as item on item.id = profile_item.item_id and item.active
      where profile.id = subtype.item_profile_id
        and profile.active
    ), '[]'::jsonb),
    'qc_pending_count', (
      select count(*)
      from public.product_proposals as proposal
      where proposal.submission_id = submission.id
        and proposal.status = 'PENDING'
    )
  ) into v_result
  from public.submissions as submission
  join public.stations as station on station.id = submission.station_id
  join public.sites as site on site.id = submission.site_id
  join public.site_types as site_type on site_type.id = site.site_type_id
  join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
  left join lateral public.submission_progress(submission.payload, subtype.item_profile_id) as progress on true
  where submission.id = p_submission_id;

  if v_result is null then
    raise exception 'Submission does not exist.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.admin_archive_submission(
  p_submission_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_submission public.submissions%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  v_admin_id := public.require_super_admin();
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'Archive reason is too long.' using errcode = '22023';
  end if;
  select * into v_submission
  from public.submissions as submission
  where submission.id = p_submission_id
  for update;
  if not found then
    raise exception 'Submission does not exist.' using errcode = 'P0002';
  end if;
  if v_submission.archived_at is not null then return false; end if;
  if v_submission.locked_by_session_id is not null
     and v_submission.lock_last_activity_at is not null
     and v_submission.lock_last_activity_at >= now() - interval '5 minutes' then
    raise exception 'Submission has an active editor lock.' using errcode = '55000';
  end if;

  update public.submissions as submission
  set archived_at = now(),
      archived_by = v_admin_id,
      archive_reason = v_reason,
      locked_by_session_id = null,
      lock_operator_name = null,
      lock_last_activity_at = null
  where submission.id = p_submission_id;

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'SUBMISSION_ARCHIVE', 'submission', p_submission_id,
    jsonb_build_object(
      'submission_id', v_submission.id,
      'station_id', v_submission.station_id,
      'site_id', v_submission.site_id,
      'site_subtype_id', v_submission.site_subtype_id,
      'reason', v_reason
    )
  );
  return true;
end;
$$;

create or replace function public.admin_restore_submission(p_submission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_submission public.submissions%rowtype;
  v_reason text;
begin
  v_admin_id := public.require_super_admin();
  select * into v_submission
  from public.submissions as submission
  where submission.id = p_submission_id
  for update;
  if not found then
    raise exception 'Submission does not exist.' using errcode = 'P0002';
  end if;
  if v_submission.archived_at is null then return false; end if;
  v_reason := v_submission.archive_reason;

  update public.submissions as submission
  set archived_at = null,
      archived_by = null,
      archive_reason = null
  where submission.id = p_submission_id;

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'SUBMISSION_RESTORE', 'submission', p_submission_id,
    jsonb_build_object(
      'submission_id', v_submission.id,
      'station_id', v_submission.station_id,
      'site_id', v_submission.site_id,
      'site_subtype_id', v_submission.site_subtype_id,
      'reason', v_reason
    )
  );
  return true;
end;
$$;

create or replace function public.prevent_archived_submission_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is not null and new.archived_at is not null and (
    new.payload is distinct from old.payload
    or new.version is distinct from old.version
    or new.operator_name is distinct from old.operator_name
    or new.locked_by_session_id is distinct from old.locked_by_session_id
    or new.lock_operator_name is distinct from old.lock_operator_name
    or new.lock_last_activity_at is distinct from old.lock_last_activity_at
    or new.last_saved_at is distinct from old.last_saved_at
  ) then
    raise exception 'Archived submission is read-only.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger submissions_prevent_archived_mutation
before update on public.submissions
for each row execute function public.prevent_archived_submission_mutation();

create or replace function public.get_submission_state(
  p_site_id uuid,
  p_site_subtype_id uuid
)
returns table (
  submission_id uuid,
  payload jsonb,
  version integer,
  lock_operator_name text,
  lock_last_activity_at timestamptz,
  last_saved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
begin
  v_station_id := public.require_submission_scope(p_site_id, p_site_subtype_id);
  return query
  select submission.id, submission.payload, submission.version,
    submission.lock_operator_name, submission.lock_last_activity_at,
    submission.last_saved_at
  from public.submissions as submission
  where submission.station_id = v_station_id
    and submission.site_id = p_site_id
    and submission.site_subtype_id = p_site_subtype_id
    and submission.archived_at is null;
end;
$$;

revoke all on function public.submission_item_is_filled(jsonb, text) from public, anon, authenticated;
revoke all on function public.submission_progress(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.admin_list_submissions(integer, integer, text, uuid, uuid, text, text, text) from public, anon;
revoke all on function public.admin_get_submission_detail(uuid) from public, anon;
revoke all on function public.admin_archive_submission(uuid, text) from public, anon;
revoke all on function public.admin_restore_submission(uuid) from public, anon;
revoke all on function public.prevent_archived_submission_mutation() from public, anon, authenticated;

grant execute on function public.admin_list_submissions(integer, integer, text, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.admin_get_submission_detail(uuid) to authenticated;
grant execute on function public.admin_archive_submission(uuid, text) to authenticated;
grant execute on function public.admin_restore_submission(uuid) to authenticated;
