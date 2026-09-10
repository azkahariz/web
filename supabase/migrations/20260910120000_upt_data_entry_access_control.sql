create table public.upt_data_entry_access (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.upt_data_entry_access (singleton, enabled)
values (true, true);

alter table public.upt_data_entry_access enable row level security;

revoke all on table public.upt_data_entry_access from public, anon, authenticated;
grant select, insert, update on table public.upt_data_entry_access to service_role;

create or replace function public.assert_upt_data_entry_enabled()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
begin
  select access.enabled
  into v_enabled
  from public.upt_data_entry_access as access
  where access.singleton;

  if v_enabled is null then
    raise exception 'upt_data_entry_access_not_configured' using errcode = '55000';
  end if;
  if not v_enabled then
    raise exception 'upt_data_entry_closed' using
      errcode = '42501',
      hint = 'Data entry has been closed by a Super Admin.';
  end if;
end;
$$;

create or replace function public.get_upt_data_entry_status()
returns table (
  enabled boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_station_id() is null and not public.is_super_admin() then
    raise exception 'An active Station or Super Admin account is required.' using errcode = '42501';
  end if;

  return query
  select access.enabled, access.updated_at
  from public.upt_data_entry_access as access
  where access.singleton;

  if not found then
    raise exception 'upt_data_entry_access_not_configured' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.set_upt_data_entry_enabled(p_enabled boolean)
returns table (
  enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_previous boolean;
  v_updated_at timestamptz;
begin
  if p_enabled is null then
    raise exception 'Status akses wajib diisi.' using errcode = '22023';
  end if;

  v_admin := public.require_super_admin();

  select access.enabled
  into v_previous
  from public.upt_data_entry_access as access
  where access.singleton
  for update;

  if not found then
    raise exception 'upt_data_entry_access_not_configured' using errcode = '55000';
  end if;

  if v_previous is distinct from p_enabled then
    update public.upt_data_entry_access as access
    set enabled = p_enabled,
        updated_at = now(),
        updated_by = v_admin
    where access.singleton
    returning access.updated_at into v_updated_at;

    insert into public.admin_audit_log (
      admin_auth_user_id,
      action,
      target_type,
      target_id,
      metadata
    ) values (
      v_admin,
      case when p_enabled then 'UPT_DATA_ENTRY_OPENED' else 'UPT_DATA_ENTRY_CLOSED' end,
      'application_setting',
      null,
      jsonb_build_object(
        'setting', 'upt_data_entry_access',
        'previousEnabled', v_previous,
        'enabled', p_enabled
      )
    );
  else
    select access.updated_at
    into v_updated_at
    from public.upt_data_entry_access as access
    where access.singleton;
  end if;

  return query select p_enabled, v_updated_at;
end;
$$;

create or replace function public.require_submission_scope(
  p_site_id uuid,
  p_site_subtype_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
begin
  v_station_id := public.current_station_id();
  if v_station_id is null then
    raise exception 'Active station account is required.' using errcode = '42501';
  end if;

  perform public.assert_upt_data_entry_enabled();

  if not exists (
    select 1
    from public.sites as site
    where site.id = p_site_id
      and site.station_id = v_station_id
      and site.active
  ) then
    raise exception 'Site is outside the station account scope.' using errcode = '42501';
  end if;

  if not public.site_subtype_is_allowed(p_site_id, p_site_subtype_id) then
    raise exception 'site_subtype_not_allowed' using
      errcode = '22023',
      hint = 'Refresh the Site master and select an available subtype.';
  end if;

  return v_station_id;
end;
$$;

create or replace function public.release_submission_lock(
  p_site_id uuid,
  p_site_subtype_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
begin
  v_station_id := public.current_station_id();
  if v_station_id is null then
    raise exception 'Active station account is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.sites as site
    where site.id = p_site_id
      and site.station_id = v_station_id
      and site.active
  ) then
    raise exception 'Site is outside the station account scope.' using errcode = '42501';
  end if;

  if not public.site_subtype_is_allowed(p_site_id, p_site_subtype_id) then
    raise exception 'site_subtype_not_allowed' using
      errcode = '22023',
      hint = 'Refresh the Site master and select an available subtype.';
  end if;

  update public.submissions as submission
  set locked_by_session_id = null,
      lock_operator_name = null,
      lock_last_activity_at = null
  where submission.station_id = v_station_id
    and submission.site_id = p_site_id
    and submission.site_subtype_id = p_site_subtype_id
    and submission.locked_by_session_id = p_session_id;
  return found;
end;
$$;

revoke all on function public.assert_upt_data_entry_enabled() from public, anon, authenticated;
revoke all on function public.get_upt_data_entry_status() from public, anon;
revoke all on function public.set_upt_data_entry_enabled(boolean) from public, anon;
revoke all on function public.require_submission_scope(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_submission_lock(uuid, uuid, uuid) from public, anon;

grant execute on function public.get_upt_data_entry_status() to authenticated;
grant execute on function public.set_upt_data_entry_enabled(boolean) to authenticated;
grant execute on function public.release_submission_lock(uuid, uuid, uuid) to authenticated;

comment on table public.upt_data_entry_access is
  'Singleton authoritative switch for Station/UPT data-entry access. Defaults to enabled.';
comment on function public.get_upt_data_entry_status() is
  'Returns the authoritative Station/UPT data-entry status to an active Station or Super Admin account.';
comment on function public.set_upt_data_entry_enabled(boolean) is
  'Changes Station/UPT data-entry access and records the state transition in the Admin audit log.';
