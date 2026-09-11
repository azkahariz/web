-- Selective Product reference removal. Deployment is function-only: no business
-- rows are changed until an authenticated Super Admin executes the mutation RPC.

create or replace function public.submission_inventory_item_at(
  p_payload jsonb,
  p_storage_category text,
  p_item_ordinal integer
)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select entry.value
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(p_payload, '{}'::jsonb) -> 'inventory' -> p_storage_category) = 'array'
        then p_payload -> 'inventory' -> p_storage_category
      else '[]'::jsonb
    end
  ) with ordinality as entry(value, ordinality)
  where entry.ordinality = p_item_ordinal
  limit 1
$$;

-- Keep Product usage and Product reference rows on the same occurrence model.
-- A resolved proposal is current only while an inventory item still links to it.
create or replace function public.admin_product_reference_occurrences(
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
  v_page_size integer := case when p_page_size in (50, 100, 200) then p_page_size else 50 end;
  v_search text := nullif(btrim(p_search), '');
begin
  perform public.require_super_admin();
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product was not found.' using errcode = 'P0002';
  end if;

  return (
    with direct_rows as materialized (
      select
        'DIRECT'::text as reference_type,
        'direct:' || submission.id::text || ':' || fact.storage_category || ':' || fact.item_ordinal::text as reference_id,
        submission.id as submission_id, submission.version as expected_submission_version,
        null::uuid as proposal_id, null::timestamptz as expected_proposal_updated_at,
        station.name as station_name, site.name as site_name, site_type.name as site_type_name,
        subtype.name as site_subtype_name,
        min(fact.category_label) as category_name,
        array_agg(distinct fact.category_label order by fact.category_label) as categories,
        array_agg(distinct fact.category_label order by fact.category_label) as function_categories,
        fact.storage_category, fact.item_ordinal, fact.item_id,
        max(fact.unit_count)::integer as unit_count,
        submission.archived_at,
        (submission.locked_by_session_id is not null and submission.lock_last_activity_at >= now() - interval '5 minutes') as active_lock,
        submission.lock_operator_name as lock_operator_name, null::text as qc_status,
        null::text as proposed_brand, null::text as proposed_model
      from public.submissions as submission
      join public.stations as station on station.id = submission.station_id
      join public.sites as site on site.id = submission.site_id
      join public.site_types as site_type on site_type.id = site.site_type_id
      join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
      cross join lateral public.submission_product_reference_category_rows(submission.payload) as fact
      where fact.product_id is not null
        and public.resolve_canonical_product_id(fact.product_id) = p_product_id
        and submission.archived_at is null
      group by submission.id, submission.version, station.name, site.name, site_type.name,
        subtype.name, fact.storage_category, fact.item_ordinal, fact.item_id, submission.archived_at,
        submission.locked_by_session_id, submission.lock_last_activity_at, submission.lock_operator_name
    ), qc_rows as materialized (
      select
        'QC_RESULT'::text as reference_type,
        'qc:' || proposal.id::text || ':' || submission.id::text || ':' || fact.storage_category || ':' || fact.item_ordinal::text as reference_id,
        submission.id as submission_id, submission.version as expected_submission_version,
        proposal.id as proposal_id, proposal.updated_at as expected_proposal_updated_at,
        station.name as station_name, site.name as site_name, site_type.name as site_type_name,
        subtype.name as site_subtype_name,
        min(fact.category_label) as category_name,
        array_agg(distinct fact.category_label order by fact.category_label) as categories,
        array_agg(distinct fact.category_label order by fact.category_label) as function_categories,
        fact.storage_category, fact.item_ordinal, fact.item_id,
        max(fact.unit_count)::integer as unit_count,
        submission.archived_at,
        (submission.locked_by_session_id is not null and submission.lock_last_activity_at >= now() - interval '5 minutes') as active_lock,
        submission.lock_operator_name as lock_operator_name,
        proposal.status as qc_status, proposal.proposed_brand, proposal.proposed_model
      from public.submissions as submission
      join public.stations as station on station.id = submission.station_id
      join public.sites as site on site.id = submission.site_id
      join public.site_types as site_type on site_type.id = site.site_type_id
      join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
      cross join lateral public.submission_product_reference_category_rows(submission.payload) as fact
      join public.product_proposals as proposal
        on proposal.id = fact.product_proposal_id
        and proposal.submission_id = submission.id
      where fact.product_id is null
        and proposal.status in ('APPROVED', 'MERGED')
        and proposal.resolved_product_id is not null
        and public.resolve_canonical_product_id(proposal.resolved_product_id) = p_product_id
        and submission.archived_at is null
      group by proposal.id, proposal.updated_at, proposal.status, proposal.proposed_brand, proposal.proposed_model,
        submission.id, submission.version, station.name, site.name, site_type.name, subtype.name,
        fact.storage_category, fact.item_ordinal, fact.item_id, submission.archived_at,
        submission.locked_by_session_id, submission.lock_last_activity_at, submission.lock_operator_name
    ), rows as materialized (
      select * from direct_rows union all select * from qc_rows
    ), filtered as materialized (
      select * from rows
      where v_search is null or concat_ws(' ', station_name, site_name, site_type_name, site_subtype_name,
        array_to_string(categories, ' '), proposed_brand, proposed_model, qc_status) ilike '%' || v_search || '%'
    ), paged as (
      select * from filtered
      order by station_name, site_name, site_subtype_name, reference_type, reference_id
      limit v_page_size offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'referenceType', reference_type, 'referenceId', reference_id,
        'submissionId', submission_id, 'expectedSubmissionVersion', expected_submission_version,
        'proposalId', proposal_id, 'expectedProposalUpdatedAt', expected_proposal_updated_at,
        'stationName', station_name, 'siteName', site_name, 'siteTypeName', site_type_name,
        'siteSubtypeName', site_subtype_name, 'categoryName', category_name,
        'categories', categories, 'functionCategories', function_categories,
        'storageCategory', storage_category, 'itemOrdinal', item_ordinal,
        'itemId', item_id, 'unitCount', unit_count,
        'archivedAt', archived_at, 'activeLock', active_lock, 'lockOwnerDisplayName', lock_operator_name,
        'qcStatus', qc_status, 'proposedBrand', proposed_brand, 'proposedModel', proposed_model
      ) order by station_name, site_name, site_subtype_name, reference_type, reference_id) from paged), '[]'::jsonb),
      'totalCount', (select count(*)::integer from filtered), 'page', v_page, 'pageSize', v_page_size
    )
  );
end;
$$;

create or replace function public.product_reference_removal_validation(
  p_source_product_id uuid,
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
  v_direct integer;
  v_qc integer;
  v_submission integer;
  v_site integer;
begin
  select * into v_source from public.products where id = p_source_product_id;
  if not found then return jsonb_build_object('status', 'source_not_found'); end if;
  if jsonb_typeof(p_references) <> 'array' or jsonb_array_length(p_references) not between 1 and 500 then
    return jsonb_build_object('status', 'invalid_selection');
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_references) as reference(value)
    where coalesce(value ->> 'referenceType', '') not in ('DIRECT', 'QC_RESULT')
      or coalesce(value ->> 'submissionId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(value ->> 'expectedSubmissionVersion', '') !~ '^[0-9]+$'
      or nullif(btrim(value ->> 'storageCategory'), '') is null
      or length(value ->> 'storageCategory') > 500
      or coalesce(value ->> 'itemOrdinal', '') !~ '^[1-9][0-9]*$'
      or (value ? 'itemId' and value -> 'itemId' <> 'null'::jsonb and (nullif(btrim(value ->> 'itemId'), '') is null or length(value ->> 'itemId') > 200))
      or (value ->> 'referenceType' = 'QC_RESULT' and (
        coalesce(value ->> 'proposalId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or not pg_input_is_valid(value ->> 'expectedProposalUpdatedAt', 'timestamp with time zone')
      ))
  ) then return jsonb_build_object('status', 'invalid_selection'); end if;

  if exists (
    select 1 from jsonb_array_elements(p_references) as reference(value)
    group by value ->> 'submissionId', value ->> 'storageCategory', value ->> 'itemOrdinal'
    having count(*) > 1
  ) then return jsonb_build_object('status', 'invalid_selection'); end if;

  if exists (
    with selected as (
      select (value ->> 'submissionId')::uuid as submission_id
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1 from selected left join public.submissions as submission on submission.id = selected.submission_id
    where submission.id is null
  ) then return jsonb_build_object('status', 'submission_not_found'); end if;

  if exists (
    with selected as (
      select (value ->> 'submissionId')::uuid as submission_id,
        (value ->> 'expectedSubmissionVersion')::integer as expected_version
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1 from selected join public.submissions as submission on submission.id = selected.submission_id
    where submission.archived_at is not null
  ) then return jsonb_build_object('status', 'archived_submission'); end if;

  if exists (
    with selected as (
      select (value ->> 'submissionId')::uuid as submission_id,
        (value ->> 'expectedSubmissionVersion')::integer as expected_version
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1 from selected join public.submissions as submission on submission.id = selected.submission_id
    where submission.version <> selected.expected_version
  ) then return jsonb_build_object('status', 'version_conflict'); end if;

  if exists (
    with selected as (
      select distinct (value ->> 'submissionId')::uuid as submission_id
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1 from selected join public.submissions as submission on submission.id = selected.submission_id
    where submission.locked_by_session_id is not null
      and submission.lock_last_activity_at >= now() - interval '5 minutes'
  ) then return jsonb_build_object('status', 'active_lock'); end if;

  if exists (
    with selected as (
      select value ->> 'referenceType' as reference_type,
        (value ->> 'submissionId')::uuid as submission_id,
        value ->> 'storageCategory' as storage_category,
        (value ->> 'itemOrdinal')::integer as item_ordinal,
        nullif(btrim(value ->> 'itemId'), '') as item_id
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1
    from selected
    join public.submissions as submission on submission.id = selected.submission_id
    cross join lateral (select public.submission_inventory_item_at(submission.payload, selected.storage_category, selected.item_ordinal) as item) as occurrence
    where occurrence.item is null
  ) then return jsonb_build_object('status', 'missing_item'); end if;

  if exists (
    with selected as (
      select value ->> 'referenceType' as reference_type,
        (value ->> 'submissionId')::uuid as submission_id,
        value ->> 'storageCategory' as storage_category,
        (value ->> 'itemOrdinal')::integer as item_ordinal,
        nullif(btrim(value ->> 'itemId'), '') as item_id
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1
    from selected
    join public.submissions as submission on submission.id = selected.submission_id
    cross join lateral (select public.submission_inventory_item_at(submission.payload, selected.storage_category, selected.item_ordinal) as item) as occurrence
    where selected.item_id is not null and occurrence.item ->> 'id' is distinct from selected.item_id
  ) then return jsonb_build_object('status', 'reference_changed'); end if;

  if exists (
    with selected as (
      select value ->> 'referenceType' as reference_type,
        (value ->> 'submissionId')::uuid as submission_id,
        value ->> 'storageCategory' as storage_category,
        (value ->> 'itemOrdinal')::integer as item_ordinal
      from jsonb_array_elements(p_references) as reference(value)
    )
    select 1
    from selected
    join public.submissions as submission on submission.id = selected.submission_id
    cross join lateral (select public.submission_inventory_item_at(submission.payload, selected.storage_category, selected.item_ordinal) as item) as occurrence
    where (selected.reference_type = 'DIRECT' and nullif(occurrence.item ->> 'productProposalId', '') is not null)
       or (selected.reference_type = 'QC_RESULT' and nullif(occurrence.item ->> 'productId', '') is not null)
  ) then return jsonb_build_object('status', 'unsupported_reference'); end if;

  if exists (
    with selected as (
      select (value ->> 'submissionId')::uuid as submission_id,
        value ->> 'storageCategory' as storage_category,
        (value ->> 'itemOrdinal')::integer as item_ordinal
      from jsonb_array_elements(p_references) as reference(value)
      where value ->> 'referenceType' = 'DIRECT'
    )
    select 1
    from selected
    join public.submissions as submission on submission.id = selected.submission_id
    cross join lateral (select public.submission_inventory_item_at(submission.payload, selected.storage_category, selected.item_ordinal) as item) as occurrence
    where case
      when coalesce(occurrence.item ->> 'productId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then public.resolve_canonical_product_id((occurrence.item ->> 'productId')::uuid)
      else null
    end is distinct from p_source_product_id
  ) then return jsonb_build_object('status', 'source_mismatch'); end if;

  if exists (
    with selected as (
      select (value ->> 'submissionId')::uuid as submission_id,
        value ->> 'storageCategory' as storage_category,
        (value ->> 'itemOrdinal')::integer as item_ordinal,
        (value ->> 'proposalId')::uuid as proposal_id,
        (value ->> 'expectedProposalUpdatedAt')::timestamptz as expected_proposal_updated_at
      from jsonb_array_elements(p_references) as reference(value)
      where value ->> 'referenceType' = 'QC_RESULT'
    )
    select 1
    from selected
    join public.submissions as submission on submission.id = selected.submission_id
    cross join lateral (select public.submission_inventory_item_at(submission.payload, selected.storage_category, selected.item_ordinal) as item) as occurrence
    left join public.product_proposals as proposal on proposal.id = selected.proposal_id
    where proposal.id is null
      or proposal.submission_id is distinct from selected.submission_id
      or proposal.status not in ('APPROVED', 'MERGED')
      or proposal.resolved_product_id is null
      or public.resolve_canonical_product_id(proposal.resolved_product_id) is distinct from p_source_product_id
      or date_trunc('milliseconds', proposal.updated_at) is distinct from date_trunc('milliseconds', selected.expected_proposal_updated_at)
      or occurrence.item ->> 'productProposalId' is distinct from selected.proposal_id::text
  ) then return jsonb_build_object('status', 'reference_changed'); end if;

  select count(*) filter (where value ->> 'referenceType' = 'DIRECT'),
    count(*) filter (where value ->> 'referenceType' = 'QC_RESULT')
  into v_direct, v_qc
  from jsonb_array_elements(p_references) as reference(value);

  select count(distinct submission.id), count(distinct submission.site_id)
  into v_submission, v_site
  from jsonb_array_elements(p_references) as reference(value)
  join public.submissions as submission on submission.id = (value ->> 'submissionId')::uuid;

  return jsonb_build_object(
    'status', 'ready',
    'source', jsonb_build_object('id', v_source.id, 'brand', v_source.brand, 'model', v_source.model),
    'referenceCount', v_direct + v_qc,
    'directReferenceCount', v_direct,
    'qcResultCount', v_qc,
    'siteCount', v_site,
    'submissionCount', v_submission
  );
end;
$$;

create or replace function public.admin_product_reference_removal_preflight(
  p_source_product_id uuid,
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
  return public.product_reference_removal_validation(p_source_product_id, p_references);
end;
$$;

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

    select jsonb_object_agg(
      category.key,
      case when jsonb_typeof(category.value) = 'array' then (
        select coalesce(jsonb_agg(
          case
            when selected.value ->> 'referenceType' = 'DIRECT' then entry.value - 'productId'
            when selected.value ->> 'referenceType' = 'QC_RESULT' then entry.value - 'productProposalId'
            else entry.value
          end order by entry.ordinality
        ), '[]'::jsonb)
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

revoke all on function public.submission_inventory_item_at(jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.product_reference_removal_validation(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_product_reference_removal_preflight(uuid, jsonb) from public, anon;
revoke all on function public.admin_remove_product_references(uuid, jsonb) from public, anon;
revoke all on function public.admin_product_reference_occurrences(uuid, integer, integer, text) from public, anon;

grant execute on function public.admin_product_reference_removal_preflight(uuid, jsonb) to authenticated;
grant execute on function public.admin_remove_product_references(uuid, jsonb) to authenticated;
grant execute on function public.admin_product_reference_occurrences(uuid, integer, integer, text) to authenticated;

comment on function public.submission_inventory_item_at(jsonb, text, integer) is
  'Internal exact inventory occurrence lookup by storage category and one-based ordinal.';
comment on function public.product_reference_removal_validation(uuid, jsonb) is
  'Internal atomic validation plan for selective Product reference removal.';
comment on function public.admin_product_reference_removal_preflight(uuid, jsonb) is
  'Read-only Super Admin preflight for selective Product reference removal.';
comment on function public.admin_remove_product_references(uuid, jsonb) is
  'Atomically removes selected current Product links while preserving inventory, Product, Submission, and QC history.';
comment on function public.admin_product_reference_occurrences(uuid, integer, integer, text) is
  'Read-only, occurrence-level Product references with category context and no Submission payload returned.';
