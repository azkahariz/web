-- Extend selective Product Reference Move to current direct inventory and resolved QC results.
-- This is deliberately separate from Product Merge: products and aliases are never changed here.

create or replace function public.admin_product_references(
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
    with direct_rows as (
      select
        'DIRECT'::text as reference_type,
        'direct:' || row.submission_id::text || ':' || row.item_id as reference_id,
        row.submission_id, row.submission_version as expected_submission_version,
        null::uuid as proposal_id, null::timestamptz as expected_proposal_updated_at,
        row.station_name, row.site_name, row.site_type_name, row.site_subtype_name,
        row.category_name, row.function_categories, row.item_id, row.unit_count,
        row.active_lock, row.lock_operator_name, null::text as qc_status,
        null::text as proposed_brand, null::text as proposed_model
      from public.product_direct_reference_rows(p_product_id) as row
      where row.archived_at is null
    ), qc_rows as (
      select
        'QC_RESULT'::text as reference_type,
        'qc:' || proposal.id::text as reference_id,
        submission.id as submission_id, submission.version as expected_submission_version,
        proposal.id as proposal_id, proposal.updated_at as expected_proposal_updated_at,
        station.name as station_name, site.name as site_name, site_type.name as site_type_name,
        site_subtype.name as site_subtype_name, 'Hasil QC'::text as category_name,
        '{}'::text[] as function_categories, null::text as item_id, 0::integer as unit_count,
        (submission.locked_by_session_id is not null and submission.lock_last_activity_at >= now() - interval '5 minutes') as active_lock,
        null::text as lock_operator_name, proposal.status as qc_status,
        proposal.proposed_brand, proposal.proposed_model
      from public.product_proposals as proposal
      join public.submissions as submission on submission.id = proposal.submission_id and submission.archived_at is null
      join public.stations as station on station.id = submission.station_id
      join public.sites as site on site.id = submission.site_id
      join public.site_types as site_type on site_type.id = site.site_type_id
      join public.site_subtypes as site_subtype on site_subtype.id = submission.site_subtype_id
      where proposal.resolved_product_id = p_product_id
        and proposal.status in ('APPROVED', 'MERGED')
    ), rows as materialized (
      select * from direct_rows union all select * from qc_rows
    ), filtered as materialized (
      select * from rows
      where v_search is null or concat_ws(' ', station_name, site_name, site_type_name, site_subtype_name,
        category_name, proposed_brand, proposed_model, qc_status) ilike '%' || v_search || '%'
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
        'functionCategories', function_categories, 'itemId', item_id, 'unitCount', unit_count,
        'activeLock', active_lock, 'lockOwnerDisplayName', lock_operator_name,
        'qcStatus', qc_status, 'proposedBrand', proposed_brand, 'proposedModel', proposed_model
      ) order by station_name, site_name, site_subtype_name, reference_type, reference_id) from paged), '[]'::jsonb),
      'totalCount', (select count(*)::integer from filtered), 'page', v_page, 'pageSize', v_page_size
    )
  );
end;
$$;

create or replace function public.product_reference_move_validation(p_source_product_id uuid, p_target_product_id uuid, p_references jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_source public.products%rowtype; v_target public.products%rowtype; v_direct integer; v_qc integer; v_submission integer; v_site integer; v_units integer;
begin
  select * into v_source from public.products where id = p_source_product_id;
  if not found then return jsonb_build_object('status','source_not_found'); end if;
  select * into v_target from public.products where id = p_target_product_id;
  if not found then return jsonb_build_object('status','target_not_found'); end if;
  if p_source_product_id = p_target_product_id then return jsonb_build_object('status','same_product'); end if;
  if not v_target.active then return jsonb_build_object('status','target_inactive'); end if;
  if jsonb_typeof(p_references) <> 'array' or jsonb_array_length(p_references) not between 1 and 500 then return jsonb_build_object('status','invalid_selection'); end if;
  if exists (select 1 from jsonb_array_elements(p_references) r(value) where
    (coalesce(r.value->>'referenceType','DIRECT') = 'DIRECT' and (coalesce(r.value->>'submissionId','') !~* '^[0-9a-f]{8}-' or coalesce(r.value->>'expectedSubmissionVersion','') !~ '^[0-9]+$' or nullif(btrim(r.value->>'itemId'),'') is null)) or
    (r.value->>'referenceType' = 'QC_RESULT' and (coalesce(r.value->>'proposalId','') !~* '^[0-9a-f]{8}-' or nullif(r.value->>'expectedProposalUpdatedAt','') is null)) or
    coalesce(r.value->>'referenceType','DIRECT') not in ('DIRECT','QC_RESULT')
  ) then return jsonb_build_object('status','invalid_selection'); end if;
  if exists (select 1 from jsonb_array_elements(p_references) r(value) group by coalesce(r.value->>'referenceType','DIRECT'), coalesce(r.value->>'submissionId',r.value->>'proposalId'), coalesce(r.value->>'itemId','') having count(*) > 1) then return jsonb_build_object('status','invalid_selection'); end if;
  if exists (with selected as (select (value->>'submissionId')::uuid id,(value->>'expectedSubmissionVersion')::integer version from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT') select 1 from selected s left join public.submissions x on x.id=s.id where x.id is null) then return jsonb_build_object('status','submission_not_found'); end if;
  if exists (with selected as (select (value->>'submissionId')::uuid id from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT') select 1 from selected s join public.submissions x on x.id=s.id where x.archived_at is not null) then return jsonb_build_object('status','archived_submission'); end if;
  if exists (with selected as (select (value->>'submissionId')::uuid id,(value->>'expectedSubmissionVersion')::integer version from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT') select 1 from selected s join public.submissions x on x.id=s.id where x.version<>s.version) then return jsonb_build_object('status','version_conflict'); end if;
  if exists (with selected as (select (value->>'submissionId')::uuid id from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT') select 1 from selected s join public.submissions x on x.id=s.id where x.locked_by_session_id is not null and x.lock_last_activity_at >= now()-interval '5 minutes') then return jsonb_build_object('status','active_lock'); end if;
  if exists (with selected as (select (value->>'proposalId')::uuid id,(value->>'expectedProposalUpdatedAt')::timestamptz updated_at from jsonb_array_elements(p_references) where value->>'referenceType'='QC_RESULT') select 1 from selected s left join public.product_proposals p on p.id=s.id left join public.submissions x on x.id=p.submission_id where p.id is null or x.id is null or p.status not in ('APPROVED','MERGED') or p.resolved_product_id is distinct from p_source_product_id or date_trunc('milliseconds', p.updated_at) is distinct from date_trunc('milliseconds', s.updated_at) or x.archived_at is not null) then return jsonb_build_object('status','reference_changed'); end if;
  if exists (with selected as (select (value->>'submissionId')::uuid submission_id,btrim(value->>'itemId') item_id from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT') select 1 from selected s where not exists (select 1 from public.submissions x cross join lateral jsonb_each(case when jsonb_typeof(x.payload->'inventory')='object' then x.payload->'inventory' else '{}'::jsonb end) c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.value)='array' then c.value else '[]'::jsonb end) i(value) where x.id=s.submission_id and i.value->>'id'=s.item_id)) then return jsonb_build_object('status','missing_item'); end if;
  if exists (with selected as (select (value->>'submissionId')::uuid submission_id,btrim(value->>'itemId') item_id from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT') select 1 from selected s join public.submissions x on x.id=s.submission_id cross join lateral jsonb_each(case when jsonb_typeof(x.payload->'inventory')='object' then x.payload->'inventory' else '{}'::jsonb end) c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.value)='array' then c.value else '[]'::jsonb end) i(value) where i.value->>'id'=s.item_id and nullif(i.value->>'productProposalId','') is not null) then return jsonb_build_object('status','unsupported_reference'); end if;
  if exists (with selected as (select (value->>'submissionId')::uuid submission_id,btrim(value->>'itemId') item_id from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT') select 1 from selected s join public.submissions x on x.id=s.submission_id cross join lateral jsonb_each(case when jsonb_typeof(x.payload->'inventory')='object' then x.payload->'inventory' else '{}'::jsonb end) c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.value)='array' then c.value else '[]'::jsonb end) i(value) where i.value->>'id'=s.item_id and i.value->>'productId' is distinct from p_source_product_id::text) then return jsonb_build_object('status','source_mismatch'); end if;
  if exists (with selected as (select (value->>'submissionId')::uuid submission_id,btrim(value->>'itemId') item_id from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT'), occurrences as (select s.submission_id,s.item_id,count(i.value) count_items,bool_or(i.value->>'productId'=p_source_product_id::text) matches,bool_or(nullif(i.value->>'productProposalId','') is not null) proposal from selected s join public.submissions x on x.id=s.submission_id cross join lateral jsonb_each(case when jsonb_typeof(x.payload->'inventory')='object' then x.payload->'inventory' else '{}'::jsonb end) c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.value)='array' then c.value else '[]'::jsonb end) i(value) where i.value->>'id'=s.item_id group by s.submission_id,s.item_id) select 1 from selected s left join occurrences o using(submission_id,item_id) where coalesce(o.count_items,0)<>1 or not coalesce(o.matches,false) or coalesce(o.proposal,false)) then return jsonb_build_object('status','reference_changed'); end if;
  select count(*) filter(where coalesce(value->>'referenceType','DIRECT')='DIRECT'), count(*) filter(where value->>'referenceType'='QC_RESULT') into v_direct,v_qc from jsonb_array_elements(p_references);
  select count(distinct q.id),count(distinct s.site_id) into v_submission,v_site from (select (value->>'submissionId')::uuid id from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT' union select p.submission_id from jsonb_array_elements(p_references) r(value) join public.product_proposals p on p.id=(r.value->>'proposalId')::uuid where r.value->>'referenceType'='QC_RESULT') q join public.submissions s on s.id=q.id;
  select coalesce(sum(case when jsonb_typeof(i.value->'units')='array' then jsonb_array_length(i.value->'units') when coalesce(i.value->>'quantity','') ~ '^[0-9]+$' then greatest((i.value->>'quantity')::integer,1) else 1 end),0)::integer into v_units from jsonb_array_elements(p_references) r(value) join public.submissions s on s.id=(r.value->>'submissionId')::uuid cross join lateral jsonb_each(case when jsonb_typeof(s.payload->'inventory')='object' then s.payload->'inventory' else '{}'::jsonb end) c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.value)='array' then c.value else '[]'::jsonb end) i(value) where coalesce(r.value->>'referenceType','DIRECT')='DIRECT' and i.value->>'id'=r.value->>'itemId';
  return jsonb_build_object('status','ready','source',jsonb_build_object('id',v_source.id,'brand',v_source.brand,'model',v_source.model),'target',jsonb_build_object('id',v_target.id,'brand',v_target.brand,'model',v_target.model),'referenceCount',v_direct+v_qc,'directReferenceCount',v_direct,'qcResultCount',v_qc,'unitCount',v_units,'siteCount',v_site,'submissionCount',v_submission);
end; $$;

create or replace function public.admin_product_reference_move_preflight(p_source_product_id uuid,p_target_product_id uuid,p_references jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$ begin perform public.require_super_admin(); return public.product_reference_move_validation(p_source_product_id,p_target_product_id,p_references); end; $$;

create or replace function public.admin_move_product_references(p_source_product_id uuid,p_target_product_id uuid,p_references jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_admin uuid; v_plan jsonb; v_target public.products%rowtype; v_submission public.submissions%rowtype; v_item_ids text[]; v_inventory jsonb; v_versions jsonb := '[]'::jsonb; v_qc_ids jsonb;
begin
  v_admin:=public.require_super_admin(); v_plan:=public.product_reference_move_validation(p_source_product_id,p_target_product_id,p_references); if v_plan->>'status'<>'ready' then return v_plan; end if;
  perform p.id from public.product_proposals p join (select (value->>'proposalId')::uuid id from jsonb_array_elements(p_references) where value->>'referenceType'='QC_RESULT') s on s.id=p.id order by p.id for update of p;
  perform s.id from public.submissions s join (select distinct (value->>'submissionId')::uuid id from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT' union select p.submission_id from jsonb_array_elements(p_references) r(value) join public.product_proposals p on p.id=(r.value->>'proposalId')::uuid where r.value->>'referenceType'='QC_RESULT') x on x.id=s.id order by s.id for update of s;
  v_plan:=public.product_reference_move_validation(p_source_product_id,p_target_product_id,p_references); if v_plan->>'status'<>'ready' then return v_plan; end if;
  select * into v_target from public.products where id=p_target_product_id;
  for v_submission in select s.* from public.submissions s join (select distinct (value->>'submissionId')::uuid id from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT') x on x.id=s.id order by s.id loop
    select array_agg(btrim(value->>'itemId') order by btrim(value->>'itemId')) into v_item_ids from jsonb_array_elements(p_references) where coalesce(value->>'referenceType','DIRECT')='DIRECT' and (value->>'submissionId')::uuid=v_submission.id;
    select jsonb_object_agg(c.key,case when jsonb_typeof(c.value)='array' then (select coalesce(jsonb_agg(case when i.value->>'id'=any(v_item_ids) then i.value||jsonb_build_object('productId',v_target.id,'brand',v_target.brand,'model',v_target.model) else i.value end order by i.ordinality),'[]'::jsonb) from jsonb_array_elements(c.value) with ordinality i(value,ordinality)) else c.value end order by c.key) into v_inventory from jsonb_each(v_submission.payload->'inventory') c(key,value);
    update public.submissions set payload=jsonb_set(payload,'{inventory}',v_inventory,false),version=version+1,last_saved_at=now() where id=v_submission.id;
    insert into public.admin_audit_log(admin_auth_user_id,action,target_type,target_id,metadata) values(v_admin,'PRODUCT_REFERENCE_MOVE','submission',v_submission.id,jsonb_build_object('sourceProduct',v_plan->'source','targetProduct',v_plan->'target','itemIds',to_jsonb(v_item_ids),'referenceCount',cardinality(v_item_ids),'oldSubmissionVersion',v_submission.version,'newSubmissionVersion',v_submission.version+1));
    v_versions:=v_versions||jsonb_build_array(jsonb_build_object('submissionId',v_submission.id,'oldVersion',v_submission.version,'newVersion',v_submission.version+1));
  end loop;
  update public.product_proposals set resolved_product_id=p_target_product_id where id in (select (value->>'proposalId')::uuid from jsonb_array_elements(p_references) where value->>'referenceType'='QC_RESULT');
  select coalesce(jsonb_agg((value->>'proposalId')::uuid),'[]'::jsonb) into v_qc_ids from jsonb_array_elements(p_references) where value->>'referenceType'='QC_RESULT';
  insert into public.admin_audit_log(admin_auth_user_id,action,target_type,target_id,metadata) values(v_admin,'PRODUCT_REFERENCE_MOVE','product',p_source_product_id,jsonb_build_object('sourceProduct',v_plan->'source','targetProduct',v_plan->'target','referenceCount',v_plan->'referenceCount','directReferenceCount',v_plan->'directReferenceCount','qcResultCount',v_plan->'qcResultCount','qcProposalIds',v_qc_ids,'submissionVersions',v_versions));
  return v_plan||jsonb_build_object('status','moved','submissionVersions',v_versions,'qcProposalIds',v_qc_ids);
end; $$;

revoke all on function public.admin_product_references(uuid,integer,integer,text) from public, anon;
grant execute on function public.admin_product_references(uuid,integer,integer,text) to authenticated;
revoke all on function public.product_reference_move_validation(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_product_reference_move_preflight(uuid,uuid,jsonb) from public, anon;
revoke all on function public.admin_move_product_references(uuid,uuid,jsonb) from public, anon;
grant execute on function public.admin_product_reference_move_preflight(uuid,uuid,jsonb) to authenticated;
grant execute on function public.admin_move_product_references(uuid,uuid,jsonb) to authenticated;
