create or replace function public.admin_product_proposal_status_summary()
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

  select jsonb_build_object(
    'total', count(*)::integer,
    'pending', count(*) filter (where proposal.status = 'PENDING')::integer,
    'approved', count(*) filter (where proposal.status = 'APPROVED')::integer,
    'merged', count(*) filter (where proposal.status = 'MERGED')::integer,
    'rejected', count(*) filter (where proposal.status = 'REJECTED')::integer,
    'other', count(*) filter (where proposal.status not in ('PENDING', 'APPROVED', 'MERGED', 'REJECTED') or proposal.status is null)::integer
  ) into v_result
  from public.product_proposals as proposal;

  return v_result;
end;
$$;

comment on function public.admin_product_proposal_status_summary() is
  'One-row, database-wide Super Admin Product QC status summary. It is independent from the paginated proposal list.';

revoke all on function public.admin_product_proposal_status_summary() from public, anon;
grant execute on function public.admin_product_proposal_status_summary() to authenticated;
