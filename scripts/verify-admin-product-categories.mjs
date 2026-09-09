import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia.");
const sql = postgres(databaseUrl, { ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : "require", max: 1, connect_timeout: 15, idle_timeout: 5 });
const rollbackMarker = `ROLLBACK_PRODUCT_CATEGORIES_${randomUUID()}`;

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

try {
  await sql.begin(async (tx) => {
    const adminAuthId = await createAuthUser(tx, "product-category-admin");
    const stationAuthId = await createAuthUser(tx, "product-category-station");
    const suffix = randomUUID().slice(0, 8);
    await tx`insert into public.super_admins (auth_user_id, username) values (${adminAuthId}, ${`category-admin-${suffix}`})`;
    const [station] = await tx`insert into public.stations (name) values (${`Category Station ${suffix}`}) returning id`;
    await tx`insert into public.station_accounts (auth_user_id, station_id, username) values (${stationAuthId}, ${station.id}, ${`category-station-${suffix}`})`;
    const [siteType] = await tx`insert into public.site_types (name) values (${`Category Type ${suffix}`}) returning id`;
    const [subtype] = await tx`insert into public.site_subtypes (site_type_id, name) values (${siteType.id}, ${`Category Subtype ${suffix}`}) returning id`;
    const [site] = await tx`insert into public.sites (station_id, site_type_id, name) values (${station.id}, ${siteType.id}, ${`Category Site ${suffix}`}) returning id`;

    const products = await tx`
      insert into public.products (brand, model, active, source_origin, spreadsheet_synced)
      select 'Category Verify', ${suffix} || '-' || lpad(series::text, 4, '0'), true, 'ADMIN', false
      from generate_series(1, 1100) as series
      returning id, model
    `;
    const productAt = (index) => products.find((product) => product.model === `${suffix}-${String(index).padStart(4, "0")}`);
    const noReference = productAt(1);
    const oneCategory = productAt(2);
    const repeatedCategory = productAt(3);
    const multipleCategories = productAt(4);
    const directAndQc = productAt(5);
    const beyondOneThousand = productAt(1081);
    assert(noReference && oneCategory && repeatedCategory && multipleCategories && directAndQc && beyondOneThousand, "Fixture Product tidak lengkap.");

    const [submission] = await tx`
      insert into public.submissions (station_id, site_id, site_subtype_id, payload)
      values (${station.id}, ${site.id}, ${subtype.id}, ${tx.json({ inventory: {} })})
      returning id
    `;
    const [proposal] = await tx`
      insert into public.product_proposals (
        station_id, submission_id, created_by_auth_user, proposed_brand, proposed_model,
        normalized_brand, normalized_model, status, resolved_product_id
      ) values (
        ${station.id}, ${submission.id}, ${stationAuthId}, 'Category Proposal', ${suffix},
        'category proposal', ${suffix}, 'APPROVED', ${directAndQc.id}
      ) returning id
    `;
    const repeatedItems = Array.from({ length: 1005 }, (_, index) => ({ id: `bulk-${index}`, productId: beyondOneThousand.id }));
    await tx`update public.submissions set payload = ${tx.json({ inventory: {
      Display: [
        { id: "one", productId: oneCategory.id },
        { id: "repeat-1", productId: repeatedCategory.id },
        { id: "repeat-2", productId: repeatedCategory.id },
        { id: "mixed-direct", productId: directAndQc.id },
      ],
      "Sensor Suhu": [{ id: "multi-a", productId: multipleCategories.id }],
      "Sensor Tekanan": [{ id: "multi-b", productId: multipleCategories.id }],
      "Perangkat Jaringan": [{ id: "mixed-qc", productProposalId: proposal.id }],
      "Kategori Bulk": repeatedItems,
    } })} where id = ${submission.id}`;

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${adminAuthId}, true)`;
    const requestedIds = products.map((product) => product.id);
    const categoryRows = [];
    for (let from = 0; from < requestedIds.length; from += 500) {
      categoryRows.push(...await tx`select * from public.admin_product_reference_categories(${requestedIds.slice(from, from + 500)})`);
    }
    const categoriesById = new Map(categoryRows.map((row) => [row.product_id, row.categories]));
    assert(categoryRows.length === 1100, "RPC harus mengembalikan semua 1.100 Product yang diminta.");
    assert(categoriesById.get(noReference.id)?.length === 0, "Product tanpa referensi harus memiliki kategori kosong.");
    assert(categoriesById.get(oneCategory.id)?.join(",") === "Display", "Satu kategori harus tetap satu nilai.");
    assert(categoriesById.get(repeatedCategory.id)?.join(",") === "Display", "Kategori berulang harus dideduplikasi.");
    assert(categoriesById.get(multipleCategories.id)?.join(",") === "Sensor Suhu,Sensor Tekanan", "Semua kategori unik harus diurutkan deterministik.");
    assert(categoriesById.get(directAndQc.id)?.join(",") === "Display,Perangkat Jaringan", "DIRECT dan QC_RESULT harus digabung sesuai referensi current.");
    assert(categoriesById.get(beyondOneThousand.id)?.join(",") === "Kategori Bulk", "Product #1081 dan >1.000 occurrence harus tetap lengkap.");
    await tx`reset role`;

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${stationAuthId}, true)`;
    await tx.unsafe(`do $$ begin perform public.admin_product_reference_categories(array['${oneCategory.id}'::uuid]); raise exception 'station_product_categories_was_not_blocked'; exception when insufficient_privilege then null; end $$;`);
    await tx`reset role`;
    throw new Error(rollbackMarker);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
} finally {
  await sql.end({ timeout: 5 });
}

console.log("Verifikasi kategori referensi Produk lulus; 1.100 Product dan 1.005+ occurrence telah di-rollback.");
