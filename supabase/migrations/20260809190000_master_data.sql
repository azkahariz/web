create extension if not exists pgcrypto with schema extensions;

create or replace function public.touch_master_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index stations_name_key on public.stations (lower(btrim(name)));

create table public.site_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index site_types_name_key on public.site_types (lower(btrim(name)));

create table public.item_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index item_profiles_name_key on public.item_profiles (lower(btrim(name)));

create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index items_name_key on public.items (lower(btrim(name)));

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_categories_name_key on public.product_categories (lower(btrim(name)));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (btrim(brand) <> ''),
  model text not null check (btrim(model) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_brand_model_key
  on public.products (lower(btrim(brand)), lower(btrim(model)));

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  site_type_id uuid not null references public.site_types(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sites_station_name_key
  on public.sites (station_id, lower(btrim(name)));

create table public.site_subtypes (
  id uuid primary key default gen_random_uuid(),
  site_type_id uuid not null references public.site_types(id) on delete restrict,
  item_profile_id uuid references public.item_profiles(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index site_subtypes_type_name_key
  on public.site_subtypes (site_type_id, lower(btrim(name)));

create table public.profile_items (
  id uuid primary key default gen_random_uuid(),
  item_profile_id uuid not null references public.item_profiles(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_profile_id, item_id)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'stations', 'site_types', 'sites', 'item_profiles', 'site_subtypes',
    'items', 'profile_items', 'product_categories', 'products'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_master_updated_at()',
      table_name || '_touch_updated_at',
      table_name
    );
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

comment on schema public is
  'Master Aloptama is synchronized from Spreadsheet/CSV. Routine editing remains in the source spreadsheet.';
