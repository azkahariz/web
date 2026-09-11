-- Correct Product reference removal semantics: selected occurrences are removed
-- from the authoritative current inventory. Deployment remains function-only;
-- no business rows change until an authenticated Super Admin invokes the RPC.

create or replace function public.admin_remove_product_references(
  p_source_product_id uuid,
  p_references jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_plan jsonb;
  v_source public.products%rowtype;
  v_submission public.submissions%rowtype;
  v_inventory jsonb;
  v_selected jsonb;
  v_removed_items jsonb;
  v_versions jsonb := '[]'::jsonb;
begin
  v_admin := public.require_super_admin();
  v_plan := public.product_reference_removal_validation(p_source_product_id, p_references);
  if v_plan ->> 'status' <> 'ready' then return v_plan; end if;

  perform proposal.id
  from public.product_proposals as proposal
  join (
    select distinct (value ->> 'proposalId')::uuid as id
    from jsonb_array_elements(p_references) as reference(value)
    where value ->> 'referenceType' = 'QC_RESULT'
  ) as selected on selected.id = proposal.id
  order by proposal.id
  for update of proposal;

  perform submission.id
  from public.submissions as submission
  join (
    select distinct (value ->> 'submissionId')::uuid as id
    from jsonb_array_elements(p_references) as reference(value)
  ) as selected on selected.id = submission.id
  order by submission.id
  for update of submission;

  v_plan := public.product_reference_removal_validation(p_source_product_id, p_references);
  if v_plan ->> 'status' <> 'ready' then return v_plan; end if;
  select * into v_source from public.products where id = p_source_product_id;

  for v_submission in
    select submission.*
    from public.submissions as submission
    join (
      select distinct (value ->> 'submissionId')::uuid as id
      from jsonb_array_elements(p_references) as reference(value)
    ) as selected on selected.id = submission.id
    order by submission.id
  loop
    select coalesce(jsonb_agg(value order by value ->> 'storageCategory', (value ->> 'itemOrdinal')::integer), '[]'::jsonb)
    into v_selected
    from jsonb_array_elements(p_references) as reference(value)
    where (value ->> 'submissionId')::uuid = v_submission.id;

    -- Preserve an exact recovery/provenance snapshot in the audit event. The
    -- current schema has a version counter, not a separate payload-version table.
    select coalesce(jsonb_agg(jsonb_build_object(
      'reference', selected.value,
      'itemSnapshot', public.submission_inventory_item_at(
        v_submission.payload,
        selected.value ->> 'storageCategory',
        (selected.value ->> 'itemOrdinal')::integer
      )
    ) order by selected.value ->> 'storageCategory', (selected.value ->> 'itemOrdinal')::integer), '[]'::jsonb)
    into v_removed_items
    from jsonb_array_elements(v_selected) as selected(value);

    -- Filter selected ordinals in one pass. This avoids index-shift bugs when
    -- several items from the same category are removed together.
    select jsonb_object_agg(
      category.key,
      case when jsonb_typeof(category.value) = 'array' then (
        select coalesce(
          jsonb_agg(entry.value order by entry.ordinality)
            filter (where selected.value is null),
          '[]'::jsonb
        )
        from jsonb_array_elements(category.value) with ordinality as entry(value, ordinality)
        left join lateral (
          select reference.value
          from jsonb_array_elements(v_selected) as reference(value)
          where reference.value ->> 'storageCategory' = category.key
            and (reference.value ->> 'itemOrdinal')::bigint = entry.ordinality
          limit 1
        ) as selected on true
      ) else category.value end
      order by category.key
    ) into v_inventory
    from jsonb_each(v_submission.payload -> 'inventory') as category(key, value);

    update public.submissions as submission
    set payload = jsonb_set(submission.payload, '{inventory}', coalesce(v_inventory, '{}'::jsonb), false),
      version = submission.version + 1,
      last_saved_at = now()
    where submission.id = v_submission.id;

    insert into public.admin_audit_log(admin_auth_user_id, action, target_type, target_id, metadata)
    values (
      v_admin,
      'PRODUCT_REFERENCE_REMOVE',
      'submission',
      v_submission.id,
      jsonb_build_object(
        'sourceProduct', jsonb_build_object('id', v_source.id, 'brand', v_source.brand, 'model', v_source.model),
        'stationId', v_submission.station_id,
        'stationName', (select station.name from public.stations as station where station.id = v_submission.station_id),
        'siteId', v_submission.site_id,
        'siteName', (select site.name from public.sites as site where site.id = v_submission.site_id),
        'references', v_selected,
        'removedItems', v_removed_items,
        'referenceCount', jsonb_array_length(v_selected),
        'oldSubmissionVersion', v_submission.version,
        'newSubmissionVersion', v_submission.version + 1
      )
    );

    v_versions := v_versions || jsonb_build_array(jsonb_build_object(
      'submissionId', v_submission.id,
      'oldVersion', v_submission.version,
      'newVersion', v_submission.version + 1
    ));
  end loop;

  insert into public.admin_audit_log(admin_auth_user_id, action, target_type, target_id, metadata)
  values (
    v_admin,
    'PRODUCT_REFERENCE_REMOVE',
    'product',
    p_source_product_id,
    jsonb_build_object(
      'sourceProduct', jsonb_build_object('id', v_source.id, 'brand', v_source.brand, 'model', v_source.model),
      'referenceCount', v_plan -> 'referenceCount',
      'directReferenceCount', v_plan -> 'directReferenceCount',
      'qcResultCount', v_plan -> 'qcResultCount',
      'submissionVersions', v_versions
    )
  );

  return v_plan || jsonb_build_object('status', 'removed', 'submissionVersions', v_versions);
end;
$$;

revoke all on function public.admin_remove_product_references(uuid, jsonb) from public, anon;
grant execute on function public.admin_remove_product_references(uuid, jsonb) to authenticated;

comment on function public.admin_remove_product_references(uuid, jsonb) is
  'Atomically removes selected exact items from current Submission inventory while preserving Product and QC/proposal history.';
