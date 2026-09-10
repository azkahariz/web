import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia.");
const sql = postgres(databaseUrl, { ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : "require", max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_PRODUCT_REFERENCE_FILTERS_${randomUUID()}`;
const METEOROLOGI = "11111111-1111-4111-8111-111111111111";
const KLIMATOLOGI = "22222222-2222-4222-8222-222222222222";
const GEOFISIKA = "33333333-3333-4333-8333-333333333333";

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function createAuthUser(tx, prefix) {
  const id = randomUUID();
  await tx`
    insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, 'authenticated', 'authenticated', ${`${prefix}-${id}@verify.invalid`}, '',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
  `;
  return id;
}

async function filterIds(tx, categories = [], stationCategoryId = null, siteTypeId = null) {
  const [row] = await tx`select public.admin_product_reference_filter_ids(${categories}, ${stationCategoryId}, ${siteTypeId}) as ids`;
  return new Set(row.ids);
}

try {
  await sql.begin(async (tx) => {
    const suffix = randomUUID().slice(0, 8);
    const adminAuthId = await createAuthUser(tx, "reference-filter-admin");
    const stationAuthId = await createAuthUser(tx, "reference-filter-station");
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminAuthId}, ${`filter-admin-${suffix}`})`;

    const [metStation] = await tx`insert into public.stations (name, station_category_id) values (${`Met Station ${suffix}`}, ${METEOROLOGI}) returning id`;
    const [climStation] = await tx`insert into public.stations (name, station_category_id) values (${`Clim Station ${suffix}`}, ${KLIMATOLOGI}) returning id`;
    const [geoStation] = await tx`insert into public.stations (name, station_category_id) values (${`Geo Station ${suffix}`}, ${GEOFISIKA}) returning id`;
    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${stationAuthId}, ${metStation.id}, ${`filter-station-${suffix}`})`;

    const [awsType] = await tx`insert into public.site_types (name) values (${`AWS Filter ${suffix}`}) returning id`;
    const [argType] = await tx`insert into public.site_types (name) values (${`ARG Filter ${suffix}`}) returning id`;
    const [awsSubtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${awsType.id}, ${`AWS Subtype ${suffix}`}) returning id`;
    const [argSubtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${argType.id}, ${`ARG Subtype ${suffix}`}) returning id`;
    const [metAwsSite] = await tx`insert into public.sites (station_id, site_type_id, name) values (${metStation.id}, ${awsType.id}, ${`Met AWS ${suffix}`}) returning id`;
    const [climArgSite] = await tx`insert into public.sites (station_id, site_type_id, name) values (${climStation.id}, ${argType.id}, ${`Clim ARG ${suffix}`}) returning id`;
    const [geoAwsSite] = await tx`insert into public.sites (station_id, site_type_id, name) values (${geoStation.id}, ${awsType.id}, ${`Geo AWS ${suffix}`}) returning id`;
    const [archivedSite] = await tx`insert into public.sites (station_id, site_type_id, name) values (${metStation.id}, ${awsType.id}, ${`Archived AWS ${suffix}`}) returning id`;

    const products = await tx`
      insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
      values
        ('Filter Verify', ${`X-${suffix}`}, true, 'ADMIN', false),
        ('Filter Verify', ${`Y-${suffix}`}, true, 'ADMIN', false),
        ('Filter Verify', ${`Z-${suffix}`}, true, 'ADMIN', false),
        ('Filter Verify', ${`QC-${suffix}`}, true, 'ADMIN', false),
        ('Filter Verify', ${`Archived-${suffix}`}, true, 'ADMIN', false)
      returning id, model
    `;
    const product = (prefix) => products.find((row) => row.model.startsWith(prefix));
    const x = product("X-");
    const y = product("Y-");
    const z = product("Z-");
    const qc = product("QC-");
    const archived = product("Archived-");
    assert(x && y && z && qc && archived, "Fixture Product tidak lengkap.");

    const [metSubmission] = await tx`insert into public.submissions (station_id, site_id, site_subtype_id, payload) values (${metStation.id}, ${metAwsSite.id}, ${awsSubtype.id}, ${tx.json({ inventory: {
      "Sensor Suhu": [{ id: "x-met-aws", productId: x.id }, { id: "y-display-1", productId: y.id }, { id: "y-display-2", productId: y.id }],
      Display: [{ id: "y-multi", productId: y.id, functionCategories: ["Display", "Konverter"] }],
      "QC Storage": [],
    } })}) returning id`;
    const [proposal] = await tx`
      insert into public.product_proposals (station_id, submission_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id)
      values (${metStation.id}, ${metSubmission.id}, ${stationAuthId}, 'QC Proposed', ${suffix}, 'qc proposed', ${suffix}, 'APPROVED', ${qc.id}) returning id
    `;
    await tx`update public.submissions set payload = jsonb_set(payload, '{inventory,QC Storage}', ${tx.json([{ id: "qc-result", productProposalId: proposal.id, functionCategories: ["Display"] }])}) where id = ${metSubmission.id}`;
    await tx`insert into public.submissions (station_id, site_id, site_subtype_id, payload) values (${climStation.id}, ${climArgSite.id}, ${argSubtype.id}, ${tx.json({ inventory: { Regulator: [{ id: "x-clim-arg", productId: x.id }] } })})`;
    await tx`insert into public.submissions (station_id, site_id, site_subtype_id, payload) values (${geoStation.id}, ${geoAwsSite.id}, ${awsSubtype.id}, ${tx.json({ inventory: { Konverter: [{ id: "z-geo-aws", productId: z.id }] } })})`;
    await tx`insert into public.submissions (station_id, site_id, site_subtype_id, payload, archived_at) values (${metStation.id}, ${archivedSite.id}, ${awsSubtype.id}, ${tx.json({ inventory: { Arsip: [{ id: "archived", productId: archived.id }] } })}, now())`;

    const bulkProducts = await tx`
      insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
      select 'Filter Bulk', ${suffix} || '-' || lpad(series::text, 4, '0'), true, 'ADMIN', false
      from generate_series(1, 1005) as series returning id
    `;
    await tx`update public.submissions set payload = jsonb_set(payload, '{inventory,Kategori Bulk}', ${tx.json(bulkProducts.map((row, index) => ({ id: `bulk-${index}`, productId: row.id })))}) where id = ${metSubmission.id}`;

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminAuthId}, true)`;

    const cases = [
      ["Meteorologi + AWS", [], METEOROLOGI, awsType.id, true],
      ["Meteorologi + ARG", [], METEOROLOGI, argType.id, false],
      ["Meteorologi + Sensor Suhu", ["Sensor Suhu"], METEOROLOGI, null, true],
      ["Meteorologi + Regulator", ["Regulator"], METEOROLOGI, null, false],
      ["Meteorologi + AWS + Regulator", ["Regulator"], METEOROLOGI, awsType.id, false],
      ["Klimatologi + ARG + Regulator", ["Regulator"], KLIMATOLOGI, argType.id, true],
    ];
    for (const [label, categories, stationCategoryId, siteTypeId, expected] of cases) {
      const ids = await filterIds(tx, categories, stationCategoryId, siteTypeId);
      assert(ids.has(x.id) === expected, `${label}: hasil same-occurrence Product X tidak sesuai.`);
    }
    const categoryOr = await filterIds(tx, ["Display", "Regulator"]);
    assert(categoryOr.has(x.id) && categoryOr.has(y.id) && !categoryOr.has(z.id), "Multi-kategori harus OR dan tidak memasukkan kategori lain.");
    assert(categoryOr.size >= 3, "QC_RESULT APPROVED harus termasuk dalam population filter.");
    assert(categoryOr.has(qc.id), "QC_RESULT APPROVED harus cocok berdasarkan occurrence proposal.");
    assert(!categoryOr.has(archived.id), "Submission arsip tidak boleh masuk filter.");
    const display = await filterIds(tx, ["Display"]);
    assert(display.has(y.id), "Product dengan occurrence kategori ganda harus cocok.");
    const bulk = await filterIds(tx, ["Kategori Bulk"]);
    assert(bulk.size === 1005, "RPC JSONB harus mengembalikan lebih dari 1.000 Product tanpa truncation atau duplikasi.");

    const [options] = await tx`select public.admin_product_reference_filter_options() as value`;
    assert(options.value.categories.includes("Display") && !options.value.categories.includes("Arsip"), "Options kategori harus current dan mengabaikan arsip.");
    assert(options.value.stationGroups.map((row) => row.name).join(",") === "Meteorologi,Klimatologi,Geofisika", "Urutan Kelompok Stasiun tidak sesuai.");
    assert(options.value.siteTypes.some((row) => row.id === awsType.id) && options.value.siteTypes.some((row) => row.id === argType.id), "Options Tipe Site harus berasal dari occurrence current.");

    await tx`reset role`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationAuthId}, true)`;
    await tx.unsafe(`do $$ begin perform public.admin_product_reference_filter_options(); raise exception 'station_filter_options_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx.unsafe(`do $$ begin perform public.admin_product_reference_filter_ids('{}'::text[], null, null); raise exception 'station_filter_ids_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx`reset role`;
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi filter referensi Produk lulus; same-occurrence dan 1.005 Product bulk telah di-rollback.");
