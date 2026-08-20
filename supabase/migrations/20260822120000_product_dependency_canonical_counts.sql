-- Keep Product dependency summary aligned with admin_product_usage.
-- Read-only replacement: direct productId plus current resolved QC proposal references.
create or replace function public.admin_product_dependencies(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
begin
  perform public.require_super_admin();
  select * into v_product from public.products as product where product.id = p_product_id;
  if not found then
    raise exception 'Product was not found.' using errcode = 'P0002';
  end if;

  return (
    with direct_references as materialized (
      select * from public.product_direct_reference_rows(p_product_id)
    ),
    canonical_current_references as materialized (
      select submission.site_id, submission.id as submission_id,
        submission.locked_by_session_id is not null
          and submission.lock_last_activity_at >= now() - interval '5 minutes' as active_lock
      from public.submissions as submission
      cross join lateral jsonb_each(
        case when jsonb_typeof(coalesce(submission.payload, '{}'::jsonb) -> 'inventory') = 'object'
          then submission.payload -> 'inventory' else '{}'::jsonb end
      ) as category
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
      ) as item
      left join public.product_proposals as proposal
        on proposal.id::text = nullif(item.value ->> 'productProposalId', '')
      where submission.archived_at is null
        and (
          item.value ->> 'productId' = p_product_id::text
          or (
            proposal.status in ('APPROVED', 'MERGED')
            and proposal.resolved_product_id = p_product_id
          )
        )
    ),
    qc as materialized (
      select proposal.id, proposal.proposed_brand, proposal.proposed_model, proposal.status,
        proposal.resolved_product_id, proposal.reviewed_at, proposal.review_note,
        coalesce(nullif(btrim(admin.display_name), ''), admin.username) as reviewer_name
      from public.product_proposals as proposal
      left join public.super_admins as admin on admin.auth_user_id = proposal.reviewed_by
      where proposal.resolved_product_id = p_product_id
        and proposal.status in ('APPROVED', 'MERGED')
    ),
    aliases as materialized (
      select alias.id, alias.brand_alias, alias.model_alias, alias.normalized_brand,
        alias.normalized_model, alias.source_proposal_id, alias.created_at
      from public.product_aliases as alias
      where alias.product_id = p_product_id
    )
    select jsonb_build_object(
      'product', jsonb_build_object(
        'id', v_product.id, 'brand', v_product.brand, 'model', v_product.model,
        'active', v_product.active, 'sourceOrigin', v_product.source_origin,
        'spreadsheetSynced', v_product.spreadsheet_synced
      ),
      'preflight', jsonb_build_object(
        'productId', v_product.id,
        'currentDirectReferenceCount', (select count(*)::integer from direct_references where archived_at is null),
        'currentSiteCount', (select count(distinct site_id)::integer from canonical_current_references),
        'currentSubmissionCount', (select count(distinct submission_id)::integer from canonical_current_references),
        'archivedDirectReferenceCount', (select count(*)::integer from direct_references where archived_at is not null),
        'resolvedQcProposalCount', (select count(*)::integer from qc),
        'approvedQcCount', (select count(*)::integer from qc where status = 'APPROVED'),
        'mergedQcCount', (select count(*)::integer from qc where status = 'MERGED'),
        'aliasCount', (select count(*)::integer from aliases),
        'activeLockCount', (select count(distinct submission_id)::integer from canonical_current_references where active_lock),
        'mergeInboundCount', 0, 'mergeOutboundCount', 0
      ),
      'qcProposals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'proposalId', id, 'proposedBrand', proposed_brand, 'proposedModel', proposed_model,
          'status', status, 'resolvedProductId', resolved_product_id,
          'reviewerName', reviewer_name, 'reviewedAt', reviewed_at, 'reviewNote', review_note
        ) order by reviewed_at desc nulls last, id) from qc
      ), '[]'::jsonb),
      'aliases', coalesce((
        select jsonb_agg(jsonb_build_object(
          'aliasId', id, 'brand', brand_alias, 'model', model_alias,
          'normalizedBrand', normalized_brand, 'normalizedModel', normalized_model,
          'sourceProposalId', source_proposal_id, 'createdAt', created_at
        ) order by created_at desc, id) from aliases
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.admin_product_dependencies(uuid) from public, anon;
grant execute on function public.admin_product_dependencies(uuid) to authenticated;

comment on function public.admin_product_dependencies(uuid) is
  'Read-only Super Admin preflight using canonical direct and resolved current usage semantics.';
