-- Phase 3: atomically merge one historical Product identity into a canonical Product.

alter table public.products
  add column merged_into_product_id uuid;

alter table public.products
  add constraint products_merged_into_product_id_fkey
  foreign key (merged_into_product_id) references public.products(id) on delete restrict;

alter table public.products
  add constraint products_merge_not_self_check
  check (merged_into_product_id is null or merged_into_product_id <> id),
  add constraint products_merged_inactive_check
  check (merged_into_product_id is null or not active);

create index products_merged_into_product_id_idx
  on public.products (merged_into_product_id)
  where merged_into_product_id is not null;

create or replace function public.resolve_canonical_product_id(p_product_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current uuid := p_product_id;
  v_next uuid;
  v_seen uuid[] := '{}'::uuid[];
begin
  if v_current is null then return null; end if;
  loop
    if v_current = any(v_seen) or cardinality(v_seen) >= 100 then
      raise exception 'Product merge cycle detected.' using errcode = '23514';
    end if;
    v_seen := array_append(v_seen, v_current);
    select product.merged_into_product_id into v_next
    from public.products as product
    where product.id = v_current;
    if not found then return null; end if;
    if v_next is null then return v_current; end if;
    v_current := v_next;
  end loop;
end;
$$;

create or replace function public.resolve_canonical_products(p_product_ids uuid[])
returns table(product_id uuid, canonical_product_id uuid, brand text, model text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  return query
  select requested.id, canonical.id, canonical.brand, canonical.model
  from (select distinct unnest(coalesce(p_product_ids, '{}'::uuid[])) as id) as requested
  cross join lateral (
    select public.resolve_canonical_product_id(requested.id) as id
  ) as resolved
  join public.products as canonical on canonical.id = resolved.id;
end;
$$;

create or replace function public.product_merge_snapshot(p_source_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with direct_references as materialized (
    select *
    from public.product_direct_reference_rows(p_source_product_id)
    where archived_at is null
  ), per_submission as (
    select submission_id,
      max(submission_version)::integer as submission_version,
      min(site_id::text)::uuid as site_id,
      count(*)::integer as reference_count,
      coalesce(sum(unit_count), 0)::integer as unit_count,
      jsonb_agg(jsonb_build_object(
        'category', category_name,
        'itemId', item_id,
        'unitCount', unit_count
      ) order by category_name, item_id nulls first, unit_count) as reference_rows
    from direct_references
    group by submission_id
  ), submission_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'submissionId', submission_id,
      'version', submission_version,
      'referenceCount', reference_count,
      'references', reference_rows
    ) order by submission_id), '[]'::jsonb) as value
    from per_submission
  )
  select jsonb_build_object(
    'token', md5((select value::text from submission_rows)),
    'referenceCount', (select count(*)::integer from direct_references),
    'unitCount', coalesce((select sum(unit_count)::integer from direct_references), 0),
    'siteCount', (select count(distinct site_id)::integer from direct_references),
    'submissionCount', (select count(*)::integer from per_submission),
    'submissionVersions', (select value from submission_rows)
  );
$$;

create or replace function public.product_merge_validation(
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
  v_source public.products%rowtype;
  v_requested_target public.products%rowtype;
  v_target public.products%rowtype;
  v_target_id uuid;
  v_snapshot jsonb;
  v_conflict_brand text;
  v_conflict_model text;
  v_alias_count integer;
  v_alias_digest text;
  v_preflight_token text;
begin
  select * into v_source from public.products where id = p_source_product_id;
  if not found then return jsonb_build_object('status', 'source_not_found'); end if;

  select * into v_requested_target from public.products where id = p_target_product_id;
  if not found then return jsonb_build_object('status', 'target_not_found'); end if;
  if p_source_product_id = p_target_product_id then
    return jsonb_build_object('status', 'same_product');
  end if;
  if v_source.merged_into_product_id is not null then
    return jsonb_build_object('status', 'source_already_merged');
  end if;

  v_target_id := public.resolve_canonical_product_id(p_target_product_id);
  if v_target_id is null then return jsonb_build_object('status', 'target_not_found'); end if;
  if v_target_id = p_source_product_id then
    return jsonb_build_object('status', 'merge_cycle');
  end if;
  select * into v_target from public.products where id = v_target_id;
  if not found then return jsonb_build_object('status', 'target_not_found'); end if;
  if not v_target.active then return jsonb_build_object('status', 'target_inactive'); end if;
  if v_target.merged_into_product_id is not null then
    return jsonb_build_object('status', 'target_not_canonical');
  end if;

  with candidates as (
    select v_source.brand as brand, v_source.model as model,
      public.normalize_product_text(v_source.brand) as normalized_brand,
      public.normalize_product_text(v_source.model) as normalized_model
    union
    select alias.brand_alias, alias.model_alias, alias.normalized_brand, alias.normalized_model
    from public.product_aliases as alias
    where alias.product_id = p_source_product_id
  ), conflicts as (
    select candidate.brand, candidate.model
    from candidates as candidate
    join public.product_aliases as alias
      on alias.normalized_brand = candidate.normalized_brand
     and alias.normalized_model = candidate.normalized_model
     and alias.product_id not in (p_source_product_id, v_target_id)
    union all
    select candidate.brand, candidate.model
    from candidates as candidate
    join public.products as product
      on public.normalize_product_text(product.brand) = candidate.normalized_brand
     and public.normalize_product_text(product.model) = candidate.normalized_model
     and product.id not in (p_source_product_id, v_target_id)
  )
  select conflict.brand, conflict.model into v_conflict_brand, v_conflict_model
  from conflicts as conflict limit 1;
  if found then
    return jsonb_build_object(
      'status', 'alias_collision',
      'aliasConflict', jsonb_build_object('brand', v_conflict_brand, 'model', v_conflict_model)
    );
  end if;

  if exists (
    select 1 from public.product_direct_reference_rows(p_source_product_id) as reference
    where reference.archived_at is null and reference.active_lock
  ) then
    return jsonb_build_object('status', 'active_lock');
  end if;

  select count(*)::integer,
    md5(coalesce(string_agg(concat_ws(':', alias.id::text, alias.normalized_brand, alias.normalized_model), '|' order by alias.id), ''))
  into v_alias_count, v_alias_digest
  from public.product_aliases as alias where alias.product_id = p_source_product_id;
  v_snapshot := public.product_merge_snapshot(p_source_product_id);
  v_preflight_token := md5(concat_ws(':',
    v_snapshot ->> 'token', p_source_product_id::text, v_target_id::text,
    v_source.active::text, v_source.brand, v_source.model,
    v_target.brand, v_target.model, v_alias_count::text, v_alias_digest
  ));

  return jsonb_build_object(
    'status', 'ready',
    'preflightToken', v_preflight_token,
    'source', jsonb_build_object(
      'id', v_source.id, 'brand', v_source.brand, 'model', v_source.model, 'active', v_source.active
    ),
    'target', jsonb_build_object(
      'id', v_target.id, 'brand', v_target.brand, 'model', v_target.model, 'active', v_target.active
    ),
    'targetResolved', v_target.id <> p_target_product_id,
    'referenceCount', (v_snapshot ->> 'referenceCount')::integer,
    'unitCount', (v_snapshot ->> 'unitCount')::integer,
    'siteCount', (v_snapshot ->> 'siteCount')::integer,
    'submissionCount', (v_snapshot ->> 'submissionCount')::integer,
    'sourceAliasCount', v_alias_count,
    'submissionVersions', v_snapshot -> 'submissionVersions'
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
  return public.product_merge_validation(p_source_product_id, p_target_product_id);
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
begin
  v_admin_id := public.require_super_admin();

  lock table public.products in share row exclusive mode;
  lock table public.product_aliases in share row exclusive mode;
  lock table public.submissions in share row exclusive mode;

  perform product.id from public.products as product
  where product.id in (p_source_product_id, p_target_product_id)
  order by product.id for update;

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

  v_plan := public.product_merge_validation(p_source_product_id, p_target_product_id);
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
    )
    on conflict (product_id, normalized_brand, normalized_model) do nothing;
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
    'aliasActions', jsonb_build_object(
      'moved', v_alias_moved,
      'deduplicated', v_alias_deduped,
      'canonicalSourceAliasCreated', v_canonical_alias_created
    )
  );
end;
$$;

create or replace function public.admin_set_product_active(p_product_id uuid, p_active boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_old public.products%rowtype;
begin
  v_admin_id := public.require_super_admin();
  select * into v_old from public.products where id = p_product_id for update;
  if not found then return false; end if;
  if v_old.merged_into_product_id is not null then
    raise exception 'Merged Product status cannot be changed.' using errcode = '22023';
  end if;
  if v_old.active is distinct from p_active then
    update public.products set active = p_active where id = p_product_id;
    insert into public.admin_audit_log (admin_auth_user_id, action, target_type, target_id, metadata)
    values (v_admin_id, case when p_active then 'PRODUCT_ACTIVATE' else 'PRODUCT_DEACTIVATE' end,
      'product', p_product_id,
      jsonb_build_object('before', jsonb_build_object('active', v_old.active), 'after', jsonb_build_object('active', p_active)));
  end if;
  return true;
end;
$$;

create or replace function public.admin_update_product(p_product_id uuid, p_brand text, p_model text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_old public.products%rowtype;
  v_brand text := btrim(p_brand);
  v_model text := btrim(p_model);
begin
  v_admin_id := public.require_super_admin();
  if nullif(v_brand, '') is null or nullif(v_model, '') is null then
    raise exception 'Brand and model are required.' using errcode = '22023';
  end if;
  select * into v_old from public.products where id = p_product_id for update;
  if not found then return false; end if;
  if v_old.merged_into_product_id is not null then
    raise exception 'Merged Product cannot be edited.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.products as product
    where product.id <> p_product_id
      and public.normalize_product_text(product.brand) = public.normalize_product_text(v_brand)
      and public.normalize_product_text(product.model) = public.normalize_product_text(v_model)
  ) then
    raise exception 'A Product with the same normalized Brand and Model already exists.' using errcode = '23505';
  end if;
  if v_old.brand is distinct from v_brand or v_old.model is distinct from v_model then
    insert into public.product_aliases (
      product_id, brand_alias, model_alias, normalized_brand, normalized_model
    ) values (
      p_product_id, v_old.brand, v_old.model,
      public.normalize_product_text(v_old.brand), public.normalize_product_text(v_old.model)
    ) on conflict (product_id, normalized_brand, normalized_model) do nothing;
    update public.products
    set brand = v_brand, model = v_model, spreadsheet_synced = false
    where id = p_product_id;
    insert into public.admin_audit_log (admin_auth_user_id, action, target_type, target_id, metadata)
    values (v_admin_id, 'PRODUCT_UPDATE', 'product', p_product_id,
      jsonb_build_object(
        'before', jsonb_build_object('brand', v_old.brand, 'model', v_old.model, 'active', v_old.active),
        'after', jsonb_build_object('brand', v_brand, 'model', v_model, 'active', v_old.active)
      ));
  end if;
  return true;
end;
$$;

create or replace function public.admin_product_dependencies(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_merged_target public.products%rowtype;
begin
  perform public.require_super_admin();
  select * into v_product from public.products where id = p_product_id;
  if not found then raise exception 'Product was not found.' using errcode = 'P0002'; end if;
  if v_product.merged_into_product_id is not null then
    select * into v_merged_target from public.products
    where id = public.resolve_canonical_product_id(v_product.id);
  end if;

  return (
    with direct_references as materialized (
      select * from public.product_direct_reference_rows(p_product_id)
    ), canonical_current_references as materialized (
      select submission.site_id, submission.id as submission_id,
        submission.locked_by_session_id is not null
          and submission.lock_last_activity_at >= now() - interval '5 minutes' as active_lock
      from public.submissions as submission
      cross join lateral jsonb_each(case when jsonb_typeof(coalesce(submission.payload, '{}'::jsonb) -> 'inventory') = 'object'
        then submission.payload -> 'inventory' else '{}'::jsonb end) as category
      cross join lateral jsonb_array_elements(case when jsonb_typeof(category.value) = 'array'
        then category.value else '[]'::jsonb end) as item
      left join public.product_proposals as proposal
        on proposal.id::text = nullif(item.value ->> 'productProposalId', '')
      where submission.archived_at is null
        and public.resolve_canonical_product_id(coalesce(
          nullif(item.value ->> 'productId', '')::uuid,
          case when proposal.status in ('APPROVED', 'MERGED') then proposal.resolved_product_id end
        )) = p_product_id
    ), qc as materialized (
      select proposal.id, proposal.proposed_brand, proposal.proposed_model, proposal.status,
        proposal.resolved_product_id, proposal.reviewed_at, proposal.review_note,
        coalesce(nullif(btrim(admin.display_name), ''), admin.username) as reviewer_name
      from public.product_proposals as proposal
      left join public.super_admins as admin on admin.auth_user_id = proposal.reviewed_by
      where proposal.status in ('APPROVED', 'MERGED')
        and case
          when v_product.merged_into_product_id is not null then proposal.resolved_product_id = p_product_id
          else public.resolve_canonical_product_id(proposal.resolved_product_id) = p_product_id
        end
    ), aliases as materialized (
      select alias.id, alias.brand_alias, alias.model_alias, alias.normalized_brand,
        alias.normalized_model, alias.source_proposal_id, alias.created_at
      from public.product_aliases as alias where alias.product_id = p_product_id
    )
    select jsonb_build_object(
      'product', jsonb_build_object(
        'id', v_product.id, 'brand', v_product.brand, 'model', v_product.model,
        'active', v_product.active, 'sourceOrigin', v_product.source_origin,
        'spreadsheetSynced', v_product.spreadsheet_synced,
        'mergedIntoProduct', case when v_product.merged_into_product_id is null then null else jsonb_build_object(
          'id', v_merged_target.id, 'brand', v_merged_target.brand,
          'model', v_merged_target.model, 'active', v_merged_target.active
        ) end
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
        'mergeInboundCount', (select count(*)::integer from public.products where merged_into_product_id = p_product_id),
        'mergeOutboundCount', case when v_product.merged_into_product_id is null then 0 else 1 end
      ),
      'qcProposals', coalesce((select jsonb_agg(jsonb_build_object(
        'proposalId', id, 'proposedBrand', proposed_brand, 'proposedModel', proposed_model,
        'status', status, 'resolvedProductId', resolved_product_id,
        'reviewerName', reviewer_name, 'reviewedAt', reviewed_at, 'reviewNote', review_note
      ) order by reviewed_at desc nulls last, id) from qc), '[]'::jsonb),
      'aliases', coalesce((select jsonb_agg(jsonb_build_object(
        'aliasId', id, 'brand', brand_alias, 'model', model_alias,
        'normalizedBrand', normalized_brand, 'normalizedModel', normalized_model,
        'sourceProposalId', source_proposal_id, 'createdAt', created_at
      ) order by created_at desc, id) from aliases), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_product_usage(
  p_product_id uuid,
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 1000);
  v_search text := nullif(btrim(p_search), '');
begin
  perform public.require_super_admin();
  return (
    with item_references as materialized (
      select submission.station_id, station.name as station_name, submission.site_id,
        site.name as site_name, site_type.name as site_type_name, submission.site_subtype_id,
        subtype.name as subtype_name, category.key as category_name
      from public.submissions as submission
      join public.stations as station on station.id = submission.station_id
      join public.sites as site on site.id = submission.site_id
      join public.site_types as site_type on site_type.id = site.site_type_id
      join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
      cross join lateral jsonb_each(case when jsonb_typeof(coalesce(submission.payload, '{}'::jsonb) -> 'inventory') = 'object'
        then submission.payload -> 'inventory' else '{}'::jsonb end) as category
      cross join lateral jsonb_array_elements(case when jsonb_typeof(category.value) = 'array'
        then category.value else '[]'::jsonb end) as item
      left join public.product_proposals as proposal
        on proposal.id::text = nullif(item.value ->> 'productProposalId', '')
      where submission.archived_at is null
        and public.resolve_canonical_product_id(coalesce(
          nullif(item.value ->> 'productId', '')::uuid,
          case when proposal.status in ('APPROVED', 'MERGED') then proposal.resolved_product_id end
        )) = p_product_id
    ), locations as materialized (
      select station_id, station_name, site_id, site_name, site_type_name,
        site_subtype_id, subtype_name, count(*)::integer as reference_count,
        array_agg(distinct category_name order by category_name) as categories
      from item_references
      group by station_id, station_name, site_id, site_name, site_type_name, site_subtype_id, subtype_name
    ), filtered as materialized (
      select * from locations where v_search is null
        or concat_ws(' ', station_name, site_name, site_type_name, subtype_name) ilike '%' || v_search || '%'
    ), paged as (
      select * from filtered order by station_name, site_name, subtype_name, site_subtype_id
      limit v_page_size offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'stationId', station_id, 'stationName', station_name, 'siteId', site_id,
        'siteName', site_name, 'siteTypeName', site_type_name,
        'siteSubtypeId', site_subtype_id, 'subtypeName', subtype_name,
        'referenceCount', reference_count, 'categories', categories
      ) order by station_name, site_name, subtype_name, site_subtype_id) from paged), '[]'::jsonb),
      'totalCount', (select count(*) from filtered),
      'stationCount', (select count(distinct station_id) from filtered),
      'siteCount', (select count(distinct site_id) from filtered),
      'referenceCount', coalesce((select sum(reference_count) from filtered), 0),
      'page', v_page, 'pageSize', v_page_size
    )
  );
end;
$$;

create or replace function public.admin_product_usage_counts(p_product_ids uuid[])
returns table(product_id uuid, reference_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query
  with requested_products as materialized (
    select distinct requested.id as product_id
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) as requested(id)
    where requested.id is not null
  ), item_references as materialized (
    select public.resolve_canonical_product_id(coalesce(
      nullif(item.value ->> 'productId', '')::uuid,
      case when proposal.status in ('APPROVED', 'MERGED') then proposal.resolved_product_id end
    )) as canonical_product_id
    from public.submissions as submission
    cross join lateral jsonb_each(case when jsonb_typeof(coalesce(submission.payload, '{}'::jsonb) -> 'inventory') = 'object'
      then submission.payload -> 'inventory' else '{}'::jsonb end) as category
    cross join lateral jsonb_array_elements(case when jsonb_typeof(category.value) = 'array'
      then category.value else '[]'::jsonb end) as item
    left join public.product_proposals as proposal
      on proposal.id::text = nullif(item.value ->> 'productProposalId', '')
    where submission.archived_at is null
  )
  select requested.product_id, count(reference.canonical_product_id)::integer
  from requested_products as requested
  left join item_references as reference on reference.canonical_product_id = requested.product_id
  group by requested.product_id;
end;
$$;

revoke all on function public.resolve_canonical_product_id(uuid) from public, anon, authenticated;
revoke all on function public.resolve_canonical_products(uuid[]) from public, anon;
revoke all on function public.product_merge_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.product_merge_validation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_product_merge_preflight(uuid, uuid) from public, anon;
revoke all on function public.admin_merge_product(uuid, uuid, text) from public, anon;
revoke all on function public.admin_set_product_active(uuid, boolean) from public, anon;
revoke all on function public.admin_update_product(uuid, text, text) from public, anon;
revoke all on function public.admin_product_dependencies(uuid) from public, anon;
revoke all on function public.admin_product_usage(uuid, integer, integer, text) from public, anon;
revoke all on function public.admin_product_usage_counts(uuid[]) from public, anon;

grant execute on function public.resolve_canonical_products(uuid[]) to authenticated;
grant execute on function public.admin_product_merge_preflight(uuid, uuid) to authenticated;
grant execute on function public.admin_merge_product(uuid, uuid, text) to authenticated;
grant execute on function public.admin_set_product_active(uuid, boolean) to authenticated;
grant execute on function public.admin_update_product(uuid, text, text) to authenticated;
grant execute on function public.admin_product_dependencies(uuid) to authenticated;
grant execute on function public.admin_product_usage(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_product_usage_counts(uuid[]) to authenticated;

comment on column public.products.merged_into_product_id is
  'Canonical forwarding target for a historical Product merged by a Super Admin.';
comment on function public.admin_product_merge_preflight(uuid, uuid) is
  'Read-only Product Merge plan with canonical target, lock, alias, and concurrency checks.';
comment on function public.admin_merge_product(uuid, uuid, text) is
  'Atomically moves all current direct references, forwards aliases, marks Source merged, and writes PRODUCT_MERGE audit.';
