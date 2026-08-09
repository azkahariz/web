alter table public.products
  add column source_origin text not null default 'SPREADSHEET'
    check (source_origin in ('SPREADSHEET', 'QC')),
  add column spreadsheet_synced boolean not null default true;

create table public.super_admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null check (btrim(username) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index super_admins_username_key
  on public.super_admins (lower(btrim(username)));

create table public.product_proposals (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  submission_id uuid references public.submissions(id) on delete set null,
  created_by_auth_user uuid not null references auth.users(id) on delete restrict,
  operator_name text check (operator_name is null or char_length(operator_name) <= 120),
  proposed_brand text not null check (btrim(proposed_brand) <> ''),
  proposed_model text not null check (btrim(proposed_model) <> ''),
  normalized_brand text not null,
  normalized_model text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'MERGED', 'REJECTED')),
  resolved_product_id uuid references public.products(id) on delete restrict,
  proposal_note text,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_proposals_station_status_idx
  on public.product_proposals (station_id, status, created_at desc);
create index product_proposals_normalized_idx
  on public.product_proposals (normalized_brand, normalized_model);

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  brand_alias text not null check (btrim(brand_alias) <> ''),
  model_alias text not null check (btrim(model_alias) <> ''),
  normalized_brand text not null,
  normalized_model text not null,
  source_proposal_id uuid references public.product_proposals(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (product_id, normalized_brand, normalized_model)
);
create index product_aliases_normalized_idx
  on public.product_aliases (normalized_brand, normalized_model);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_auth_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (btrim(action) <> ''),
  target_type text not null check (btrim(target_type) <> ''),
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

create trigger super_admins_touch_updated_at
before update on public.super_admins
for each row execute function public.touch_master_updated_at();
create trigger product_proposals_touch_updated_at
before update on public.product_proposals
for each row execute function public.touch_master_updated_at();

alter table public.super_admins enable row level security;
alter table public.product_proposals enable row level security;
alter table public.product_aliases enable row level security;
alter table public.admin_audit_log enable row level security;

create or replace function public.normalize_product_text(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(lower(btrim(p_value)), '[^a-z0-9]+', '', 'g')
$$;

create or replace function public.is_super_admin(p_auth_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.super_admins as admin
    where admin.auth_user_id = p_auth_user_id
      and admin.active
  )
$$;

create or replace function public.require_super_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null or not public.is_super_admin(v_admin_id) then
    raise exception 'Active super admin account is required.' using errcode = '42501';
  end if;
  return v_admin_id;
end;
$$;

create policy super_admins_select_self
on public.super_admins for select to authenticated
using (auth_user_id = (select auth.uid()));

create policy products_select_active_or_admin
on public.products for select to authenticated
using (active or public.is_super_admin());

create policy product_aliases_select_authenticated
on public.product_aliases for select to authenticated
using (true);

create policy product_proposals_select_station_or_admin
on public.product_proposals for select to authenticated
using (station_id = public.current_station_id() or public.is_super_admin());

create policy admin_audit_log_select_admin
on public.admin_audit_log for select to authenticated
using (public.is_super_admin());

create policy station_accounts_select_admin
on public.station_accounts for select to authenticated
using (public.is_super_admin());

create policy submissions_select_admin
on public.submissions for select to authenticated
using (public.is_super_admin());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'stations', 'site_types', 'sites', 'item_profiles', 'site_subtypes',
    'items', 'profile_items', 'product_categories'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_super_admin())',
      table_name || '_select_admin',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.create_product_proposal(
  p_site_id uuid,
  p_site_subtype_id uuid,
  p_brand text,
  p_model text,
  p_operator_name text default null,
  p_note text default null
)
returns table (proposal_id uuid, proposal_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
  v_submission_id uuid;
  v_proposal_id uuid;
begin
  v_station_id := public.require_submission_scope(p_site_id, p_site_subtype_id);
  if nullif(btrim(p_brand), '') is null or nullif(btrim(p_model), '') is null then
    raise exception 'Brand and model are required.' using errcode = '22023';
  end if;

  select submission.id into v_submission_id
  from public.submissions as submission
  where submission.station_id = v_station_id
    and submission.site_id = p_site_id
    and submission.site_subtype_id = p_site_subtype_id;

  insert into public.product_proposals (
    station_id, submission_id, created_by_auth_user, operator_name,
    proposed_brand, proposed_model, normalized_brand, normalized_model, proposal_note
  ) values (
    v_station_id, v_submission_id, auth.uid(), nullif(btrim(p_operator_name), ''),
    btrim(p_brand), btrim(p_model), public.normalize_product_text(p_brand),
    public.normalize_product_text(p_model), nullif(btrim(p_note), '')
  ) returning id into v_proposal_id;

  return query select v_proposal_id, 'PENDING'::text;
end;
$$;

create or replace function public.admin_open_submission(
  p_submission_id uuid,
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
  v_admin_id uuid;
  v_submission public.submissions%rowtype;
begin
  v_admin_id := public.require_super_admin();
  if p_session_id is null then
    raise exception 'Session ID is required.' using errcode = '22023';
  end if;

  select * into v_submission
  from public.submissions as submission
  where submission.id = p_submission_id
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
        lock_operator_name = coalesce(nullif(btrim(p_operator_name), ''), 'Super Admin'),
        lock_last_activity_at = now()
    where submission.id = p_submission_id
    returning * into v_submission;
  end if;

  return query select
    v_submission.id, v_submission.payload, v_submission.version,
    v_submission.locked_by_session_id = p_session_id,
    v_submission.locked_by_session_id is not null
      and v_submission.locked_by_session_id <> p_session_id,
    v_submission.lock_operator_name, v_submission.lock_last_activity_at,
    v_submission.last_saved_at;
end;
$$;

create or replace function public.admin_get_submission_state(p_submission_id uuid)
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
begin
  perform public.require_super_admin();
  return query
  select submission.id, submission.payload, submission.version,
    submission.lock_operator_name, submission.lock_last_activity_at,
    submission.last_saved_at
  from public.submissions as submission
  where submission.id = p_submission_id;
end;
$$;

create or replace function public.admin_touch_submission_lock(
  p_submission_id uuid,
  p_session_id uuid,
  p_operator_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  update public.submissions as submission
  set lock_last_activity_at = now(),
      lock_operator_name = coalesce(nullif(btrim(p_operator_name), ''), 'Super Admin')
  where submission.id = p_submission_id
    and submission.locked_by_session_id = p_session_id
    and submission.lock_last_activity_at >= now() - interval '5 minutes';
  return found;
end;
$$;

create or replace function public.admin_release_submission_lock(
  p_submission_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  update public.submissions as submission
  set locked_by_session_id = null,
      lock_operator_name = null,
      lock_last_activity_at = null
  where submission.id = p_submission_id
    and submission.locked_by_session_id = p_session_id;
  return found;
end;
$$;

create or replace function public.admin_save_submission(
  p_submission_id uuid,
  p_session_id uuid,
  p_expected_version integer,
  p_payload jsonb,
  p_operator_name text default null
)
returns table (status text, version integer, last_saved_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_submission public.submissions%rowtype;
begin
  v_admin_id := public.require_super_admin();
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload must be a JSON object.' using errcode = '22023';
  end if;

  select * into v_submission
  from public.submissions as submission
  where submission.id = p_submission_id
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
      operator_name = coalesce(nullif(btrim(p_operator_name), ''), 'Super Admin'),
      lock_operator_name = coalesce(nullif(btrim(p_operator_name), ''), 'Super Admin'),
      lock_last_activity_at = now(),
      last_saved_at = now()
  where submission.id = p_submission_id
  returning submission.version, submission.last_saved_at
  into v_submission.version, v_submission.last_saved_at;

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'ADMIN_EDIT_SUBMISSION', 'submission', p_submission_id,
    jsonb_build_object('version', v_submission.version)
  );
  return query select 'saved'::text, v_submission.version, v_submission.last_saved_at;
end;
$$;

create or replace function public.admin_force_release_submission(p_submission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_old_session uuid;
begin
  v_admin_id := public.require_super_admin();
  select submission.locked_by_session_id into v_old_session
  from public.submissions as submission
  where submission.id = p_submission_id
  for update;
  if not found then
    raise exception 'Submission does not exist.' using errcode = 'P0002';
  end if;

  update public.submissions as submission
  set locked_by_session_id = null,
      lock_operator_name = null,
      lock_last_activity_at = null
  where submission.id = p_submission_id;
  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'FORCE_RELEASE_LOCK', 'submission', p_submission_id,
    jsonb_build_object('had_lock', v_old_session is not null)
  );
  return v_old_session is not null;
end;
$$;

create or replace function public.admin_force_takeover_submission(
  p_submission_id uuid,
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
  v_admin_id uuid;
  v_submission public.submissions%rowtype;
  v_previous_operator text;
begin
  v_admin_id := public.require_super_admin();
  if p_session_id is null then
    raise exception 'Session ID is required.' using errcode = '22023';
  end if;
  select * into v_submission
  from public.submissions as submission
  where submission.id = p_submission_id
  for update;
  if not found then
    raise exception 'Submission does not exist.' using errcode = 'P0002';
  end if;
  v_previous_operator := v_submission.lock_operator_name;

  update public.submissions as submission
  set locked_by_session_id = p_session_id,
      lock_operator_name = coalesce(nullif(btrim(p_operator_name), ''), 'Super Admin'),
      lock_last_activity_at = now()
  where submission.id = p_submission_id
  returning * into v_submission;

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'FORCE_TAKEOVER_LOCK', 'submission', p_submission_id,
    jsonb_build_object('previous_operator', v_previous_operator)
  );
  return query select true, v_submission.payload, v_submission.version,
    v_submission.lock_operator_name, v_submission.lock_last_activity_at,
    v_submission.last_saved_at;
end;
$$;

create or replace function public.admin_approve_product_proposal(
  p_proposal_id uuid,
  p_canonical_brand text,
  p_canonical_model text,
  p_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_proposal public.product_proposals%rowtype;
  v_product_id uuid;
begin
  v_admin_id := public.require_super_admin();
  if nullif(btrim(p_canonical_brand), '') is null or nullif(btrim(p_canonical_model), '') is null then
    raise exception 'Canonical brand and model are required.' using errcode = '22023';
  end if;
  select * into v_proposal
  from public.product_proposals as proposal
  where proposal.id = p_proposal_id
  for update;
  if not found or v_proposal.status <> 'PENDING' then
    raise exception 'Pending proposal is required.' using errcode = '22023';
  end if;

  insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
  values (btrim(p_canonical_brand), btrim(p_canonical_model), true, 'QC', false)
  returning id into v_product_id;

  insert into public.product_aliases (
    product_id, brand_alias, model_alias, normalized_brand, normalized_model, source_proposal_id
  ) values (
    v_product_id, v_proposal.proposed_brand, v_proposal.proposed_model,
    v_proposal.normalized_brand, v_proposal.normalized_model, v_proposal.id
  ) on conflict (product_id, normalized_brand, normalized_model) do nothing;

  update public.product_proposals as proposal
  set status = 'APPROVED', resolved_product_id = v_product_id,
      reviewed_by = v_admin_id, reviewed_at = now(), review_note = nullif(btrim(p_review_note), '')
  where proposal.id = p_proposal_id;

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'QC_APPROVE', 'product_proposal', p_proposal_id,
    jsonb_build_object('product_id', v_product_id, 'brand', btrim(p_canonical_brand), 'model', btrim(p_canonical_model))
  );
  return v_product_id;
end;
$$;

create or replace function public.admin_merge_product_proposals(
  p_proposal_ids uuid[],
  p_product_id uuid,
  p_review_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_count integer;
  v_action text;
begin
  v_admin_id := public.require_super_admin();
  if coalesce(array_length(p_proposal_ids, 1), 0) = 0 then
    raise exception 'At least one proposal is required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.products as product where product.id = p_product_id and product.active) then
    raise exception 'Active canonical product is required.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_proposal_ids) as requested(id)
    left join public.product_proposals as proposal on proposal.id = requested.id
    where proposal.id is null or proposal.status <> 'PENDING'
  ) then
    raise exception 'All proposals must be pending.' using errcode = '22023';
  end if;

  insert into public.product_aliases (
    product_id, brand_alias, model_alias, normalized_brand, normalized_model, source_proposal_id
  )
  select p_product_id, proposal.proposed_brand, proposal.proposed_model,
    proposal.normalized_brand, proposal.normalized_model, proposal.id
  from public.product_proposals as proposal
  where proposal.id = any(p_proposal_ids)
  on conflict (product_id, normalized_brand, normalized_model) do nothing;

  update public.product_proposals as proposal
  set status = 'MERGED', resolved_product_id = p_product_id,
      reviewed_by = v_admin_id, reviewed_at = now(), review_note = nullif(btrim(p_review_note), '')
  where proposal.id = any(p_proposal_ids)
    and proposal.status = 'PENDING';
  get diagnostics v_count = row_count;
  v_action := case when v_count > 1 then 'QC_BULK_MERGE' else 'QC_MERGE' end;

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, v_action, 'product', p_product_id,
    jsonb_build_object('proposal_ids', to_jsonb(p_proposal_ids), 'count', v_count)
  );
  return v_count;
end;
$$;

create or replace function public.admin_reject_product_proposal(
  p_proposal_id uuid,
  p_review_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
begin
  v_admin_id := public.require_super_admin();
  if nullif(btrim(p_review_note), '') is null then
    raise exception 'Review note is required.' using errcode = '22023';
  end if;
  update public.product_proposals as proposal
  set status = 'REJECTED', reviewed_by = v_admin_id,
      reviewed_at = now(), review_note = btrim(p_review_note)
  where proposal.id = p_proposal_id and proposal.status = 'PENDING';
  if not found then return false; end if;
  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'QC_REJECT', 'product_proposal', p_proposal_id,
    jsonb_build_object('reason', btrim(p_review_note))
  );
  return true;
end;
$$;

create or replace function public.admin_update_canonical_product(
  p_product_id uuid,
  p_brand text,
  p_model text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_old_brand text;
  v_old_model text;
begin
  v_admin_id := public.require_super_admin();
  if nullif(btrim(p_brand), '') is null or nullif(btrim(p_model), '') is null then
    raise exception 'Brand and model are required.' using errcode = '22023';
  end if;
  select product.brand, product.model into v_old_brand, v_old_model
  from public.products as product where product.id = p_product_id for update;
  if not found then return false; end if;
  update public.products as product
  set brand = btrim(p_brand), model = btrim(p_model), spreadsheet_synced = false
  where product.id = p_product_id;
  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'PRODUCT_CANONICAL_EDIT', 'product', p_product_id,
    jsonb_build_object('old_brand', v_old_brand, 'old_model', v_old_model,
      'new_brand', btrim(p_brand), 'new_model', btrim(p_model))
  );
  return true;
end;
$$;

revoke all on table public.super_admins from public, anon, authenticated;
revoke all on table public.product_proposals from public, anon, authenticated;
revoke all on table public.product_aliases from public, anon, authenticated;
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select on table public.super_admins, public.product_proposals,
  public.product_aliases, public.admin_audit_log to authenticated;
grant select on table public.products, public.stations, public.site_types,
  public.sites, public.item_profiles, public.site_subtypes, public.items,
  public.profile_items, public.product_categories to authenticated;

revoke all on function public.normalize_product_text(text) from public, anon;
revoke all on function public.is_super_admin(uuid) from public, anon;
revoke all on function public.require_super_admin() from public, anon, authenticated;
revoke all on function public.create_product_proposal(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_open_submission(uuid, uuid, text) from public, anon;
revoke all on function public.admin_get_submission_state(uuid) from public, anon;
revoke all on function public.admin_touch_submission_lock(uuid, uuid, text) from public, anon;
revoke all on function public.admin_release_submission_lock(uuid, uuid) from public, anon;
revoke all on function public.admin_save_submission(uuid, uuid, integer, jsonb, text) from public, anon;
revoke all on function public.admin_force_release_submission(uuid) from public, anon;
revoke all on function public.admin_force_takeover_submission(uuid, uuid, text) from public, anon;
revoke all on function public.admin_approve_product_proposal(uuid, text, text, text) from public, anon;
revoke all on function public.admin_merge_product_proposals(uuid[], uuid, text) from public, anon;
revoke all on function public.admin_reject_product_proposal(uuid, text) from public, anon;
revoke all on function public.admin_update_canonical_product(uuid, text, text) from public, anon;

grant execute on function public.normalize_product_text(text) to authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.create_product_proposal(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_open_submission(uuid, uuid, text) to authenticated;
grant execute on function public.admin_get_submission_state(uuid) to authenticated;
grant execute on function public.admin_touch_submission_lock(uuid, uuid, text) to authenticated;
grant execute on function public.admin_release_submission_lock(uuid, uuid) to authenticated;
grant execute on function public.admin_save_submission(uuid, uuid, integer, jsonb, text) to authenticated;
grant execute on function public.admin_force_release_submission(uuid) to authenticated;
grant execute on function public.admin_force_takeover_submission(uuid, uuid, text) to authenticated;
grant execute on function public.admin_approve_product_proposal(uuid, text, text, text) to authenticated;
grant execute on function public.admin_merge_product_proposals(uuid[], uuid, text) to authenticated;
grant execute on function public.admin_reject_product_proposal(uuid, text) to authenticated;
grant execute on function public.admin_update_canonical_product(uuid, text, text) to authenticated;

grant select, insert, update on table public.super_admins, public.product_proposals,
  public.product_aliases, public.admin_audit_log to service_role;
grant select, insert, update on table public.products to service_role;
