create table public.station_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  station_id uuid not null unique references public.stations(id) on delete restrict,
  username text not null check (btrim(username) <> ''),
  role text not null default 'station' check (role = 'station'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index station_accounts_username_key
  on public.station_accounts (lower(btrim(username)));

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  site_subtype_id uuid not null references public.site_subtypes(id) on delete restrict,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  version integer not null default 0 check (version >= 0),
  operator_name text check (operator_name is null or char_length(operator_name) <= 120),
  locked_by_session_id uuid,
  lock_operator_name text check (lock_operator_name is null or char_length(lock_operator_name) <= 120),
  lock_last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_saved_at timestamptz,
  unique (station_id, site_id, site_subtype_id)
);
create index submissions_station_updated_idx
  on public.submissions (station_id, updated_at desc);
create index submissions_lock_activity_idx
  on public.submissions (lock_last_activity_at)
  where locked_by_session_id is not null;

create trigger station_accounts_touch_updated_at
before update on public.station_accounts
for each row execute function public.touch_master_updated_at();

create trigger submissions_touch_updated_at
before update on public.submissions
for each row execute function public.touch_master_updated_at();

alter table public.station_accounts enable row level security;
alter table public.submissions enable row level security;

create or replace function public.current_station_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select account.station_id
  from public.station_accounts as account
  where account.auth_user_id = (select auth.uid())
    and account.active
  limit 1
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

  if not exists (
    select 1
    from public.sites as site
    join public.site_subtypes as subtype
      on subtype.id = p_site_subtype_id
     and subtype.site_type_id = site.site_type_id
     and subtype.active
    where site.id = p_site_id
      and site.station_id = v_station_id
      and site.active
  ) then
    raise exception 'Site or subtype is outside the station account scope.' using errcode = '42501';
  end if;

  return v_station_id;
end;
$$;

create or replace function public.open_submission(
  p_site_id uuid,
  p_site_subtype_id uuid,
  p_session_id uuid,
  p_operator_name text default null
)
returns table (
  submission_id uuid,
  payload jsonb,
  version integer,
  can_edit boolean,
  can_takeover boolean,
  lock_operator_name text,
  lock_last_activity_at timestamptz,
  last_saved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
  v_submission public.submissions%rowtype;
  v_operator text := nullif(btrim(p_operator_name), '');
begin
  if p_session_id is null then
    raise exception 'Session ID is required.' using errcode = '22023';
  end if;
  if v_operator is not null and char_length(v_operator) > 120 then
    raise exception 'Operator name is too long.' using errcode = '22023';
  end if;

  v_station_id := public.require_submission_scope(p_site_id, p_site_subtype_id);

  insert into public.submissions (station_id, site_id, site_subtype_id)
  values (v_station_id, p_site_id, p_site_subtype_id)
  on conflict (station_id, site_id, site_subtype_id) do nothing;

  select * into v_submission
  from public.submissions as submission
  where submission.station_id = v_station_id
    and submission.site_id = p_site_id
    and submission.site_subtype_id = p_site_subtype_id
  for update;

  if v_submission.locked_by_session_id is null
     or v_submission.locked_by_session_id = p_session_id then
    update public.submissions as submission
    set locked_by_session_id = p_session_id,
        lock_operator_name = v_operator,
        lock_last_activity_at = now()
    where submission.id = v_submission.id
    returning * into v_submission;
  end if;

  return query select
    v_submission.id,
    v_submission.payload,
    v_submission.version,
    v_submission.locked_by_session_id = p_session_id,
    v_submission.locked_by_session_id is not null
      and v_submission.locked_by_session_id <> p_session_id
      and (v_submission.lock_last_activity_at is null
        or v_submission.lock_last_activity_at < now() - interval '5 minutes'),
    v_submission.lock_operator_name,
    v_submission.lock_last_activity_at,
    v_submission.last_saved_at;
end;
$$;

create or replace function public.takeover_submission_lock(
  p_site_id uuid,
  p_site_subtype_id uuid,
  p_session_id uuid,
  p_operator_name text default null
)
returns table (
  acquired boolean,
  payload jsonb,
  version integer,
  lock_operator_name text,
  lock_last_activity_at timestamptz,
  last_saved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
  v_submission public.submissions%rowtype;
  v_operator text := nullif(btrim(p_operator_name), '');
begin
  if p_session_id is null then
    raise exception 'Session ID is required.' using errcode = '22023';
  end if;
  v_station_id := public.require_submission_scope(p_site_id, p_site_subtype_id);

  select * into v_submission
  from public.submissions as submission
  where submission.station_id = v_station_id
    and submission.site_id = p_site_id
    and submission.site_subtype_id = p_site_subtype_id
  for update;

  if not found then
    raise exception 'Submission does not exist.' using errcode = 'P0002';
  end if;

  if v_submission.locked_by_session_id is null
     or v_submission.locked_by_session_id = p_session_id
     or v_submission.lock_last_activity_at is null
     or v_submission.lock_last_activity_at < now() - interval '5 minutes' then
    update public.submissions as submission
    set locked_by_session_id = p_session_id,
        lock_operator_name = v_operator,
        lock_last_activity_at = now()
    where submission.id = v_submission.id
    returning * into v_submission;

    return query select true, v_submission.payload, v_submission.version,
      v_submission.lock_operator_name, v_submission.lock_last_activity_at,
      v_submission.last_saved_at;
  else
    return query select false, v_submission.payload, v_submission.version,
      v_submission.lock_operator_name, v_submission.lock_last_activity_at,
      v_submission.last_saved_at;
  end if;
end;
$$;

create or replace function public.touch_submission_lock(
  p_site_id uuid,
  p_site_subtype_id uuid,
  p_session_id uuid,
  p_operator_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
begin
  v_station_id := public.require_submission_scope(p_site_id, p_site_subtype_id);
  update public.submissions as submission
  set lock_last_activity_at = now(),
      lock_operator_name = nullif(btrim(p_operator_name), '')
  where submission.station_id = v_station_id
    and submission.site_id = p_site_id
    and submission.site_subtype_id = p_site_subtype_id
    and submission.locked_by_session_id = p_session_id
    and submission.lock_last_activity_at >= now() - interval '5 minutes';
  return found;
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
  v_station_id := public.require_submission_scope(p_site_id, p_site_subtype_id);
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
    and submission.site_subtype_id = p_site_subtype_id;
end;
$$;

create or replace function public.save_submission(
  p_site_id uuid,
  p_site_subtype_id uuid,
  p_session_id uuid,
  p_expected_version integer,
  p_payload jsonb,
  p_operator_name text default null
)
returns table (
  status text,
  version integer,
  last_saved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
  v_submission public.submissions%rowtype;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload must be a JSON object.' using errcode = '22023';
  end if;
  v_station_id := public.require_submission_scope(p_site_id, p_site_subtype_id);

  select * into v_submission
  from public.submissions as submission
  where submission.station_id = v_station_id
    and submission.site_id = p_site_id
    and submission.site_subtype_id = p_site_subtype_id
  for update;

  if not found then
    return query select 'not_found'::text, 0, null::timestamptz;
    return;
  end if;
  if v_submission.locked_by_session_id <> p_session_id
     or v_submission.lock_last_activity_at is null
     or v_submission.lock_last_activity_at < now() - interval '5 minutes' then
    return query select 'lock_lost'::text, v_submission.version, v_submission.last_saved_at;
    return;
  end if;
  if v_submission.version <> p_expected_version then
    return query select 'version_conflict'::text, v_submission.version, v_submission.last_saved_at;
    return;
  end if;

  update public.submissions as submission
  set payload = p_payload,
      version = submission.version + 1,
      operator_name = nullif(btrim(p_operator_name), ''),
      lock_operator_name = nullif(btrim(p_operator_name), ''),
      lock_last_activity_at = now(),
      last_saved_at = now()
  where submission.id = v_submission.id
  returning submission.version, submission.last_saved_at
  into v_submission.version, v_submission.last_saved_at;

  return query select 'saved'::text, v_submission.version, v_submission.last_saved_at;
end;
$$;

create policy station_accounts_select_own
on public.station_accounts for select
to authenticated
using (auth_user_id = (select auth.uid()) and active);

create policy submissions_select_own_station
on public.submissions for select
to authenticated
using (station_id = public.current_station_id());

revoke all on table public.station_accounts from public, anon, authenticated;
revoke all on table public.submissions from public, anon, authenticated;
grant select on table public.station_accounts to authenticated;
grant select on table public.submissions to authenticated;
grant select, insert, update on table public.station_accounts to service_role;
grant select on table public.stations to service_role;

revoke all on function public.current_station_id() from public, anon;
revoke all on function public.require_submission_scope(uuid, uuid) from public, anon, authenticated;
revoke all on function public.open_submission(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.takeover_submission_lock(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.touch_submission_lock(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.release_submission_lock(uuid, uuid, uuid) from public, anon;
revoke all on function public.get_submission_state(uuid, uuid) from public, anon;
revoke all on function public.save_submission(uuid, uuid, uuid, integer, jsonb, text) from public, anon;

grant execute on function public.current_station_id() to authenticated;
grant execute on function public.open_submission(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.takeover_submission_lock(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.touch_submission_lock(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.release_submission_lock(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_submission_state(uuid, uuid) to authenticated;
grant execute on function public.save_submission(uuid, uuid, uuid, integer, jsonb, text) to authenticated;
