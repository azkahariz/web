alter table public.site_types
  add column requires_site_subtype_assignment boolean not null default false;

create unique index sites_id_site_type_key on public.sites (id, site_type_id);
create unique index site_subtypes_id_site_type_key on public.site_subtypes (id, site_type_id);

create table public.site_subtype_assignments (
  site_id uuid not null,
  site_subtype_id uuid not null,
  site_type_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_id, site_subtype_id),
  foreign key (site_id, site_type_id)
    references public.sites (id, site_type_id) on delete cascade,
  foreign key (site_subtype_id, site_type_id)
    references public.site_subtypes (id, site_type_id) on delete cascade
);

create index site_subtype_assignments_subtype_idx
  on public.site_subtype_assignments (site_subtype_id, site_id)
  where active;

create trigger site_subtype_assignments_touch_updated_at
before update on public.site_subtype_assignments
for each row execute function public.touch_master_updated_at();

alter table public.site_subtype_assignments enable row level security;
revoke all on table public.site_subtype_assignments from public, anon, authenticated;
grant select, insert, update, delete on table public.site_subtype_assignments to service_role;

-- This UUID is the authoritative AWOS Kategori III Site Type. Runtime validation
-- below uses only UUID relations; labels are not parsed by the database.
update public.site_types
set requires_site_subtype_assignment = true
where id = '20e3dd30-2334-4155-9986-77efdc04b145'::uuid;

with seed (site_id, subtype_ids) as (
  values
('0fa1f90f-7ef3-42ab-99b8-fb2c95fc8aaf'::uuid, array['f09d2c73-05e4-461f-8c92-09a34bc4627d'::uuid, 'dcbdc013-d650-4ada-99c6-95749b8a9667'::uuid, '15fcc6b9-b4da-406b-b4e8-d7a8a8fa80f0'::uuid, 'f268f231-fc3f-423d-b92d-39d835f526d8'::uuid]::uuid[]),
  ('16369053-559b-4b9f-8e0c-f63298ccc6a9'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('1800ed86-0391-4ca4-9d8f-80ebd3f0f289'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('1a4726f6-31d1-4fba-9652-2cd6be429b99'::uuid, array['ce949b63-5487-4188-bcfb-c86f6267875e'::uuid, 'a6c1b955-9421-4ec1-aec2-58cbd85818e3'::uuid, '580ea54d-5391-4116-bc3f-28082b35584c'::uuid, '281a0164-5af8-4a65-a4cb-c756903ff7c2'::uuid]::uuid[]),
  ('24946dab-84db-44e3-8376-df94100a1cee'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('24e992b7-8683-4f12-92af-2a594ab3b2c0'::uuid, array['891c96c6-db4b-45c3-9046-aaa624992fd3'::uuid, '207de933-d1af-472b-ad81-a4b1081c615b'::uuid, '4163a413-f789-40d2-8c3c-ed455246a8f9'::uuid, 'e911b61a-1d5e-48f4-8142-bcc250b3c46f'::uuid]::uuid[]),
  ('492d0f70-5b03-4761-a616-20de285f5dd1'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('4f280330-da17-44ee-bbb2-d9ce8fab463c'::uuid, array['891c96c6-db4b-45c3-9046-aaa624992fd3'::uuid, '207de933-d1af-472b-ad81-a4b1081c615b'::uuid, '4163a413-f789-40d2-8c3c-ed455246a8f9'::uuid, 'e911b61a-1d5e-48f4-8142-bcc250b3c46f'::uuid]::uuid[]),
  ('501ccc57-e27b-464d-96a7-bed8d0add55d'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('50d16c32-5e07-4824-bd64-728276c199fc'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('55634a45-f3ad-4edb-ae21-0693d5cbfa6b'::uuid, array['891c96c6-db4b-45c3-9046-aaa624992fd3'::uuid, '207de933-d1af-472b-ad81-a4b1081c615b'::uuid, '4163a413-f789-40d2-8c3c-ed455246a8f9'::uuid, 'e911b61a-1d5e-48f4-8142-bcc250b3c46f'::uuid]::uuid[]),
  ('59e81d43-832d-483e-8145-6f392919b1fa'::uuid, array['ce949b63-5487-4188-bcfb-c86f6267875e'::uuid, 'a6c1b955-9421-4ec1-aec2-58cbd85818e3'::uuid, '580ea54d-5391-4116-bc3f-28082b35584c'::uuid, '281a0164-5af8-4a65-a4cb-c756903ff7c2'::uuid]::uuid[]),
  ('5be3e368-0620-4383-84ba-727e41155258'::uuid, array['8bc42f01-63a3-45d7-8091-c7792e357d36'::uuid, 'ef0ac687-62c6-404d-ab6c-d56f46fe95ac'::uuid, 'ecd7cee7-38eb-4c78-8865-10e28fc406f4'::uuid, '26ed9476-91c7-4483-8d8c-9c3dc77729b7'::uuid]::uuid[]),
  ('7a027ce2-76a5-4eed-8465-8c80200cc651'::uuid, array['ce949b63-5487-4188-bcfb-c86f6267875e'::uuid, 'a6c1b955-9421-4ec1-aec2-58cbd85818e3'::uuid, '580ea54d-5391-4116-bc3f-28082b35584c'::uuid, '281a0164-5af8-4a65-a4cb-c756903ff7c2'::uuid]::uuid[]),
  ('7ba6e553-1051-4852-8910-0c1ad140065d'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('85341ee6-8e2f-47c8-b731-819efdb10146'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('866670f5-013a-4f25-8332-f2535a282ac8'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('8d8be3dd-ec19-4d85-b51d-c189e44c0637'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('8fadcc2b-5c79-4e44-8aed-4a09847c2780'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('9325000f-1589-47d1-b5ed-9753ac5f4248'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('a1c421a9-59ca-4a30-903c-eb7ad77e2068'::uuid, array['f09d2c73-05e4-461f-8c92-09a34bc4627d'::uuid, 'dcbdc013-d650-4ada-99c6-95749b8a9667'::uuid, '15fcc6b9-b4da-406b-b4e8-d7a8a8fa80f0'::uuid, 'f268f231-fc3f-423d-b92d-39d835f526d8'::uuid]::uuid[]),
  ('a48806b0-6d96-48ca-a0b1-6fdb58ee1c1f'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('a861d007-0e7a-4d52-988c-bb85aed86cdb'::uuid, array['8bc42f01-63a3-45d7-8091-c7792e357d36'::uuid, 'ef0ac687-62c6-404d-ab6c-d56f46fe95ac'::uuid, 'ecd7cee7-38eb-4c78-8865-10e28fc406f4'::uuid, '26ed9476-91c7-4483-8d8c-9c3dc77729b7'::uuid]::uuid[]),
  ('ab4ec2c8-bce4-458b-9e3a-d203d7f76299'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('ae59fdae-4173-4e21-9c0b-304d5574a64d'::uuid, array['891c96c6-db4b-45c3-9046-aaa624992fd3'::uuid, '207de933-d1af-472b-ad81-a4b1081c615b'::uuid, '4163a413-f789-40d2-8c3c-ed455246a8f9'::uuid, 'e911b61a-1d5e-48f4-8142-bcc250b3c46f'::uuid]::uuid[]),
  ('b1383080-f53a-4313-8358-64769b3ddbdb'::uuid, array['8bc42f01-63a3-45d7-8091-c7792e357d36'::uuid, 'ef0ac687-62c6-404d-ab6c-d56f46fe95ac'::uuid, 'ecd7cee7-38eb-4c78-8865-10e28fc406f4'::uuid, '26ed9476-91c7-4483-8d8c-9c3dc77729b7'::uuid]::uuid[]),
  ('b3e3112c-795d-4f30-beea-22f6656904ab'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('bfdb48b1-0dc5-46f0-aa67-d67ae64e08d6'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('c0544813-a9f6-4664-8112-112d0b5a52d5'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('c1def8a7-0aba-402f-8911-15fa50c6e7fc'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('c3578a4c-3503-4e3b-b68e-ea436af32c44'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('c9ae8f9d-a640-4b50-856f-9c91832d924f'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('cb7a192c-ce93-4cd8-a5e7-4323356f63c6'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('cc0e43e9-da1e-467a-acb0-c0a62cc4368e'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('cd5167ab-e1b2-4939-8040-85dc4259d258'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('d41ecaac-8286-4bb1-870b-6b42148c5a11'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('d96c5da4-877c-4bf9-916b-f7e0bea13a9d'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('d98e37f2-b32d-4c18-a686-6850f1a537d6'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('f0ed1d79-49c5-4850-8ed5-69bad50a4bab'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('f3152c2b-8e6d-4ac2-bed1-906a561521d4'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[]),
  ('f52d749d-de2e-471d-bbfc-8d811355703f'::uuid, array['16b12328-79b9-49ae-8037-951a432b6d1f'::uuid, '8e86f962-6a7a-4396-b5c2-d7525cb201b4'::uuid, '8a2b093e-c5db-4c49-8149-6873fb230db9'::uuid, '9b13d244-050f-4b0f-bf5d-e64e74d5f353'::uuid]::uuid[])
), expanded as (
  select seed.site_id, unnest(seed.subtype_ids) as site_subtype_id
  from seed
)
insert into public.site_subtype_assignments (site_id, site_subtype_id, site_type_id)
select expanded.site_id, expanded.site_subtype_id, site.site_type_id
from expanded
join public.sites as site on site.id = expanded.site_id
join public.site_subtypes as subtype
  on subtype.id = expanded.site_subtype_id
 and subtype.site_type_id = site.site_type_id
on conflict (site_id, site_subtype_id) do update
set active = true,
    site_type_id = excluded.site_type_id;

do $$
begin
  if exists (
    select 1
    from public.sites as site
    join public.site_types as site_type on site_type.id = site.site_type_id
    where site_type.requires_site_subtype_assignment
      and not exists (
        select 1
        from public.site_subtype_assignments as assignment
        where assignment.site_id = site.id and assignment.active
      )
  ) then
    raise exception 'Required Site subtype assignments are incomplete.' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.site_subtype_is_allowed(
  p_site_id uuid,
  p_site_subtype_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sites as site
    join public.site_types as site_type
      on site_type.id = site.site_type_id
     and site_type.active
    join public.site_subtypes as subtype
      on subtype.id = p_site_subtype_id
     and subtype.site_type_id = site.site_type_id
     and subtype.active
    where site.id = p_site_id
      and site.active
      and (
        not site_type.requires_site_subtype_assignment
        or exists (
          select 1
          from public.site_subtype_assignments as assignment
          where assignment.site_id = site.id
            and assignment.site_subtype_id = subtype.id
            and assignment.site_type_id = site.site_type_id
            and assignment.active
        )
      )
  )
$$;

create or replace function public.require_submission_scope(
  p_site_id uuid,
  p_site_subtype_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
begin
  v_station_id := public.current_station_id();
  if v_station_id is null then
    raise exception 'Active station account is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.sites as site
    where site.id = p_site_id
      and site.station_id = v_station_id
      and site.active
  ) then
    raise exception 'Site is outside the station account scope.' using errcode = '42501';
  end if;

  if not public.site_subtype_is_allowed(p_site_id, p_site_subtype_id) then
    raise exception 'site_subtype_not_allowed' using
      errcode = '22023',
      hint = 'Refresh the Site master and select an available subtype.';
  end if;

  return v_station_id;
end;
$$;

create or replace function public.enforce_submission_site_subtype()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.site_subtype_is_allowed(new.site_id, new.site_subtype_id) then
    raise exception 'site_subtype_not_allowed' using
      errcode = '22023',
      hint = 'Refresh the Site master and select an available subtype.';
  end if;
  return new;
end;
$$;

create trigger submissions_validate_site_subtype
before insert or update of site_id, site_subtype_id on public.submissions
for each row execute function public.enforce_submission_site_subtype();

revoke all on function public.site_subtype_is_allowed(uuid, uuid) from public, anon;
revoke all on function public.require_submission_scope(uuid, uuid) from public, anon, authenticated;
revoke all on function public.enforce_submission_site_subtype() from public, anon, authenticated;
grant execute on function public.site_subtype_is_allowed(uuid, uuid) to service_role;

comment on table public.site_subtype_assignments is
  'Authoritative UUID relationship for Site Types whose Subtypes are scoped per Site.';
comment on function public.site_subtype_is_allowed(uuid, uuid) is
  'Checks an active Site/Subtype pair using type-wide or explicit UUID assignment rules.';
