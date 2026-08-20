-- Phase 4: dependency-aware, irreversible deletion for inactive orphan Products.

create or replace function public.product_delete_validation(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_snapshot jsonb;
  v_blockers jsonb;
  v_eligible boolean;
  v_preflight_token text;
begin
  select * into v_product
  from public.products as product
  where product.id = p_product_id;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'eligible', false,
      'productId', p_product_id,
      'blockers', jsonb_build_array(jsonb_build_object(
        'code', 'not_found',
        'message', 'Produk tidak ditemukan atau sudah dihapus.',
        'count', 0
      ))
    );
  end if;

  with direct_references as materialized (
    select * from public.product_direct_reference_rows(p_product_id)
  ), canonical_references as materialized (
    select submission.id as submission_id, submission.site_id, submission.archived_at,
      submission.locked_by_session_id is not null
        and submission.lock_last_activity_at >= now() - interval '5 minutes' as active_lock
    from public.submissions as submission
    cross join lateral jsonb_each(
      case when jsonb_typeof(coalesce(submission.payload, '{}'::jsonb) -> 'inventory') = 'object'
        then submission.payload -> 'inventory' else '{}'::jsonb end
    ) as category(key, value)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
    ) as item(value)
    left join public.product_proposals as proposal
      on proposal.id::text = nullif(item.value ->> 'productProposalId', '')
    where public.resolve_canonical_product_id(coalesce(
      nullif(item.value ->> 'productId', '')::uuid,
      case when proposal.status in ('APPROVED', 'MERGED') then proposal.resolved_product_id end
    )) = p_product_id
  ), qc_references as materialized (
    select proposal.id, proposal.status
    from public.product_proposals as proposal
    where proposal.resolved_product_id = p_product_id
  ), alias_references as materialized (
    select alias.id
    from public.product_aliases as alias
    where alias.product_id = p_product_id
  ), counts as (
    select
      (select count(*)::integer from direct_references where archived_at is null) as current_direct_reference_count,
      (select count(*)::integer from canonical_references where archived_at is null) as current_canonical_reference_count,
      (select count(distinct site_id)::integer from canonical_references where archived_at is null) as current_site_count,
      (select count(distinct submission_id)::integer from canonical_references where archived_at is null) as current_submission_count,
      (select count(*)::integer from direct_references where archived_at is not null) as archived_direct_reference_count,
      (select count(*)::integer from canonical_references where archived_at is not null) as archived_canonical_reference_count,
      (select count(*)::integer from qc_references) as resolved_qc_proposal_count,
      (select count(*)::integer from qc_references where status = 'APPROVED') as approved_qc_count,
      (select count(*)::integer from qc_references where status = 'MERGED') as merged_qc_count,
      (select count(*)::integer from alias_references) as alias_count,
      (select count(*)::integer from public.products where merged_into_product_id = p_product_id) as merge_inbound_count,
      case when v_product.merged_into_product_id is null then 0 else 1 end as merge_outbound_count,
      (select count(distinct submission_id)::integer from canonical_references where archived_at is null and active_lock) as active_lock_count,
      (select count(*)::integer from public.admin_audit_log
        where target_type = 'product' and target_id = p_product_id) as historical_audit_count
  )
  select jsonb_build_object(
    'currentDirectReferenceCount', current_direct_reference_count,
    'currentCanonicalReferenceCount', current_canonical_reference_count,
    'currentSiteCount', current_site_count,
    'currentSubmissionCount', current_submission_count,
    'archivedDirectReferenceCount', archived_direct_reference_count,
    'archivedCanonicalReferenceCount', archived_canonical_reference_count,
    'resolvedQcProposalCount', resolved_qc_proposal_count,
    'approvedQcCount', approved_qc_count,
    'mergedQcCount', merged_qc_count,
    'aliasCount', alias_count,
    'mergeInboundCount', merge_inbound_count,
    'mergeOutboundCount', merge_outbound_count,
    'activeLockCount', active_lock_count,
    'historicalAuditCount', historical_audit_count
  ) into v_snapshot
  from counts;

  with blocker_rows(sort_order, code, message, count_value) as (
    select 10, 'deactivate_first', 'Nonaktifkan Produk terlebih dahulu sebelum menghapus permanen.', 1
      where v_product.active
    union all
    select 20, 'merged_source', 'Produk ini merupakan jejak penggabungan dan tidak dapat dihapus permanen.', 1
      where v_product.merged_into_product_id is not null
    union all
    select 30, 'merge_target', 'Produk ini menjadi tujuan penggabungan Product lain.',
      (v_snapshot ->> 'mergeInboundCount')::integer
      where (v_snapshot ->> 'mergeInboundCount')::integer > 0
    union all
    select 40, 'current_references', 'Produk masih digunakan oleh item inventaris aktif.',
      (v_snapshot ->> 'currentCanonicalReferenceCount')::integer
      where (v_snapshot ->> 'currentCanonicalReferenceCount')::integer > 0
    union all
    select 50, 'archived_references', 'Produk masih digunakan pada riwayat Submission yang diarsipkan.',
      (v_snapshot ->> 'archivedCanonicalReferenceCount')::integer
      where (v_snapshot ->> 'archivedCanonicalReferenceCount')::integer > 0
    union all
    select 60, 'qc_history', 'Produk masih menjadi hasil penyelesaian Product QC.',
      (v_snapshot ->> 'resolvedQcProposalCount')::integer
      where (v_snapshot ->> 'resolvedQcProposalCount')::integer > 0
    union all
    select 70, 'aliases', 'Produk masih memiliki alias yang harus dipertahankan.',
      (v_snapshot ->> 'aliasCount')::integer
      where (v_snapshot ->> 'aliasCount')::integer > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code,
    'message', message,
    'count', count_value
  ) order by sort_order), '[]'::jsonb)
  into v_blockers
  from blocker_rows;

  v_eligible := jsonb_array_length(v_blockers) = 0;
  if v_eligible then
    v_preflight_token := md5(concat_ws(':',
      v_product.id::text,
      v_product.brand,
      v_product.model,
      v_product.active::text,
      v_product.source_origin,
      v_product.spreadsheet_synced::text,
      coalesce(v_product.merged_into_product_id::text, ''),
      v_snapshot ->> 'currentDirectReferenceCount',
      v_snapshot ->> 'currentCanonicalReferenceCount',
      v_snapshot ->> 'archivedDirectReferenceCount',
      v_snapshot ->> 'archivedCanonicalReferenceCount',
      v_snapshot ->> 'resolvedQcProposalCount',
      v_snapshot ->> 'aliasCount',
      v_snapshot ->> 'mergeInboundCount',
      v_snapshot ->> 'mergeOutboundCount'
    ));
  end if;

  return jsonb_build_object(
    'status', case when v_eligible then 'ready' else 'blocked' end,
    'eligible', v_eligible,
    'preflightToken', v_preflight_token,
    'product', jsonb_build_object(
      'id', v_product.id,
      'brand', v_product.brand,
      'model', v_product.model,
      'active', v_product.active,
      'sourceOrigin', v_product.source_origin,
      'spreadsheetSynced', v_product.spreadsheet_synced,
      'mergedIntoProductId', v_product.merged_into_product_id
    ),
    'dependencies', v_snapshot,
    'blockers', v_blockers
  );
end;
$$;

create or replace function public.admin_product_delete_preflight(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return public.product_delete_validation(p_product_id);
end;
$$;

create or replace function public.admin_delete_product(
  p_product_id uuid,
  p_preflight_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_plan jsonb;
  v_product public.products%rowtype;
begin
  v_admin_id := public.require_super_admin();

  -- Match the Product Merge lock order, then block JSONB Submission writes while
  -- the authoritative dependency scan and deletion complete.
  lock table public.products in share row exclusive mode;
  lock table public.product_aliases in share row exclusive mode;
  lock table public.submissions in share row exclusive mode;

  select * into v_product
  from public.products as product
  where product.id = p_product_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'already_deleted',
      'eligible', false,
      'productId', p_product_id
    );
  end if;

  v_plan := public.product_delete_validation(p_product_id);
  if v_plan ->> 'status' <> 'ready' then
    return v_plan || jsonb_build_object(
      'status', 'state_changed',
      'eligible', false
    );
  end if;

  if nullif(p_preflight_token, '') is null
     or p_preflight_token <> v_plan ->> 'preflightToken' then
    return v_plan || jsonb_build_object(
      'status', 'state_changed',
      'eligible', false
    );
  end if;

  begin
    insert into public.admin_audit_log (
      admin_auth_user_id,
      action,
      target_type,
      target_id,
      metadata
    ) values (
      v_admin_id,
      'PRODUCT_DELETE',
      'product',
      v_product.id,
      jsonb_build_object(
        'product', v_plan -> 'product',
        'previousActive', v_product.active,
        'dependencies', v_plan -> 'dependencies',
        'reason', 'PERMANENT_DELETE',
        'irreversible', true
      )
    );

    delete from public.products
    where id = p_product_id;
  exception
    when foreign_key_violation then
      return v_plan || jsonb_build_object(
        'status', 'database_dependency',
        'eligible', false
      );
  end;

  return v_plan || jsonb_build_object(
    'status', 'deleted',
    'eligible', false,
    'preflightToken', null
  );
end;
$$;

revoke all on function public.product_delete_validation(uuid) from public, anon, authenticated;
revoke all on function public.admin_product_delete_preflight(uuid) from public, anon;
revoke all on function public.admin_delete_product(uuid, text) from public, anon;

grant execute on function public.admin_product_delete_preflight(uuid) to authenticated;
grant execute on function public.admin_delete_product(uuid, text) to authenticated;

comment on function public.product_delete_validation(uuid) is
  'Internal dependency scan for irreversible deletion of an inactive orphan Product.';
comment on function public.admin_product_delete_preflight(uuid) is
  'Read-only Super Admin preflight for dependency-aware permanent Product deletion.';
comment on function public.admin_delete_product(uuid, text) is
  'Atomically revalidates dependencies, writes a PRODUCT_DELETE snapshot, and permanently deletes one eligible Product.';
