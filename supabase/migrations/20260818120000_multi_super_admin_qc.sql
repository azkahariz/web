alter table public.super_admins
  add column if not exists display_name text;

create policy super_admins_select_admin_directory
on public.super_admins for select to authenticated
using (public.is_super_admin());

create or replace function public.admin_approve_product_proposal_v2(
  p_proposal_id uuid,
  p_canonical_brand text,
  p_canonical_model text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_proposal public.product_proposals%rowtype;
  v_product_id uuid;
  v_reviewer_name text;
begin
  v_admin_id := public.require_super_admin();
  if nullif(btrim(p_canonical_brand), '') is null or nullif(btrim(p_canonical_model), '') is null then
    raise exception 'Canonical brand and model are required.' using errcode = '22023';
  end if;

  select * into v_proposal
  from public.product_proposals as proposal
  where proposal.id = p_proposal_id
  for update;

  if not found then
    raise exception 'Product proposal was not found.' using errcode = '22023';
  end if;

  if v_proposal.status <> 'PENDING' then
    select coalesce(nullif(btrim(admin.display_name), ''), admin.username)
      into v_reviewer_name
    from public.super_admins as admin
    where admin.auth_user_id = v_proposal.reviewed_by;

    return jsonb_build_object(
      'outcome', 'conflict',
      'action', 'APPROVED',
      'processedProposalIds', '[]'::jsonb,
      'processedCount', 0,
      'conflicts', jsonb_build_array(jsonb_build_object(
        'proposalId', v_proposal.id,
        'currentStatus', v_proposal.status,
        'reviewerAuthUserId', v_proposal.reviewed_by,
        'reviewerDisplayName', v_reviewer_name,
        'reviewedAt', v_proposal.reviewed_at
      ))
    );
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
  where proposal.id = p_proposal_id
    and proposal.status = 'PENDING';

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'QC_APPROVE', 'product_proposal', p_proposal_id,
    jsonb_build_object('product_id', v_product_id, 'brand', btrim(p_canonical_brand), 'model', btrim(p_canonical_model))
  );

  return jsonb_build_object(
    'outcome', 'processed',
    'action', 'APPROVED',
    'productId', v_product_id,
    'processedProposalIds', jsonb_build_array(p_proposal_id),
    'processedCount', 1,
    'conflicts', '[]'::jsonb
  );
end;
$$;

create or replace function public.admin_merge_product_proposals_v2(
  p_proposal_ids uuid[],
  p_product_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_requested_ids uuid[];
  v_processed_ids uuid[];
  v_conflicts jsonb;
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

  select array_agg(requested.id order by requested.id)
    into v_requested_ids
  from (select distinct unnest(p_proposal_ids) as id) as requested;

  perform proposal.id
  from public.product_proposals as proposal
  where proposal.id = any(v_requested_ids)
  order by proposal.id
  for update;

  select coalesce(array_agg(proposal.id order by proposal.id)
    filter (where proposal.status = 'PENDING'), '{}'::uuid[])
    into v_processed_ids
  from public.product_proposals as proposal
  where proposal.id = any(v_requested_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
      'proposalId', requested.id,
      'currentStatus', coalesce(proposal.status, 'NOT_FOUND'),
      'reviewerAuthUserId', proposal.reviewed_by,
      'reviewerDisplayName', coalesce(nullif(btrim(admin.display_name), ''), admin.username),
      'reviewedAt', proposal.reviewed_at
    ) order by requested.id) filter (where proposal.id is null or proposal.status <> 'PENDING'), '[]'::jsonb)
    into v_conflicts
  from unnest(v_requested_ids) as requested(id)
  left join public.product_proposals as proposal on proposal.id = requested.id
  left join public.super_admins as admin on admin.auth_user_id = proposal.reviewed_by;

  v_count := coalesce(array_length(v_processed_ids, 1), 0);
  if v_count > 0 then
    insert into public.product_aliases (
      product_id, brand_alias, model_alias, normalized_brand, normalized_model, source_proposal_id
    )
    select p_product_id, proposal.proposed_brand, proposal.proposed_model,
      proposal.normalized_brand, proposal.normalized_model, proposal.id
    from public.product_proposals as proposal
    where proposal.id = any(v_processed_ids)
    on conflict (product_id, normalized_brand, normalized_model) do nothing;

    update public.product_proposals as proposal
    set status = 'MERGED', resolved_product_id = p_product_id,
        reviewed_by = v_admin_id, reviewed_at = now(), review_note = nullif(btrim(p_review_note), '')
    where proposal.id = any(v_processed_ids)
      and proposal.status = 'PENDING';

    v_action := case when v_count > 1 then 'QC_BULK_MERGE' else 'QC_MERGE' end;
    insert into public.admin_audit_log (
      admin_auth_user_id, action, target_type, target_id, metadata
    ) values (
      v_admin_id, v_action, 'product', p_product_id,
      jsonb_build_object(
        'proposal_ids', to_jsonb(v_processed_ids),
        'requested_proposal_ids', to_jsonb(v_requested_ids),
        'count', v_count,
        'conflict_count', jsonb_array_length(v_conflicts)
      )
    );
  end if;

  return jsonb_build_object(
    'outcome', case
      when v_count = 0 then 'conflict'
      when jsonb_array_length(v_conflicts) > 0 then 'partial'
      else 'processed'
    end,
    'action', 'MERGED',
    'productId', p_product_id,
    'processedProposalIds', to_jsonb(v_processed_ids),
    'processedCount', v_count,
    'conflicts', v_conflicts
  );
end;
$$;

create or replace function public.admin_reject_product_proposal_v2(
  p_proposal_id uuid,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_proposal public.product_proposals%rowtype;
  v_reviewer_name text;
begin
  v_admin_id := public.require_super_admin();
  if nullif(btrim(p_review_note), '') is null then
    raise exception 'Review note is required.' using errcode = '22023';
  end if;

  select * into v_proposal
  from public.product_proposals as proposal
  where proposal.id = p_proposal_id
  for update;

  if not found then
    raise exception 'Product proposal was not found.' using errcode = '22023';
  end if;

  if v_proposal.status <> 'PENDING' then
    select coalesce(nullif(btrim(admin.display_name), ''), admin.username)
      into v_reviewer_name
    from public.super_admins as admin
    where admin.auth_user_id = v_proposal.reviewed_by;

    return jsonb_build_object(
      'outcome', 'conflict',
      'action', 'REJECTED',
      'processedProposalIds', '[]'::jsonb,
      'processedCount', 0,
      'conflicts', jsonb_build_array(jsonb_build_object(
        'proposalId', v_proposal.id,
        'currentStatus', v_proposal.status,
        'reviewerAuthUserId', v_proposal.reviewed_by,
        'reviewerDisplayName', v_reviewer_name,
        'reviewedAt', v_proposal.reviewed_at
      ))
    );
  end if;

  update public.product_proposals as proposal
  set status = 'REJECTED', reviewed_by = v_admin_id,
      reviewed_at = now(), review_note = btrim(p_review_note)
  where proposal.id = p_proposal_id
    and proposal.status = 'PENDING';

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'QC_REJECT', 'product_proposal', p_proposal_id,
    jsonb_build_object('reason', btrim(p_review_note))
  );

  return jsonb_build_object(
    'outcome', 'processed',
    'action', 'REJECTED',
    'processedProposalIds', jsonb_build_array(p_proposal_id),
    'processedCount', 1,
    'conflicts', '[]'::jsonb
  );
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
  v_result jsonb;
begin
  v_result := public.admin_approve_product_proposal_v2(
    p_proposal_id, p_canonical_brand, p_canonical_model, p_review_note
  );
  if v_result->>'outcome' <> 'processed' then
    raise exception 'Product proposal has already been processed.' using errcode = '40001';
  end if;
  return (v_result->>'productId')::uuid;
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
  v_result jsonb;
begin
  v_result := public.admin_merge_product_proposals_v2(
    p_proposal_ids, p_product_id, p_review_note
  );
  return (v_result->>'processedCount')::integer;
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
  v_result jsonb;
begin
  v_result := public.admin_reject_product_proposal_v2(p_proposal_id, p_review_note);
  return v_result->>'outcome' = 'processed';
end;
$$;

revoke all on function public.admin_approve_product_proposal_v2(uuid, text, text, text) from public, anon;
revoke all on function public.admin_merge_product_proposals_v2(uuid[], uuid, text) from public, anon;
revoke all on function public.admin_reject_product_proposal_v2(uuid, text) from public, anon;
grant execute on function public.admin_approve_product_proposal_v2(uuid, text, text, text) to authenticated;
grant execute on function public.admin_merge_product_proposals_v2(uuid[], uuid, text) to authenticated;
grant execute on function public.admin_reject_product_proposal_v2(uuid, text) to authenticated;
