create or replace function public.reconcile_pending_product_proposals(
  p_station_id uuid,
  p_submission_id uuid,
  p_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_count integer;
begin
  with referenced_proposals as (
    select distinct lower(nullif(entry.value ->> 'productProposalId', '')) as proposal_id
    from jsonb_each(
      case when jsonb_typeof(coalesce(p_payload, '{}'::jsonb) -> 'inventory') = 'object'
        then p_payload -> 'inventory' else '{}'::jsonb end
    ) as category(key, value)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
    ) as entry(value)
    where jsonb_typeof(entry.value) = 'object'
      and nullif(entry.value ->> 'productProposalId', '') is not null
  )
  delete from public.product_proposals as proposal
  where proposal.station_id = p_station_id
    and proposal.submission_id = p_submission_id
    and proposal.status = 'PENDING'
    and not exists (
      select 1
      from referenced_proposals as referenced
      where referenced.proposal_id = proposal.id::text
    );

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
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

  perform public.reconcile_pending_product_proposals(v_station_id, v_submission.id, p_payload);

  return query select 'saved'::text, v_submission.version, v_submission.last_saved_at;
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

  perform public.reconcile_pending_product_proposals(v_submission.station_id, v_submission.id, p_payload);

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'ADMIN_EDIT_SUBMISSION', 'submission', p_submission_id,
    jsonb_build_object('version', v_submission.version)
  );
  return query select 'saved'::text, v_submission.version, v_submission.last_saved_at;
end;
$$;

revoke all on function public.reconcile_pending_product_proposals(uuid, uuid, jsonb) from public, anon, authenticated;

comment on function public.reconcile_pending_product_proposals(uuid, uuid, jsonb) is
  'Removes only unreferenced PENDING product proposals for one authorized submission after its payload is saved.';
