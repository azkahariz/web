import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia.");
const sql = postgres(databaseUrl, { ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : "require", max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_PRODUCT_USAGE_${randomUUID()}`;

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function createAuthUser(tx, prefix) {
  const id = randomUUID();
  await tx`
    insert into auth.users (id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${id}, 'authenticated', 'authenticated', ${`${prefix}-${id}@verify.invalid`}, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
  `;
  return id;
}

try {
  await sql.begin(async (tx) => {
    const adminAuthId = await createAuthUser(tx, "product-usage-admin");
    const stationAuthId = await createAuthUser(tx, "product-usage-station");
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminAuthId}, ${`usage-admin-${adminAuthId}`})`;
    const suffix = randomUUID().slice(0, 8);
    const [stationA] = await tx`insert into public.stations (name) values (${`Usage Station A ${suffix}`}) returning id`;
    const [stationB] = await tx`insert into public.stations (name) values (${`Usage Station B ${suffix}`}) returning id`;
    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${stationAuthId}, ${stationA.id}, ${`usage-station-${suffix}`})`;
    const [awosType] = await tx`insert into public.site_types (name) values (${`Usage AWOS ${suffix}`}) returning id`;
    const [warehouseType] = await tx`insert into public.site_types (name) values (${`Usage Gudang ${suffix}`}) returning id`;
    const [tdz] = await tx`insert into public.site_subtypes (site_type_id, name) values (${awosType.id}, ${`Usage TDZ ${suffix}`}) returning id`;
    const [mid] = await tx`insert into public.site_subtypes (site_type_id, name) values (${awosType.id}, ${`Usage Mid ${suffix}`}) returning id`;
    const [warehouseSubtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${warehouseType.id}, ${`Usage Gudang ${suffix}`}) returning id`;
    const [siteA] = await tx`insert into public.sites (station_id, site_type_id, name) values (${stationA.id}, ${awosType.id}, ${`Usage AWOS Site ${suffix}`}) returning id`;
    const [siteB] = await tx`insert into public.sites (station_id, site_type_id, name) values (${stationB.id}, ${awosType.id}, ${`Usage Second Site ${suffix}`}) returning id`;
    const [warehouse] = await tx`insert into public.sites (station_id, site_type_id, name) values (${stationA.id}, ${warehouseType.id}, ${`Usage Gudang Site ${suffix}`}) returning id`;
    const [archivedSite] = await tx`insert into public.sites (station_id, site_type_id, name) values (${stationB.id}, ${awosType.id}, ${`Usage Archived Site ${suffix}`}) returning id`;
    const [productA] = await tx`insert into public.products (brand, model, active, source_origin, spreadsheet_synced) values ('Kinematrics', ${`Q330 ${suffix}`}, false, 'ADMIN', false) returning id`;
    const [productB] = await tx`insert into public.products (brand, model, active, source_origin, spreadsheet_synced) values ('Kinematrics', ${`Q330+ ${suffix}`}, true, 'ADMIN', false) returning id`;
    await tx`insert into public.submissions (station_id, site_id, site_subtype_id, payload) values (${stationA.id}, ${siteA.id}, ${tdz.id}, ${tx.json({ inventory: { Sensor: [{ productId: productA.id }, { productId: productA.id }] } })})`;
    const [submissionMid] = await tx`insert into public.submissions (station_id, site_id, site_subtype_id, payload) values (${stationA.id}, ${siteA.id}, ${mid.id}, ${tx.json({ inventory: { Sensor: [] } })}) returning id`;
    const [submissionB] = await tx`insert into public.submissions (station_id, site_id, site_subtype_id, payload) values (${stationB.id}, ${siteB.id}, ${tdz.id}, ${tx.json({ inventory: { Sensor: [{ productId: productA.id }, { productId: productB.id }, { productId: 'legacy-orphan-product-id' }] } })}) returning id`;
    const [submissionWarehouse] = await tx`insert into public.submissions (station_id, site_id, site_subtype_id, payload) values (${stationA.id}, ${warehouse.id}, ${warehouseSubtype.id}, ${tx.json({ inventory: { Persediaan: [{ productId: productA.id }] } })}) returning id`;
    await tx`insert into public.submissions (station_id, site_id, site_subtype_id, payload, archived_at) values (${stationB.id}, ${archivedSite.id}, ${tdz.id}, ${tx.json({ inventory: { Sensor: [{ productId: productA.id }] } })}, now())`;
    const [approved] = await tx`insert into public.product_proposals (station_id, submission_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id) values (${stationA.id}, ${submissionMid.id}, ${adminAuthId}, 'Approved', 'Usage', 'approved', 'usage', 'APPROVED', ${productA.id}) returning id`;
    const [merged] = await tx`insert into public.product_proposals (station_id, submission_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id) values (${stationB.id}, ${submissionB.id}, ${adminAuthId}, 'Merged', 'Usage', 'merged', 'usage', 'MERGED', ${productA.id}) returning id`;
    const [pending] = await tx`insert into public.product_proposals (station_id, submission_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status) values (${stationA.id}, ${submissionWarehouse.id}, ${adminAuthId}, 'Pending', 'Usage', 'pending', 'usage', 'PENDING') returning id`;
    await tx`update public.submissions set payload = ${tx.json({ inventory: { Sensor: [{ productProposalId: approved.id }] } })} where id = ${submissionMid.id}`;
    await tx`update public.submissions set payload = ${tx.json({ inventory: { Sensor: [{ productId: productA.id }, { productId: productB.id }, { productProposalId: merged.id }] } })} where id = ${submissionB.id}`;
    await tx`update public.submissions set payload = ${tx.json({ inventory: { Persediaan: [{ productId: productA.id }, { productProposalId: pending.id }] } })} where id = ${submissionWarehouse.id}`;

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminAuthId}, true)`;
    const [usageResult] = await tx`select public.admin_product_usage(${productA.id}, 1, 2, null) as data`;
    const usage = usageResult.data;
    assert(usage.stationCount === 2 && usage.siteCount === 3, "Station/Site usage harus didedupe dari lokasi aktif.");
    assert(usage.totalCount === 4 && usage.referenceCount === 6, "Direct, APPROVED, MERGED, dan Gudang harus dihitung; PENDING/archived tidak.");
    assert(usage.rows.length === 2 && usage.page === 1 && usage.pageSize === 2, "Pagination usage page pertama tidak benar.");
    const [usagePageTwo] = await tx`select public.admin_product_usage(${productA.id}, 2, 2, null) as data`;
    assert(usagePageTwo.data.rows.length === 2 && usagePageTwo.data.page === 2, "Pagination usage page kedua tidak benar.");
    const [usageB] = await tx`select public.admin_product_usage(${productB.id}, 1, 50, null) as data`;
    assert(usageB.data.siteCount === 1 && usageB.data.referenceCount === 1, "Usage harus berbasis UUID, bukan nama yang mirip.");
    await tx`reset role`;

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationAuthId}, true)`;
    await tx.unsafe(`do $$ begin perform public.admin_product_usage('${productA.id}'::uuid); raise exception 'station_product_usage_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx`reset role`;
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi penggunaan Produk lulus; seluruh fixture database telah di-rollback.");
