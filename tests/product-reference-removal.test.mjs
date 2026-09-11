import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Product reference removal memakai occurrence exact, preflight, lock, version, dan transaksi atomik", async () => {
  const [baseMigration, migration, apiHelper, referencesRoute, preflightRoute, removeRoute, component, dialog, css, packageJson] = await Promise.all([
    read("../supabase/migrations/20260911130000_product_reference_removal.sql"),
    read("../supabase/migrations/20260911140000_fix_product_reference_removal_current_inventory.sql"),
    read("../app/lib/admin-product-api.ts"),
    read("../app/api/admin/products/[id]/references/route.ts"),
    read("../app/api/admin/products/[id]/remove-preflight/route.ts"),
    read("../app/api/admin/products/[id]/remove/route.ts"),
    read("../app/admin/AdminProducts.tsx"),
    read("../app/admin/ProductReferenceRemoveDialog.tsx"),
    read("../app/globals.css"),
    read("../package.json"),
  ]);

  for (const rpc of ["product_reference_removal_validation", "admin_product_reference_removal_preflight"]) {
    assert.match(baseMigration, new RegExp(`function public\\.${rpc}`));
  }
  assert.match(migration, /function public\.admin_remove_product_references/);
  assert.match(migration, /v_admin := public\.require_super_admin\(\)/);
  assert.match(baseMigration, /function public\.admin_product_reference_occurrences/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(baseMigration, /storageCategory/);
  assert.match(baseMigration, /itemOrdinal/);
  assert.match(baseMigration, /expectedSubmissionVersion/);
  assert.match(baseMigration, /expectedProposalUpdatedAt/);
  assert.match(migration, /order by submission\.id[\s\S]*for update of submission/);
  assert.ok((migration.match(/product_reference_removal_validation\(p_source_product_id, p_references\)/g) ?? []).length >= 2, "Execute harus revalidate setelah row lock.");
  assert.match(baseMigration, /submission\.version <> selected\.expected_version/);
  assert.match(baseMigration, /interval '5 minutes'/);
  assert.doesNotMatch(migration, /entry\.value - 'productId'/);
  assert.doesNotMatch(migration, /entry\.value - 'productProposalId'/);
  assert.match(migration, /filter \(where selected\.value is null\)/);
  assert.match(migration, /'removedItems', v_removed_items/);
  assert.match(migration, /version = submission\.version \+ 1/);
  assert.match(migration, /'PRODUCT_REFERENCE_REMOVE'/);
  assert.match(migration, /oldSubmissionVersion[\s\S]*newSubmissionVersion/);
  assert.doesNotMatch(migration, /\b(update|delete)\s+public\.(products|product_proposals|product_aliases)\b/i);
  assert.doesNotMatch(migration, /\b(alter table|create index|truncate)\b/i);
  assert.match(baseMigration, /revoke all on function public\.product_reference_removal_validation/);
  assert.match(migration, /grant execute on function public\.admin_remove_product_references/);

  assert.match(apiHelper, /parseProductRemoveRequest/);
  assert.match(apiHelper, /references\.length > 500/);
  assert.match(apiHelper, /version_conflict/);
  assert.match(apiHelper, /active_lock/);
  for (const route of [preflightRoute, removeRoute]) {
    assert.match(route, /requireProductDependencyClient/);
    assert.match(route, /parseProductRemoveRequest/);
    assert.match(route, /PRODUCT_UUID_PATTERN/);
  }
  assert.match(preflightRoute, /admin_product_reference_removal_preflight/);
  assert.match(removeRoute, /admin_remove_product_references/);
  assert.match(removeRoute, /status !== "removed"/);
  assert.match(referencesRoute, /admin_product_reference_occurrences/);

  assert.match(component, /Hapus Referensi/);
  assert.match(component, /selectedRemoveReferences/);
  assert.match(component, /ProductReferenceRemoveDialog/);
  assert.match(dialog, /remove-preflight/);
  assert.match(dialog, /\/remove`/);
  assert.match(dialog, /Item terpilih akan hilang dari form/);
  assert.match(dialog, /Produk dan Submission tetap ada/);
  assert.match(dialog, /riwayat proposal dan hasil QC tetap dipertahankan/i);
  assert.match(dialog, /className="danger-button"/);
  assert.match(dialog, /disabled=\{plan\?\.status !== "ready" \|\| preflightLoading\}/);
  assert.match(css, /\.product-remove-reference-list/);
  assert.match(packageJson, /verify:product-reference-removal/);
});

test("Reference list menampilkan resolved QC per inventory occurrence dan tidak mengembalikan orphan proposal", async () => {
  const migration = await read("../supabase/migrations/20260911130000_product_reference_removal.sql");
  assert.match(migration, /'qc:' \|\| proposal\.id::text[\s\S]*fact\.storage_category[\s\S]*fact\.item_ordinal/);
  assert.match(migration, /join public\.product_proposals as proposal\s+on proposal\.id = fact\.product_proposal_id/);
  assert.match(migration, /proposal\.submission_id = submission\.id/);
  assert.match(migration, /fact\.product_id is null/);
  assert.doesNotMatch(migration, /left join lateral public\.submission_product_reference_category_rows[\s\S]*fact\.product_proposal_id = base\.proposal_id/);
  assert.match(migration, /'storageCategory', storage_category/);
  assert.match(migration, /'itemOrdinal', item_ordinal/);
});

test("Migration reference removal additive dan tidak memuat business DML saat deployment", async () => {
  const migration = await read("../supabase/migrations/20260911140000_fix_product_reference_removal_current_inventory.sql");
  const topLevel = migration.replace(/as \$\$[\s\S]*?\$\$/g, "FUNCTION_BODY");
  assert.doesNotMatch(topLevel, /\b(insert|update|delete|alter|truncate)\b/i);
  assert.match(topLevel, /create or replace function/i);
  assert.match(topLevel, /grant execute/i);
});
