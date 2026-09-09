-- Read-only category summaries for the paginated Super Admin Product list.
create or replace function public.admin_product_reference_categories(p_product_ids uuid[])
returns table (
  product_id uuid,
  categories text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();

  return query
  with requested as materialized (
    select distinct requested_id as product_id
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) as requested_id
    where requested_id is not null
  ), current_facts as materialized (
    select fact.product_id, fact.product_proposal_id, fact.category_label
    from public.submissions as submission
    join public.stations as station on station.id = submission.station_id
    join public.sites as site on site.id = submission.site_id
    join public.site_types as site_type on site_type.id = site.site_type_id
    join public.site_subtypes as subtype on subtype.id = submission.site_subtype_id
    cross join lateral public.submission_product_reference_category_rows(submission.payload) as fact
    where submission.archived_at is null
  ), reference_categories as materialized (
    select fact.product_id, fact.category_label
    from current_facts as fact
    join requested on requested.product_id = fact.product_id
    union all
    select proposal.resolved_product_id as product_id, fact.category_label
    from current_facts as fact
    join public.product_proposals as proposal on proposal.id = fact.product_proposal_id
    join requested on requested.product_id = proposal.resolved_product_id
    where proposal.status in ('APPROVED', 'MERGED')
  )
  select requested.product_id,
    coalesce(
      array_agg(distinct btrim(ref.category_label) order by btrim(ref.category_label))
        filter (where nullif(btrim(ref.category_label), '') is not null),
      '{}'::text[]
    ) as categories
  from requested
  left join reference_categories as ref on ref.product_id = requested.product_id
  group by requested.product_id
  order by requested.product_id;
end;
$$;

revoke all on function public.admin_product_reference_categories(uuid[]) from public, anon;
grant execute on function public.admin_product_reference_categories(uuid[]) to authenticated;

comment on function public.admin_product_reference_categories(uuid[]) is
  'Read-only categories from current DIRECT and resolved QC Product references for requested canonical Product UUIDs.';
