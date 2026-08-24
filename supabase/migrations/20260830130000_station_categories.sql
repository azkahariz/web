create table public.station_categories (
  id uuid primary key,
  code text not null unique check (btrim(code) <> ''),
  name text not null unique check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.station_categories (id, code, name)
values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'METEOROLOGI', 'Meteorologi'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'KLIMATOLOGI', 'Klimatologi'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'GEOFISIKA', 'Geofisika'),
  ('44444444-4444-4444-8444-444444444444'::uuid, 'BALAI', 'Balai'),
  ('55555555-5555-4555-8555-555555555555'::uuid, 'PUSAT', 'Pusat');

alter table public.stations
  add column station_category_id uuid references public.station_categories(id) on delete restrict;

create index stations_station_category_id_idx on public.stations (station_category_id);

with mapping(station_id, station_category_id) as (
  select station_id, '44444444-4444-4444-8444-444444444444'::uuid
  from unnest(array[
    'bb99a077-12fa-4856-9662-9a46239b90fc'::uuid,
    '459bd7ed-2304-4b61-8f6c-146e6fa49598'::uuid,
    'c86cd1f3-77d5-42dd-bbef-eb5a933cc4ce'::uuid,
    '4f788db3-d074-4f39-9aa0-4047e0e4c786'::uuid,
    '8992e480-df06-4aeb-b749-4b65e859d8e8'::uuid
  ]) as station_id
  union all
  select station_id, '55555555-5555-4555-8555-555555555555'::uuid
  from unnest(array['f34b42c3-73f6-4d14-a4ce-6ed7ddf2f9c5'::uuid]) as station_id
  union all
  select station_id, '22222222-2222-4222-8222-222222222222'::uuid
  from unnest(array[
    '2d251d56-f6e0-41db-b312-03b2a14da2e7'::uuid,
    '3f9f593f-bcba-4e25-b6bc-46aaf595666e'::uuid,
    'b423f827-185d-403a-b54f-7f042a12f80d'::uuid,
    '531c0c70-2b0b-4b0d-ab6a-a8fb5eab8827'::uuid,
    'b03fd03b-91a0-4b3d-b80a-4c37081b321e'::uuid,
    'ca6e0472-b649-4f76-9131-b23ea657673d'::uuid,
    'a52f6064-3281-4e72-a28a-579fc7e791c1'::uuid,
    '964a900b-7945-4063-aeca-e3bf30854b55'::uuid,
    'a7052d46-bd4c-44ae-bf84-0aa84dabc235'::uuid,
    'fe8dbb22-e8ba-43c0-afa4-47b0876c4285'::uuid,
    '95b1352d-111d-446a-8e8e-60a4d329f2ab'::uuid,
    '57e6035c-144a-4071-86ed-bac10e4b2a02'::uuid,
    '34f3efa1-6ad9-4fb9-a186-28fae63871fc'::uuid,
    'cb284f29-1e0b-4e1c-a845-8c88bd96a513'::uuid,
    'e77c20ac-7718-40b6-b999-b85c93b7bcd7'::uuid,
    'faaed66f-3bb6-4e02-abcd-a67da308f35e'::uuid,
    '9b19e368-69a6-492b-b569-57a463c5c83d'::uuid,
    '93042261-4800-472f-959b-136063311987'::uuid,
    '972f316e-e04c-496f-92c6-25ad3bd406c2'::uuid,
    '81dd1f94-f5b3-4b7a-a636-df65f1e329ff'::uuid,
    '37ec35ac-3d6b-4a40-9bec-5548aae7b8e7'::uuid,
    'bc636261-1139-42f2-8492-15290eaf64e2'::uuid,
    '7528c97b-5d70-4569-bb69-d673a5b597cb'::uuid,
    'bc3e1ef9-eb18-466d-b2b1-b883e7d2124f'::uuid,
    '18a2ce98-2031-442d-bfd7-4577212b61d9'::uuid,
    '1e54b0dc-31d7-4b0c-bc35-8654682c5fc1'::uuid,
    'bd019778-db85-492f-961d-9e6592bf205f'::uuid,
    'a86298d2-9eb7-4526-a10e-5630c16ef3bd'::uuid,
    '950ec779-ddf1-4cdc-94ab-7b0e5fd0c2a1'::uuid,
    '33ec8aed-24cb-46c7-8e7c-1600276dce60'::uuid
  ]) as station_id
  union all
  select station_id, '33333333-3333-4333-8333-333333333333'::uuid
  from unnest(array[
    '31b95af1-020f-463f-89bf-1ca67b4e18f6'::uuid,
    '596c70d6-e3ff-46d2-92c4-c6d5f7378bd0'::uuid,
    'b10fbeca-38d0-4492-86dc-7bce7de1c782'::uuid,
    '21274efb-842c-4903-90fc-b197c2c9f194'::uuid,
    '4f506b21-79c4-46ac-810c-f51d3e040c73'::uuid,
    'bc24e858-1c38-47ce-af8e-cb676edd9969'::uuid,
    '580ddc80-d41f-44f7-bb4d-fe210f7934fe'::uuid,
    '6728f174-2a5f-4106-a5a6-6380b9bfabd9'::uuid,
    '1f5db5bf-b838-47dd-a184-7dc963b1c5b5'::uuid,
    '1e873bd6-98d7-4d63-9e4d-0d5ab14bdb80'::uuid,
    '521ecac3-2edc-4236-bcd5-82c24caf8608'::uuid,
    '9e9133c6-d039-47f6-9ca8-29d68a1f50c2'::uuid,
    '61067e35-e000-4d70-9947-96d9caaf12c8'::uuid,
    '39715e75-42d1-4351-b65a-6aa66ce4ca4d'::uuid,
    '14b5cf0d-4b20-42f0-8c52-751ff2e1bd30'::uuid,
    '49d73328-2b04-4c5a-a056-1a02982667cd'::uuid,
    'fa1ea67f-5c22-44ef-a797-d7e894f1934a'::uuid,
    '74b6a44a-a105-4cdf-96b5-4a25da6475f0'::uuid,
    '61e82d86-5a9a-40aa-a604-a57658b9de85'::uuid,
    'dc9c71fc-c200-4c55-a1fb-5dcbac0dfb8f'::uuid,
    '949a17ed-a1c4-42c4-9b1a-f3a27a0b35e4'::uuid,
    'a0eb1755-e7e1-456c-918d-0cfcce1f5923'::uuid,
    '90f5c648-1e8c-4c99-aaf2-eff45df0caf3'::uuid,
    '70157da2-899d-49c8-972d-f4a736695586'::uuid,
    '989c9aa0-7ce4-49bf-824e-1afa3fc241e3'::uuid,
    'c749726b-e65d-4062-bc15-172534b1e5e2'::uuid,
    '9dd296dd-1c27-4f64-aaeb-d3bf634e0119'::uuid,
    '61731923-20c3-40e0-878e-a784df0f107c'::uuid,
    '4400fc67-e707-4b8a-820c-fcdd11a19029'::uuid,
    'cec5603f-1413-4ed2-9ed3-b5d1e788fec8'::uuid,
    '1d50363d-b7d8-4ead-beaf-db7ba581eaf5'::uuid,
    'bfe3f4f4-f88d-4ee1-9150-7ca49929221f'::uuid
  ]) as station_id
  union all
  select station_id, '11111111-1111-4111-8111-111111111111'::uuid
  from unnest(array[
    '4caa47a9-6e44-4e48-8826-b3fc935ea262'::uuid,
    '8e45d316-b08e-4102-b148-dad7b0164b6f'::uuid,
    '18f24698-e767-4b18-95e6-96db032c2c29'::uuid,
    '57f53c2b-5c79-4dbc-8d07-f399e597fca9'::uuid,
    'f35950fc-17ef-4613-9f9d-25e4aaae7f37'::uuid,
    '514a9daa-246a-479a-ba79-b97a8e097c30'::uuid,
    'f34dc0ca-7378-4aed-a750-a19f7a900db4'::uuid,
    'bbef6bca-8fb7-4acc-af08-6e674d640220'::uuid,
    '8aeba4b5-cce5-4786-87da-71c9c17fc84d'::uuid,
    'd1a99304-930b-43c2-bd69-cdcd6b646ee9'::uuid,
    'f3fbe26a-367e-4041-b4e9-26b47342e4fc'::uuid,
    '0c33e747-0f48-48c9-b34c-41b0ddfb30eb'::uuid,
    '1571e7a1-24c1-4a5a-8069-4382a02c4143'::uuid,
    'f998ca9e-02f2-4d35-8487-c96a7a65fb98'::uuid,
    '0a210453-e737-4b17-800f-1a5c772a5c50'::uuid,
    '9e809aea-b991-4d87-bead-482d9d3ab1b2'::uuid,
    '242d4de6-c9bc-4927-a2d4-1c179c33a4bf'::uuid,
    '4accf040-5c6d-4e86-9389-76ea221d0d67'::uuid,
    'd1fa28e8-6b86-4356-a2aa-f32b0aa55d3c'::uuid,
    '25fde31b-70bd-4a95-b623-19cd358a6141'::uuid,
    '62cc37c4-e7e6-4d3f-bdbb-14487d473d89'::uuid,
    '6ca7d206-6b4e-460c-b380-7523cad0d4ba'::uuid,
    '7e4e949a-4ccb-4fc9-b277-cd68f1eea463'::uuid,
    'c3851b02-6964-4ff9-b292-c314654ccb46'::uuid,
    '54e8e6e6-27a6-4007-816a-b88258908b0b'::uuid,
    '204a97ac-5821-487a-a584-02934ab643b4'::uuid,
    'd3cf986f-67a4-4b73-99a3-6a6c722b9b50'::uuid,
    '0a66bf06-43c9-44b2-9adb-7c271f43ba98'::uuid,
    '8bfd107f-e4e2-49a6-8c7f-2969ace35f9a'::uuid,
    'c53d4dda-29ba-41a9-8a93-14c2a71483b5'::uuid,
    '08b084b7-49d0-4335-b89e-c750b5e3a8fa'::uuid,
    'b068152e-17a4-4d46-9204-5949b83cffdb'::uuid,
    '62de06ad-adb5-4e6f-8282-031d32c4edf1'::uuid,
    '14a24ff4-dfc2-4419-a460-d8aa4b0d8fd6'::uuid,
    'dc5ef0c4-6b47-45ce-99c7-ec441f39b8a7'::uuid,
    '390cb6bd-2042-4bf3-b0bd-916ab2a8103f'::uuid,
    'af99c0a5-a465-4d5a-bfa2-7192bbf7d63a'::uuid,
    '7d162d2a-6129-4205-97ff-72719c40c853'::uuid,
    '82bd6622-8862-4b26-a872-d359b994ba5e'::uuid,
    '42472603-66ac-4c6a-b1ed-f44ce6c2e2fb'::uuid,
    'ebb7a3af-172f-4370-97f4-b38a0c0e68d6'::uuid,
    '9e24912c-cd04-4f11-b4a6-2e1149f7d778'::uuid,
    'a92c54f4-0b84-4cca-98ab-8c20c670ba2b'::uuid,
    'c0508c4c-308c-4bc3-8110-d5722604428c'::uuid,
    '3bdc4fd2-a1d4-4772-bf9f-51110675c703'::uuid,
    '9a0bdaa0-5715-4f13-aeb9-0fb9b63f31fe'::uuid,
    'ee561cfa-41f8-486d-bdff-910504354828'::uuid,
    '4b424076-d0af-424f-a1e1-026c4a40ec7a'::uuid,
    'f1a0af2e-6a0a-4967-8c0a-72772399d732'::uuid,
    '674740d4-65c9-4a8b-9d95-733e6b446ac1'::uuid,
    'd577d4a3-cebe-4e6d-a4a1-b24c1a825b56'::uuid,
    'a9af48ab-3c63-4a91-a41b-97961a771942'::uuid,
    '8add33cd-267d-4110-85da-c500de799348'::uuid,
    '9f344783-da1f-457f-a30a-321b0ebb3094'::uuid,
    'da778c7b-f18e-4896-9d4b-739ea52592b8'::uuid,
    '1f6dc8e7-08a7-4f52-b575-ed54b4e66978'::uuid,
    'baaf5c4c-ee86-42fb-b440-68d3ffcdbb2b'::uuid,
    'b82e6a8b-83f5-4747-94d5-4d1aee200bac'::uuid,
    'b321d70a-3ec2-4e53-bdeb-0b85ba6a076c'::uuid,
    '12d45ca1-dc5c-46b6-a742-3481d6c81880'::uuid,
    '28c6f7ee-53f2-44f6-bc98-85f3e5de2018'::uuid,
    '66fdfe01-c15b-49ee-9575-baefca9dd4cb'::uuid,
    'b772c6ff-400e-41b0-a810-d9b8f1c1b61f'::uuid,
    'bc4b8ea7-bc0f-44ac-b1b8-8c6766659746'::uuid,
    'e30ab26e-e3f2-4f24-bbfe-d1005cbaf2f4'::uuid,
    '48f90e3e-b39c-466d-95a3-71fc0b8cc312'::uuid,
    '83c899c4-e84b-46a3-94c6-2e31348e6758'::uuid,
    '42aa33a1-8959-4342-b8e2-4238431618d4'::uuid,
    '7c5e6318-10c6-4702-9518-59a9f5d6f9fd'::uuid,
    '1fac5d61-8651-45d1-85f4-2438772fb910'::uuid,
    'a9e2fb7d-d596-4f21-abe3-f3b164eebdff'::uuid,
    '7d145437-a26d-48d0-9153-300f9af6b65a'::uuid,
    '7e82bbd2-ba3d-4735-8630-33b7a83299eb'::uuid,
    'af40d355-9db5-4581-999b-8d115ec8fdec'::uuid,
    '8c35498b-8c00-4d1b-b310-0aa8367c5aab'::uuid,
    '938dc3dc-4f83-4c69-bc76-85c70faf7574'::uuid,
    '3eb01899-9df4-4b74-bb6f-be2ba6d423d6'::uuid,
    'cc8fc77e-7d5d-41f6-8978-e7457964b22f'::uuid,
    '1503334d-48ec-4a72-bc04-5c626459c904'::uuid,
    '7cdb04d4-f016-4c90-8ea6-98277a7a6882'::uuid,
    '75bc6635-823d-4003-9a85-216810cfd250'::uuid,
    '6add217c-a671-49c7-a122-a508d2e52f71'::uuid,
    '8783691f-66dd-4caf-bede-3d6000b1acef'::uuid,
    'f0f5c2ad-58a7-4dd7-81cb-2699c2ddc6a3'::uuid,
    '4a89b872-10aa-4587-9812-0173938ba10b'::uuid,
    '0fcb1294-49c6-4427-9aba-f6651a1e3e33'::uuid,
    '1c7fb756-6e4a-48ad-9ba7-45b4ed8e2995'::uuid,
    '89010e5e-6f55-472c-98ed-b609dc0456cf'::uuid,
    'f7dc0f8f-43b5-4ed3-821b-ff2fbd3f9127'::uuid,
    '7c9a7652-0de6-4c3f-bac1-4af9b4bb38e3'::uuid,
    'abb5df60-5ef3-4a4f-abe1-785c1f10bb06'::uuid,
    'eb0ea1a7-7530-4933-9d0b-a01854e4d0b8'::uuid,
    'f3f3a411-05c2-488b-82b7-57740c3c66cc'::uuid,
    'dfab2069-d209-48be-a73e-9c93abcf3847'::uuid,
    '79df8ae6-6f0c-4384-bf3c-64302537ee6e'::uuid,
    'fd11f5ce-2b28-4818-a5c6-ba46f1f773b2'::uuid,
    'ad80f7a8-5596-4ac4-baa1-72500b47f846'::uuid,
    '6b9aa698-d1f6-4eb5-9023-66f7eba90f47'::uuid,
    '3c97e6d2-a9f2-47b2-9373-6359c9efa4d3'::uuid,
    '5803e247-e691-42ea-b490-e646d9f3c658'::uuid,
    '26aeea5c-e5f3-4a36-9a9f-e154b8927fe1'::uuid,
    'ba30895f-bbe1-4833-9a2f-4cc32829b159'::uuid,
    '6bb4dfc8-aabc-410f-8b24-8318171ecf06'::uuid,
    'd669e931-f142-4fbe-a907-5308f72c314b'::uuid,
    '66bf97e3-bb20-4c76-a95e-68d4f92892db'::uuid,
    '592b97a4-6d39-49ec-afd9-48557d10e773'::uuid,
    'a298de12-0ce5-4217-ab62-38e49a919b1c'::uuid,
    '37c01302-ebb4-4557-a5ad-b025a5e25f4c'::uuid,
    'bac3ef64-18bb-497b-831b-2588e38e7406'::uuid,
    '8366844f-766c-4075-a849-b6a5964ab454'::uuid,
    '28aa05ee-9863-443d-9834-97fee9da141f'::uuid,
    '0102436d-5798-4294-9172-cd603d4297c1'::uuid,
    'a4f82a11-d8d0-4e19-a778-9a3d4c0610b6'::uuid,
    '37e4a782-bb5a-412e-8d06-d75053512177'::uuid,
    'ffb074be-6eff-4d64-a363-c53faa80f628'::uuid,
    '7afdf5d9-df1d-468d-b8ee-e503ade860e7'::uuid,
    '266372a0-60c6-490d-9e8e-ecbf225e3365'::uuid,
    '97b41b05-3513-43ba-a8f3-884299f470f5'::uuid,
    '5e991f1b-9921-4723-9977-d9f74f36b937'::uuid,
    'cd02ee63-2b0c-40c7-a07b-f504fd43a8b1'::uuid,
    '7120d270-9bd9-4b02-85d0-eba51d3fb60b'::uuid,
    'dc5eead5-9cbf-4623-b0d5-a96afefa00d8'::uuid,
    '5731cf9d-39c8-4af5-8fb7-fb3ed9b00898'::uuid,
    '0bb02871-55d5-4d04-8550-80f41b69d807'::uuid
  ]) as station_id
)
update public.stations as station
set station_category_id = mapping.station_category_id
from mapping
where station.id = mapping.station_id;

do $$
begin
  if exists (select 1 from public.stations where active and station_category_id is null) then
    raise exception 'Active Station category mapping is incomplete.' using errcode = '23514';
  end if;
end;
$$;

alter table public.station_categories enable row level security;
revoke all on table public.station_categories from anon, authenticated;

comment on table public.station_categories is
  'Authoritative organizational category for Station. Runtime identity is station_category_id, not Station name parsing.';
