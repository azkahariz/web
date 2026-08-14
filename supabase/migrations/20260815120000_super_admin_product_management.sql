alter table public.products drop constraint if exists products_source_origin_check;
alter table public.products add constraint products_source_origin_check
  check (source_origin in ('SPREADSHEET', 'QC', 'ADMIN'));

create or replace function public.admin_product_summary()
returns table (total_count integer, active_count integer, inactive_count integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  return query
  select count(*)::integer,
         count(*) filter (where product.active)::integer,
         count(*) filter (where not product.active)::integer
  from public.products as product;
end;
$$;

create or replace function public.admin_list_products(
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null,
  p_sort_field text default 'brand',
  p_sort_direction text default 'asc'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := case when p_page_size in (50, 100, 200) then p_page_size else 50 end;
  v_search text := nullif(btrim(p_search), '');
  v_sort_field text := case when p_sort_field in ('brand', 'model') then p_sort_field else 'brand' end;
  v_sort_direction text := case when lower(p_sort_direction) = 'desc' then 'desc' else 'asc' end;
begin
  perform public.require_super_admin();
  return (
    with filtered as materialized (
      select product.id, product.brand, product.model, product.active, product.source_origin
      from public.products as product
      where v_search is null
        or product.brand ilike '%' || v_search || '%'
        or product.model ilike '%' || v_search || '%'
    ),
    paged as (
      select filtered.*
      from filtered
      order by
        case when v_sort_field = 'brand' and v_sort_direction = 'asc' then brand end asc,
        case when v_sort_field = 'brand' and v_sort_direction = 'desc' then brand end desc,
        case when v_sort_field = 'model' and v_sort_direction = 'asc' then model end asc,
        case when v_sort_field = 'model' and v_sort_direction = 'desc' then model end desc,
        case when v_sort_field = 'brand' then model end asc,
        case when v_sort_field = 'model' then brand end asc,
        id asc
      limit v_page_size offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'totalCount', (select count(*)::integer from filtered),
      'rows', coalesce((select jsonb_agg(to_jsonb(paged)) from paged), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_create_product(p_brand text, p_model text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_brand text := btrim(p_brand);
  v_model text := btrim(p_model);
  v_product_id uuid;
begin
  v_admin_id := public.require_super_admin();
  if nullif(v_brand, '') is null or nullif(v_model, '') is null then
    raise exception 'Brand and model are required.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.products as product
    where public.normalize_product_text(product.brand) = public.normalize_product_text(v_brand)
      and public.normalize_product_text(product.model) = public.normalize_product_text(v_model)
  ) then
    raise exception 'Canonical product already exists.' using errcode = '23505';
  end if;
  insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
  values (v_brand, v_model, true, 'ADMIN', false)
  returning id into v_product_id;
  insert into public.admin_audit_log (admin_auth_user_id, action, target_type, target_id, metadata)
  values (v_admin_id, 'PRODUCT_CREATE', 'product', v_product_id,
    jsonb_build_object('after', jsonb_build_object('brand', v_brand, 'model', v_model, 'active', true, 'source_origin', 'ADMIN')));
  return v_product_id;
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
  v_brand text := btrim(p_brand);
  v_model text := btrim(p_model);
  v_old public.products%rowtype;
begin
  v_admin_id := public.require_super_admin();
  if nullif(v_brand, '') is null or nullif(v_model, '') is null then
    raise exception 'Brand and model are required.' using errcode = '22023';
  end if;
  select * into v_old from public.products where id = p_product_id for update;
  if not found then return false; end if;
  if exists (
    select 1 from public.products as product
    where product.id <> p_product_id
      and public.normalize_product_text(product.brand) = public.normalize_product_text(v_brand)
      and public.normalize_product_text(product.model) = public.normalize_product_text(v_model)
  ) then
    raise exception 'Canonical product already exists.' using errcode = '23505';
  end if;
  if v_old.brand is distinct from v_brand or v_old.model is distinct from v_model then
    insert into public.product_aliases (product_id, brand_alias, model_alias, normalized_brand, normalized_model)
    values (p_product_id, v_old.brand, v_old.model,
      public.normalize_product_text(v_old.brand), public.normalize_product_text(v_old.model))
    on conflict (product_id, normalized_brand, normalized_model) do nothing;
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

revoke all on function public.admin_product_summary() from public, anon;
revoke all on function public.admin_list_products(integer, integer, text, text, text) from public, anon;
revoke all on function public.admin_create_product(text, text) from public, anon;
revoke all on function public.admin_update_product(uuid, text, text) from public, anon;
revoke all on function public.admin_set_product_active(uuid, boolean) from public, anon;

grant execute on function public.admin_product_summary() to authenticated;
grant execute on function public.admin_list_products(integer, integer, text, text, text) to authenticated;
grant execute on function public.admin_create_product(text, text) to authenticated;
grant execute on function public.admin_update_product(uuid, text, text) to authenticated;
grant execute on function public.admin_set_product_active(uuid, boolean) to authenticated;
