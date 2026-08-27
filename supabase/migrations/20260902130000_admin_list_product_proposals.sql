create or replace function public.admin_list_product_proposals(
  p_status text default 'PENDING',
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null,
  p_station_category_id uuid default null,
  p_site_type_id uuid default null,
  p_qc_context text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 10), 200);
  v_result jsonb;
begin
  perform public.require_super_admin();
  if p_status not in ('PENDING', 'APPROVED', 'MERGED', 'REJECTED') then
    raise exception 'Unsupported product proposal status.' using errcode = '22023';
  end if;

  with enriched as materialized (
    select proposal.id, proposal.station_id, proposal.submission_id, proposal.operator_name,
      proposal.proposed_brand, proposal.proposed_model, proposal.normalized_brand, proposal.normalized_model,
      proposal.status, proposal.resolved_product_id, proposal.reviewed_by, proposal.reviewed_at, proposal.review_note,
      proposal.created_at, station.station_category_id, submission.archived_at,
      site.name as site_name, site.site_type_id, site_type.name as site_type_name, subtype.name as subtype_name,
      reviewer.username as reviewer_username, reviewer.display_name as reviewer_display_name,
      coalesce((
        select array_agg(distinct fact.category_label order by fact.category_label)
        from public.submission_inventory_facts(submission.payload) as fact
        where fact.product_proposal_id = proposal.id
      ), '{}'::text[]) as categories
    from public.product_proposals as proposal
    left join public.stations as station on station.id = proposal.station_id
    left join public.submissions as submission on submission.id = proposal.submission_id
    left join public.sites as site on site.id = submission.site_id
    left join public.site_types as site_type on site_type.id = site.site_type_id
    left join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
    left join public.super_admins as reviewer on reviewer.auth_user_id = proposal.reviewed_by
    where proposal.status = p_status
  ), classified as materialized (
    select enriched.*,
      case when submission_id is null then 'missing-submission'
        when cardinality(categories) = 0 then 'orphaned' else 'resolved' end as context_state,
      case when submission_id is null then null
        when archived_at is not null then 'tidak-digunakan-saat-ini'
        when site_type_name = 'Gudang' then 'gudang'
        when cardinality(categories) > 0 then 'pengisian'
        else 'tidak-digunakan-saat-ini' end as qc_context
    from enriched
  ), filtered as materialized (
    select * from classified
    where (p_station_category_id is null or station_category_id = p_station_category_id)
      and (p_site_type_id is null or site_type_id = p_site_type_id)
      and (p_qc_context is null or p_qc_context = 'all' or qc_context = p_qc_context)
      and (nullif(btrim(p_search), '') is null or lower(concat_ws(' ', proposed_brand, proposed_model, site_name, subtype_name, array_to_string(categories, ' '))) like '%' || lower(btrim(p_search)) || '%')
  ), numbered as materialized (
    select filtered.*, row_number() over (order by created_at desc, id desc) as ordinal, count(*) over ()::integer as total_count
    from filtered
  )
  select jsonb_build_object(
    'page', v_page,
    'pageSize', v_page_size,
    'totalCount', coalesce(max(total_count), 0),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'station_id', station_id, 'submission_id', submission_id, 'operator_name', operator_name,
      'proposed_brand', proposed_brand, 'proposed_model', proposed_model, 'normalized_brand', normalized_brand,
      'normalized_model', normalized_model, 'status', status, 'resolved_product_id', resolved_product_id,
      'reviewed_by', reviewed_by, 'reviewed_at', reviewed_at, 'review_note', review_note, 'created_at', created_at,
      'reviewer', case when reviewed_by is null then null else jsonb_build_object('username', reviewer_username, 'displayName', coalesce(nullif(btrim(reviewer_display_name), ''), reviewer_username)) end,
      'context', jsonb_build_object('state', context_state, 'siteName', site_name, 'subtypeName', subtype_name,
        'categories', to_jsonb(categories), 'stationCategoryId', station_category_id, 'siteTypeId', site_type_id,
        'stationCategoryName', null, 'siteTypeName', site_type_name, 'qcContext', qc_context)
    ) order by ordinal) filter (where ordinal > (v_page - 1) * v_page_size and ordinal <= v_page * v_page_size), '[]'::jsonb)
  ) into v_result
  from numbered;

  return v_result;
end;
$$;

comment on function public.admin_list_product_proposals(text, integer, integer, text, uuid, uuid, text) is
  'Paginated Super Admin Product QC list. Filters execute before pagination and Submission payloads never leave the database.';

revoke all on function public.admin_list_product_proposals(text, integer, integer, text, uuid, uuid, text) from public, anon;
grant execute on function public.admin_list_product_proposals(text, integer, integer, text, uuid, uuid, text) to authenticated;
