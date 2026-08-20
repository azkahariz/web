-- Phase 2: move selected direct current InstalledItem references between canonical Products.
-- Product merge, alias forwarding, archived references, and QC resolution changes remain out of scope.

create or replace function public.product_reference_move_validation(
  p_source_product_id uuid,
  p_target_product_id uuid,
  p_references jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_source public.products%rowtype;
  v_target public.products%rowtype;
  v_reference_count integer;
  v_submission_count integer;
  v_site_count integer;
  v_unit_count integer;
begin
  select * into v_source from public.products where id = p_source_product_id;
  if not found then
    return jsonb_build_object('status', 'source_not_found');
  end if;

  select * into v_target from public.products where id = p_target_product_id;
  if not found then
    return jsonb_build_object('status', 'target_not_found');
  end if;
  if p_source_product_id = p_target_product_id then
    return jsonb_build_object('status', 'same_product');
  end if;
  if not v_target.active then
    return jsonb_build_object('status', 'target_inactive');
  end if;
  if jsonb_typeof(p_references) <> 'array' or jsonb_array_length(p_references) = 0
     or jsonb_array_length(p_references) > 500 then
    return jsonb_build_object('status', 'invalid_selection');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_references) as reference(value)
    where coalesce(reference.value ->> 'submissionId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(reference.value ->> 'expectedSubmissionVersion', '') !~ '^[0-9]+$'
      or nullif(btrim(reference.value ->> 'itemId'), '') is null
      or char_length(reference.value ->> 'itemId') > 200
  ) then
    return jsonb_build_object('status', 'invalid_selection');
  end if;

  with selected as (
    select (reference.value ->> 'submissionId')::uuid as submission_id,
      (reference.value ->> 'expectedSubmissionVersion')::integer as expected_version,
      btrim(reference.value ->> 'itemId') as item_id
    from jsonb_array_elements(p_references) as reference(value)
  )
  select count(*)::integer into v_reference_count from selected;

  if (
    with selected as (
      select (reference.value ->> 'submissionId')::uuid as submission_id,
        (reference.value ->> 'expectedSubmissionVersion')::integer as expected_version,
        btrim(reference.value ->> 'itemId') as item_id
      from jsonb_array_elements(p_references) as reference(value)
    )
    select count(*) <> count(distinct (submission_id, item_id))
      or exists (select 1 from selected group by submission_id having min(expected_version) <> max(expected_version))
    from selected
  ) then
    return jsonb_build_object('status', 'invalid_selection');
  end if;

  if exists (
    with selected as (
      select distinct (reference.value ->> 'submissionId')::uuid as submission_id
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1 from selected
    left join public.submissions as submission on submission.id = selected.submission_id
    where submission.id is null
  ) then
    return jsonb_build_object('status', 'submission_not_found');
  end if;

  if exists (
    with selected as (
      select distinct (reference.value ->> 'submissionId')::uuid as submission_id
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1 from selected
    join public.submissions as submission on submission.id = selected.submission_id
    where submission.archived_at is not null
  ) then
    return jsonb_build_object('status', 'archived_submission');
  end if;

  if exists (
    with selected as (
      select distinct (reference.value ->> 'submissionId')::uuid as submission_id,
        (reference.value ->> 'expectedSubmissionVersion')::integer as expected_version
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1 from selected
    join public.submissions as submission on submission.id = selected.submission_id
    where submission.version <> selected.expected_version
  ) then
    return jsonb_build_object('status', 'version_conflict');
  end if;

  if exists (
    with selected as (
      select distinct (reference.value ->> 'submissionId')::uuid as submission_id
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1 from selected
    join public.submissions as submission on submission.id = selected.submission_id
    where submission.locked_by_session_id is not null
      and submission.lock_last_activity_at is not null
      and submission.lock_last_activity_at >= now() - interval '5 minutes'
  ) then
    return jsonb_build_object('status', 'active_lock');
  end if;

  if exists (
    with selected as (
      select (reference.value ->> 'submissionId')::uuid as submission_id,
        btrim(reference.value ->> 'itemId') as item_id
      from jsonb_array_elements(p_references) as reference(value)
    ), item_occurrences as (
      select selected.submission_id, selected.item_id, item.value as item
      from selected
      join public.submissions as submission on submission.id = selected.submission_id
      cross join lateral jsonb_each(
        case when jsonb_typeof(submission.payload -> 'inventory') = 'object'
          then submission.payload -> 'inventory' else '{}'::jsonb end
      ) as category(key, value)
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
      ) as item(value)
      where item.value ->> 'id' = selected.item_id
    ), states as (
      select selected.submission_id, selected.item_id,
        count(item_occurrences.item)::integer as occurrence_count,
        bool_or(item_occurrences.item ->> 'productId' = p_source_product_id::text) as source_matches,
        bool_or(nullif(item_occurrences.item ->> 'productProposalId', '') is not null) as has_proposal
      from selected
      left join item_occurrences using (submission_id, item_id)
      group by selected.submission_id, selected.item_id
    )
    select 1 from states where occurrence_count = 0
  ) then
    return jsonb_build_object('status', 'missing_item');
  end if;

  if exists (
    with selected as (
      select (reference.value ->> 'submissionId')::uuid as submission_id,
        btrim(reference.value ->> 'itemId') as item_id
      from jsonb_array_elements(p_references) as reference(value)
    ), item_occurrences as (
      select selected.submission_id, selected.item_id, item.value as item
      from selected
      join public.submissions as submission on submission.id = selected.submission_id
      cross join lateral jsonb_each(
        case when jsonb_typeof(submission.payload -> 'inventory') = 'object'
          then submission.payload -> 'inventory' else '{}'::jsonb end
      ) as category(key, value)
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
      ) as item(value)
      where item.value ->> 'id' = selected.item_id
    )
    select 1 from item_occurrences group by submission_id, item_id having count(*) <> 1
  ) then
    return jsonb_build_object('status', 'ambiguous_item');
  end if;

  if exists (
    with selected as (
      select (reference.value ->> 'submissionId')::uuid as submission_id,
        btrim(reference.value ->> 'itemId') as item_id
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1
    from selected
    join public.submissions as submission on submission.id = selected.submission_id
    cross join lateral jsonb_each(
      case when jsonb_typeof(submission.payload -> 'inventory') = 'object'
        then submission.payload -> 'inventory' else '{}'::jsonb end
    ) as category(key, value)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
    ) as item(value)
    where item.value ->> 'id' = selected.item_id
      and nullif(item.value ->> 'productProposalId', '') is not null
  ) then
    return jsonb_build_object('status', 'unsupported_reference');
  end if;

  if exists (
    with selected as (
      select (reference.value ->> 'submissionId')::uuid as submission_id,
        btrim(reference.value ->> 'itemId') as item_id
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1
    from selected
    join public.submissions as submission on submission.id = selected.submission_id
    cross join lateral jsonb_each(
      case when jsonb_typeof(submission.payload -> 'inventory') = 'object'
        then submission.payload -> 'inventory' else '{}'::jsonb end
    ) as category(key, value)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
    ) as item(value)
    where item.value ->> 'id' = selected.item_id
      and item.value ->> 'productId' is distinct from p_source_product_id::text
  ) then
    return jsonb_build_object('status', 'source_mismatch');
  end if;

  with selected as (
    select (reference.value ->> 'submissionId')::uuid as submission_id,
      btrim(reference.value ->> 'itemId') as item_id
    from jsonb_array_elements(p_references) as reference(value)
  ), selected_items as (
    select submission.id as submission_id, submission.site_id, item.value as item
    from selected
    join public.submissions as submission on submission.id = selected.submission_id
    cross join lateral jsonb_each(
      case when jsonb_typeof(submission.payload -> 'inventory') = 'object'
        then submission.payload -> 'inventory' else '{}'::jsonb end
    ) as category(key, value)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.value) = 'array' then category.value else '[]'::jsonb end
    ) as item(value)
    where item.value ->> 'id' = selected.item_id
  )
  select count(distinct submission_id)::integer, count(distinct site_id)::integer,
    coalesce(sum(case
      when jsonb_typeof(item -> 'units') = 'array' then jsonb_array_length(item -> 'units')
      when coalesce(item ->> 'quantity', '') ~ '^[0-9]+$' then greatest((item ->> 'quantity')::integer, 1)
      else 1
    end), 0)::integer
  into v_submission_count, v_site_count, v_unit_count
  from selected_items;

  return jsonb_build_object(
    'status', 'ready',
    'source', jsonb_build_object('id', v_source.id, 'brand', v_source.brand, 'model', v_source.model),
    'target', jsonb_build_object('id', v_target.id, 'brand', v_target.brand, 'model', v_target.model),
    'referenceCount', v_reference_count,
    'unitCount', v_unit_count,
    'siteCount', v_site_count,
    'submissionCount', v_submission_count
  );
end;
$$;

create or replace function public.admin_product_reference_move_preflight(
  p_source_product_id uuid,
  p_target_product_id uuid,
  p_references jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return public.product_reference_move_validation(p_source_product_id, p_target_product_id, p_references);
end;
$$;

create or replace function public.admin_move_product_references(
  p_source_product_id uuid,
  p_target_product_id uuid,
  p_references jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_plan jsonb;
  v_submission public.submissions%rowtype;
  v_target public.products%rowtype;
  v_item_ids text[];
  v_new_inventory jsonb;
  v_new_versions jsonb := '[]'::jsonb;
begin
  v_admin_id := public.require_super_admin();
  v_plan := public.product_reference_move_validation(p_source_product_id, p_target_product_id, p_references);
  if v_plan ->> 'status' <> 'ready' then
    return v_plan;
  end if;

  perform submission.id
  from public.submissions as submission
  join (
    select distinct (reference.value ->> 'submissionId')::uuid as submission_id
    from jsonb_array_elements(p_references) as reference(value)
  ) as selected on selected.submission_id = submission.id
  order by submission.id
  for update of submission;

  v_plan := public.product_reference_move_validation(p_source_product_id, p_target_product_id, p_references);
  if v_plan ->> 'status' <> 'ready' then
    return v_plan;
  end if;

  select * into v_target from public.products where id = p_target_product_id;

  for v_submission in
    select submission.*
    from public.submissions as submission
    join (
      select distinct (reference.value ->> 'submissionId')::uuid as submission_id
      from jsonb_array_elements(p_references) as reference(value)
    ) as selected on selected.submission_id = submission.id
    order by submission.id
  loop
    select array_agg(btrim(reference.value ->> 'itemId') order by btrim(reference.value ->> 'itemId'))
    into v_item_ids
    from jsonb_array_elements(p_references) as reference(value)
    where (reference.value ->> 'submissionId')::uuid = v_submission.id;

    select jsonb_object_agg(
      inventory.key,
      case
        when jsonb_typeof(inventory.value) = 'array' then (
          select coalesce(jsonb_agg(
            case when item.value ->> 'id' = any(v_item_ids)
              then item.value || jsonb_build_object(
                'productId', v_target.id,
                'brand', v_target.brand,
                'model', v_target.model
              )
              else item.value
            end
            order by item.ordinality
          ), '[]'::jsonb)
          from jsonb_array_elements(inventory.value) with ordinality as item(value, ordinality)
        )
        else inventory.value
      end
      order by inventory.key
    )
    into v_new_inventory
    from jsonb_each(v_submission.payload -> 'inventory') as inventory(key, value);

    update public.submissions as submission
    set payload = jsonb_set(submission.payload, '{inventory}', v_new_inventory, false),
        version = submission.version + 1,
        last_saved_at = now()
    where submission.id = v_submission.id;

    insert into public.admin_audit_log (
      admin_auth_user_id, action, target_type, target_id, metadata
    ) values (
      v_admin_id,
      'PRODUCT_REFERENCE_MOVE',
      'submission',
      v_submission.id,
      jsonb_build_object(
        'sourceProduct', v_plan -> 'source',
        'targetProduct', v_plan -> 'target',
        'itemIds', to_jsonb(v_item_ids),
        'referenceCount', cardinality(v_item_ids),
        'oldSubmissionVersion', v_submission.version,
        'newSubmissionVersion', v_submission.version + 1
      )
    );

    v_new_versions := v_new_versions || jsonb_build_array(jsonb_build_object(
      'submissionId', v_submission.id,
      'oldVersion', v_submission.version,
      'newVersion', v_submission.version + 1
    ));
  end loop;

  return v_plan || jsonb_build_object('status', 'moved', 'submissionVersions', v_new_versions);
end;
$$;

revoke all on function public.product_reference_move_validation(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_product_reference_move_preflight(uuid, uuid, jsonb) from public, anon;
revoke all on function public.admin_move_product_references(uuid, uuid, jsonb) from public, anon;
grant execute on function public.admin_product_reference_move_preflight(uuid, uuid, jsonb) to authenticated;
grant execute on function public.admin_move_product_references(uuid, uuid, jsonb) to authenticated;

comment on function public.admin_product_reference_move_preflight(uuid, uuid, jsonb) is
  'Read-only validation for moving selected direct current InstalledItem Product references.';
comment on function public.admin_move_product_references(uuid, uuid, jsonb) is
  'Atomically moves selected direct current InstalledItem references and records one audit event per touched Submission.';
