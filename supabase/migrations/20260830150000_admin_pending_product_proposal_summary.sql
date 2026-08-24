create or replace function public.admin_pending_product_proposal_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.require_super_admin();

  with pending as materialized (
    select proposal.id, proposal.submission_id
    from public.product_proposals as proposal
    where proposal.status = 'PENDING'
  ), source_inventory_reference as materialized (
    select pending.id as proposal_id, submission.id as submission_id, submission.archived_at
    from pending
    join public.submissions as submission on submission.id = pending.submission_id
    cross join lateral public.submission_inventory_facts(submission.payload) as fact
    where fact.product_proposal_id = pending.id
  ), active_context as materialized (
    select distinct reference.proposal_id,
      detail.is_expected,
      public.station_completion_is_warehouse_site_type(detail.site_type_id) as is_warehouse
    from source_inventory_reference as reference
    join public.station_completion_rows(null) as detail on detail.submission_id = reference.submission_id
    where reference.archived_at is null
  ), any_inventory_reference as materialized (
    select distinct pending.id as proposal_id
    from public.submissions as submission
    cross join lateral public.submission_inventory_facts(submission.payload) as fact
    join pending on pending.id = fact.product_proposal_id
  ), buckets as materialized (
    select pending.id,
      case
        when exists (
          select 1 from active_context
          where active_context.proposal_id = pending.id
            and active_context.is_expected
            and not active_context.is_warehouse
        ) then 'PENGISIAN'
        when exists (
          select 1 from active_context
          where active_context.proposal_id = pending.id
            and active_context.is_expected
            and active_context.is_warehouse
        ) then 'GUDANG'
        when not exists (
          select 1 from any_inventory_reference
          where any_inventory_reference.proposal_id = pending.id
        ) then 'TIDAK_DIGUNAKAN_SAAT_INI'
        else null
      end as bucket
    from pending
  )
  select jsonb_build_object(
    'total_pending', count(*)::integer,
    'pending_pengisian', count(*) filter (where bucket = 'PENGISIAN')::integer,
    'pending_gudang', count(*) filter (where bucket = 'GUDANG')::integer,
    'pending_tidak_digunakan', count(*) filter (where bucket = 'TIDAK_DIGUNAKAN_SAAT_INI')::integer
  ) into v_result
  from buckets;

  if (v_result->>'total_pending')::integer <>
    (v_result->>'pending_pengisian')::integer +
    (v_result->>'pending_gudang')::integer +
    (v_result->>'pending_tidak_digunakan')::integer then
    raise exception 'Pending product proposal context could not be classified.' using errcode = '22023';
  end if;

  return v_result;
end;
$$;

comment on function public.admin_pending_product_proposal_summary() is
  'One-call Super Admin QC Pending context aggregation. Counts PENDING proposals only and never returns Submission payloads.';

revoke all on function public.admin_pending_product_proposal_summary() from public, anon;
grant execute on function public.admin_pending_product_proposal_summary() to authenticated;
