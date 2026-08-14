import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia.");
const sql = postgres(databaseUrl, { ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : "require", max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_ADMIN_PRODUCTS_${randomUUID()}`;

function assert(value, message) {
  if (!value) throw new Error(message);
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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
    const adminId = await createAuthUser(tx, "admin-products");
    const stationId = await createAuthUser(tx, "station-products");
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminId}, ${`verify-products-${adminId}`})`;

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationId}, true)`;
    await tx.unsafe(`do $$ begin perform public.admin_list_products(); raise exception 'station_product_list_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx.unsafe(`do $$ begin perform public.admin_create_product('Blocked', 'Station'); raise exception 'station_product_create_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);

    await tx`reset role`;
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
    const brand = `Verify Brand ${randomUUID().slice(0, 8)}`;
    const model = `Verify Model ${randomUUID().slice(0, 8)}`;
    const [created] = await tx`select public.admin_create_product(${brand}, ${model}) as id`;
    assert(created?.id, "Super Admin gagal membuat produk.");

    const list = await tx`select public.admin_list_products(1, 50, ${brand}, 'brand', 'asc') as data`;
    const rows = list[0]?.data?.rows ?? [];
    assert(rows.length === 1 && rows[0].id === created.id, "Search Merk server-side gagal.");
    const modelSearch = await tx`select public.admin_list_products(1, 50, ${model}, 'model', 'desc') as data`;
    assert(modelSearch[0]?.data?.rows?.[0]?.id === created.id, "Search Tipe atau sort server-side gagal.");
    const second = await tx`select public.admin_create_product(${`${brand} Other`}, ${`${model} Other`}) as id`;
    assert(second[0]?.id, "Produk kedua untuk pagination gagal dibuat.");
    const paged = await tx`select public.admin_list_products(1, 50, ${brand}, 'brand', 'asc') as data`;
    assert(paged[0]?.data?.totalCount === 2, "Total pagination tidak sesuai.");
    await tx.unsafe(`do $$ begin perform public.admin_create_product(${literal(brand.toUpperCase())}, ${literal(model.toLowerCase())}); raise exception 'normalized_duplicate_was_not_blocked'; exception when unique_violation then null; end $$;`);

    const renamedBrand = `${brand} Renamed`;
    assert((await tx`select public.admin_update_product(${created.id}, ${renamedBrand}, ${model}) as updated`)[0]?.updated, "Edit produk gagal.");
    const [renamed] = await tx`select id, brand, model from public.products where id = ${created.id}`;
    assert(renamed?.id === created.id && renamed.brand === renamedBrand, "Rename harus mempertahankan UUID canonical.");
    const [alias] = await tx`select count(*)::integer as count from public.product_aliases where product_id = ${created.id} and brand_alias = ${brand} and model_alias = ${model}`;
    assert(alias?.count === 1, "Nama canonical lama harus tersimpan sebagai alias.");
    await tx.unsafe(`do $$ begin perform public.admin_update_product(${literal(second[0].id)}::uuid, ${literal(renamedBrand)}, ${literal(model)}); raise exception 'edit_duplicate_was_not_blocked'; exception when unique_violation then null; end $$;`);

    assert((await tx`select public.admin_set_product_active(${created.id}, false) as updated`)[0]?.updated, "Nonaktifkan produk gagal.");
    assert((await tx`select public.admin_set_product_active(${created.id}, true) as updated`)[0]?.updated, "Aktifkan produk gagal.");
    const [summary] = await tx`select * from public.admin_product_summary()`;
    assert(summary.total_count >= 2 && summary.active_count >= 2, "Ringkasan produk tidak membaca tabel products.");
    const audits = await tx`select action from public.admin_audit_log where target_id = ${created.id}`;
    const actions = new Set(audits.map((row) => row.action));
    for (const action of ["PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_DEACTIVATE", "PRODUCT_ACTIVATE"]) assert(actions.has(action), `Audit ${action} tidak ditemukan.`);
    await tx`reset role`;
    const [qcProduct] = await tx`insert into public.products (brand, model, active, source_origin, spreadsheet_synced) values (${`QC ${randomUUID()}`}, 'Approved', true, 'QC', false) returning id`;
    const [mergedTarget] = await tx`select id from public.products where id = ${qcProduct.id}`;
    assert(mergedTarget?.id === qcProduct.id, "Produk QC canonical harus tetap berada pada daftar master yang sama.");
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi Master Produk lulus; seluruh fixture database telah di-rollback.");
