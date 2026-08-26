-- Allow a canonical Product created by QC approval to be merged safely.
-- The proposal remains the immutable QC record; only its canonical Product target moves.

create or replace function public.product_merge_validation_with_qc(
  p_source_product_id uuid,
  p_target_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  v_qc_count integer;
  v_qc_digest text;
begin
  v_plan := public.product_merge_validation(p_source_product_id, p_target_product_id);
  if v_plan ->> 'status' <> 'ready' then return v_plan; end if;

  select count(*)::integer,
    md5(coalesce(string_agg(concat_ws(':', proposal.id::text, proposal.status, proposal.resolved_product_id::text), '|' order by proposal.id), ''))
  into v_qc_count, v_qc_digest
  from public.product_proposals as proposal
  where proposal.status in ('APPROVED', 'MERGED')
    and proposal.resolved_product_id = p_source_product_id;

  return v_plan || jsonb_build_object(
    'preflightToken', md5(concat_ws(':', v_plan ->> 'preflightToken', v_qc_count::text, v_qc_digest)),
    'resolvedQcProposalCount', v_qc_count
  );
end;
$$;

create or replace function public.admin_product_merge_preflight(
  p_source_product_id uuid,
  p_target_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return public.product_merge_validation_with_qc(p_source_product_id, p_target_product_id);
end;
$$;

create or replace function public.admin_merge_product(
  p_source_product_id uuid,
  p_target_product_id uuid,
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
  v_source public.products%rowtype;
  v_target public.products%rowtype;
  v_submission public.submissions%rowtype;
  v_new_inventory jsonb;
  v_versions jsonb := '[]'::jsonb;
  v_alias_moved integer := 0;
  v_alias_deduped integer := 0;
  v_canonical_alias_created integer := 0;
  v_qc_repointed integer := 0;
begin
  v_admin_id := public.require_super_admin();

  lock table public.products in share row exclusive mode;
  lock table public.product_aliases in share row exclusive mode;
  lock table public.product_proposals in share row exclusive mode;
  lock table public.submissions in share row exclusive mode;

  perform product.id from public.products as product
  where product.id in (p_source_product_id, p_target_product_id)
  order by product.id for update;

  perform proposal.id from public.product_proposals as proposal
  where proposal.status in ('APPROVED', 'MERGED')
    and proposal.resolved_product_id = p_source_product_id
  order by proposal.id for update;

  perform submission.id
  from public.submissions as submission
  where submission.archived_at is null
    and exists (
      select 1
      from jsonb_each(case when jsonb_typeof(submission.payload -> 'inventory') = 'object'
        then submission.payload -> 'inventory' else '{}'::jsonb end) as category(key, value)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(category.value) = 'array'
        then category.value else '[]'::jsonb end) as item(value)
      where item.value ->> 'productId' = p_source_product_id::text
    )
  order by submission.id
  for update of submission;

  v_plan := public.product_merge_validation_with_qc(p_source_product_id, p_target_product_id);
  if v_plan ->> 'status' <> 'ready' then return v_plan; end if;
  if nullif(p_preflight_token, '') is null or p_preflight_token <> v_plan ->> 'preflightToken' then
    return v_plan || jsonb_build_object('status', 'state_changed');
  end if;

  select * into v_source from public.products where id = p_source_product_id;
  select * into v_target from public.products where id = (v_plan -> 'target' ->> 'id')::uuid;

  for v_submission in
    select submission.*
    from public.submissions as submission
    where submission.archived_at is null
      and exists (
        select 1
        from jsonb_each(case when jsonb_typeof(submission.payload -> 'inventory') = 'object'
          then submission.payload -> 'inventory' else '{}'::jsonb end) as category(key, value)
        cross join lateral jsonb_array_elements(case when jsonb_typeof(category.value) = 'array'
          then category.value else '[]'::jsonb end) as item(value)
        where item.value ->> 'productId' = p_source_product_id::text
      )
    order by submission.id
  loop
    select jsonb_object_agg(
      inventory.key,
      case when jsonb_typeof(inventory.value) = 'array' then (
        select coalesce(jsonb_agg(
          case when item.value ->> 'productId' = p_source_product_id::text
            then item.value || jsonb_build_object(
              'productId', v_target.id, 'brand', v_target.brand, 'model', v_target.model
            ) else item.value end
          order by item.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(inventory.value) with ordinality as item(value, ordinality)
      ) else inventory.value end
      order by inventory.key
    ) into v_new_inventory
    from jsonb_each(v_submission.payload -> 'inventory') as inventory(key, value);

    update public.submissions as submission
    set payload = jsonb_set(submission.payload, '{inventory}', v_new_inventory, false),
        version = submission.version + 1,
        last_saved_at = now()
    where submission.id = v_submission.id;

    v_versions := v_versions || jsonb_build_array(jsonb_build_object(
      'submissionId', v_submission.id,
      'oldVersion', v_submission.version,
      'newVersion', v_submission.version + 1
    ));
  end loop;

  update public.product_proposals
  set resolved_product_id = v_target.id
  where status in ('APPROVED', 'MERGED')
    and resolved_product_id = p_source_product_id;
  get diagnostics v_qc_repointed = row_count;
  if v_qc_repointed <> coalesce((v_plan ->> 'resolvedQcProposalCount')::integer, 0) then
    raise exception 'QC Product reference state changed during merge.' using errcode = '40001';
  end if;

  delete from public.product_aliases as source_alias
  using public.product_aliases as target_alias
  where source_alias.product_id = p_source_product_id
    and target_alias.product_id = v_target.id
    and target_alias.normalized_brand = source_alias.normalized_brand
    and target_alias.normalized_model = source_alias.normalized_model;
  get diagnostics v_alias_deduped = row_count;

  delete from public.product_aliases as source_alias
  where source_alias.product_id = p_source_product_id
    and source_alias.normalized_brand = public.normalize_product_text(v_target.brand)
    and source_alias.normalized_model = public.normalize_product_text(v_target.model);
  get diagnostics v_canonical_alias_created = row_count;
  v_alias_deduped := v_alias_deduped + v_canonical_alias_created;
  v_canonical_alias_created := 0;

  update public.product_aliases
  set product_id = v_target.id
  where product_id = p_source_product_id;
  get diagnostics v_alias_moved = row_count;

  if public.normalize_product_text(v_source.brand) <> public.normalize_product_text(v_target.brand)
     or public.normalize_product_text(v_source.model) <> public.normalize_product_text(v_target.model) then
    insert into public.product_aliases (
      product_id, brand_alias, model_alias, normalized_brand, normalized_model
    ) values (
      v_target.id, v_source.brand, v_source.model,
      public.normalize_product_text(v_source.brand), public.normalize_product_text(v_source.model)
    ) on conflict (product_id, normalized_brand, normalized_model) do nothing;
    get diagnostics v_canonical_alias_created = row_count;
  end if;

  update public.products
  set active = false,
      merged_into_product_id = v_target.id,
      spreadsheet_synced = false
  where id = p_source_product_id;

  insert into public.admin_audit_log (
    admin_auth_user_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id,
    'PRODUCT_MERGE',
    'product',
    p_source_product_id,
    jsonb_build_object(
      'sourceProduct', v_plan -> 'source',
      'targetProduct', v_plan -> 'target',
      'sourcePreviousActive', v_source.active,
      'sourceResult', jsonb_build_object('active', false, 'merged', true),
      'referenceCount', (v_plan ->> 'referenceCount')::integer,
      'unitCount', (v_plan ->> 'unitCount')::integer,
      'siteCount', (v_plan ->> 'siteCount')::integer,
      'submissionCount', (v_plan ->> 'submissionCount')::integer,
      'affectedSubmissions', v_plan -> 'submissionVersions',
      'submissionVersions', v_versions,
      'qcActions', jsonb_build_object('repointed', v_qc_repointed),
      'aliasActions', jsonb_build_object(
        'moved', v_alias_moved,
        'deduplicated', v_alias_deduped,
        'canonicalSourceAliasCreated', v_canonical_alias_created
      )
    )
  );

  return v_plan || jsonb_build_object(
    'status', 'merged',
    'submissionVersions', v_versions,
    'qcActions', jsonb_build_object('repointed', v_qc_repointed),
    'aliasActions', jsonb_build_object(
      'moved', v_alias_moved,
      'deduplicated', v_alias_deduped,
      'canonicalSourceAliasCreated', v_canonical_alias_created
    )
  );
end;
$$;

revoke all on function public.product_merge_validation_with_qc(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_product_merge_preflight(uuid, uuid) from public, anon;
revoke all on function public.admin_merge_product(uuid, uuid, text) from public, anon;
grant execute on function public.admin_product_merge_preflight(uuid, uuid) to authenticated;
grant execute on function public.admin_merge_product(uuid, uuid, text) to authenticated;

comment on function public.product_merge_validation_with_qc(uuid, uuid) is
  'Read-only Product Merge validation including resolved QC proposal state.';
comment on function public.admin_merge_product(uuid, uuid, text) is
  'Atomically moves direct current references, resolved QC Product targets, aliases, and records Product Merge audit.';
