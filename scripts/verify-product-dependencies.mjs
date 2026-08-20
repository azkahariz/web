import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia untuk verifier lokal.");
if (!/localhost|127\.0\.0\.1/.test(databaseUrl)) throw new Error("verify:product-dependencies hanya boleh memakai Supabase lokal.");

const sql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_PRODUCT_DEPENDENCIES_${randomUUID()}`;

try {
  await sql.begin(async (tx) => {
    const adminAuthId = randomUUID();
    const suffix = randomUUID().slice(0, 8);
    await tx`insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${adminAuthId}, 'authenticated', 'authenticated', ${`dependency-admin-${suffix}@verify.invalid`}, '',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`;
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminAuthId}, ${`dependency-admin-${suffix}`})`;
    const [station] = await tx`insert into public.stations (name) values (${`Dependency Station ${suffix}`}) returning id`;
    const [siteType] = await tx`insert into public.site_types (name) values (${`Dependency Type ${suffix}`}) returning id`;
    const [siteSubtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${siteType.id}, ${`Dependency Subtype ${suffix}`}) returning id`;
    const [site] = await tx`insert into public.sites (station_id, site_type_id, name) values (${station.id}, ${siteType.id}, ${`Dependency Site ${suffix}`}) returning id`;
    const [product] = await tx`insert into public.products (brand, model, active, source_origin, spreadsheet_synced) values ('Dependency Brand', ${`Dependency Model ${suffix}`}, true, 'ADMIN', false) returning id`;
    const [currentProposal] = await tx`insert into public.product_proposals (station_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id) values (${station.id}, ${adminAuthId}, 'Resolved', 'Current', 'resolved', 'current', 'APPROVED', ${product.id}) returning id`;
    await tx`insert into public.product_proposals (station_id, created_by_auth_user, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id) values (${station.id}, ${adminAuthId}, 'Resolved', 'Stale', 'resolved', 'stale', 'APPROVED', ${product.id})`;
    await tx`insert into public.submissions (station_id, site_id, site_subtype_id, payload) values (${station.id}, ${site.id}, ${siteSubtype.id}, ${tx.json({ inventory: { Sensor: [
      { id: 'direct-a', productId: product.id, functionCategories: ['Sensor Suhu Udara', 'Sensor Kelembaban Udara'], units: [{}, {}] },
      { id: 'direct-b', productId: product.id, quantity: 3 },
      { id: 'resolved-a', productProposalId: currentProposal.id, quantity: 1 }
    ] } })})`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminAuthId}, true)`;
    const [dependencyResult] = await tx`select public.admin_product_dependencies(${product.id}) as data`;
    const dependency = dependencyResult.data.preflight;
    if (dependency.currentDirectReferenceCount !== 2) throw new Error('Direct current harus hanya menghitung dua item productId.');
    if (dependency.currentSiteCount !== 1 || dependency.currentSubmissionCount !== 1) throw new Error('Site/Submission current harus memakai direct plus resolved proposal dan distinct.');
    if (dependency.resolvedQcProposalCount !== 2) throw new Error('QC resolved harus mempertahankan dua proposal history.');
    const [referenceResult] = await tx`select public.admin_product_direct_references(${product.id}, 1, 50, null, 'ALL') as data`;
    if (referenceResult.data.totalCount !== 2) throw new Error('Direct reference detail tidak boleh menghitung resolved proposal atau unit sebagai row tambahan.');
    if (referenceResult.data.rows[0].unitCount !== 2) throw new Error('Multi-unit harus tetap satu direct reference dengan unit count 2.');
    await tx`reset role`;
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi Product dependency lulus; direct/resolved current usage, dedupe, multi-unit, stale QC history, dan rollback fixture teruji.");
