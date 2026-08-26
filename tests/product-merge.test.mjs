import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Product merge memakai canonical forwarding, preflight atomik, dan UX Super Admin", async () => {
  const [migration, qcMergeMigration, apiHelper, preflightRoute, mergeRoute, productsRoute, pickerRoute, component, dialog, hook, css, packageJson] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260824120000_product_merge.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260831120000_product_merge_qc_references.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/admin-product-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/[id]/merge-preflight/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/[id]/merge/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminProducts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/ProductMergeDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useProductCatalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /add column merged_into_product_id uuid/);
  assert.match(migration, /foreign key \(merged_into_product_id\)[\s\S]*on delete restrict/);
  assert.match(migration, /products_merged_inactive_check/);
  for (const rpc of ["resolve_canonical_product_id", "resolve_canonical_products", "product_merge_snapshot", "product_merge_validation", "admin_product_merge_preflight", "admin_merge_product"]) {
    assert.match(migration, new RegExp(`function public\\.${rpc}`));
  }
  assert.match(migration, /perform public\.require_super_admin\(\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /lock table public\.products in share row exclusive mode/);
  assert.match(migration, /lock table public\.product_aliases in share row exclusive mode/);
  assert.match(migration, /lock table public\.submissions in share row exclusive mode/);
  assert.match(migration, /order by product\.id for update/);
  assert.match(migration, /order by submission\.id[\s\S]*for update of submission/);
  assert.ok((migration.match(/product_merge_validation\(p_source_product_id, p_target_product_id\)/g) ?? []).length >= 2, "Execute harus mengulang validation setelah lock.");
  assert.match(migration, /p_preflight_token <> v_plan ->> 'preflightToken'/);
  assert.match(migration, /submission\.archived_at is null/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /version = submission\.version \+ 1/);
  assert.match(migration, /'productId', v_target\.id[\s\S]*'brand', v_target\.brand[\s\S]*'model', v_target\.model/);
  assert.match(migration, /update public\.product_aliases[\s\S]*set product_id = v_target\.id/);
  assert.match(migration, /set active = false,[\s\S]*merged_into_product_id = v_target\.id/);
  assert.match(migration, /'PRODUCT_MERGE'/);
  assert.match(migration, /source_already_merged/);
  assert.match(migration, /merge_cycle/);
  assert.match(migration, /alias_collision/);
  assert.match(migration, /Merged Product cannot be edited/);
  assert.match(migration, /Merged Product status cannot be changed/);
  assert.match(qcMergeMigration, /function public\.product_merge_validation_with_qc/);
  assert.match(qcMergeMigration, /lock table public\.product_proposals in share row exclusive mode/);
  assert.match(qcMergeMigration, /proposal\.resolved_product_id = p_source_product_id/);
  assert.match(qcMergeMigration, /set resolved_product_id = v_target\.id/);
  assert.match(qcMergeMigration, /'qcActions', jsonb_build_object\('repointed', v_qc_repointed\)/);
  assert.match(qcMergeMigration, /p_preflight_token <> v_plan ->> 'preflightToken'/);
  assert.match(migration, /resolve_canonical_product_id\(coalesce/);
  assert.match(migration, /grant execute on function public\.admin_merge_product/);

  assert.match(apiHelper, /parseProductMergeRequest/);
  assert.match(apiHelper, /productMergeConflictMessage/);
  assert.match(apiHelper, /state_changed/);
  assert.match(apiHelper, /active_lock/);
  for (const route of [preflightRoute, mergeRoute]) {
    assert.match(route, /PRODUCT_UUID_PATTERN/);
    assert.match(route, /requireProductDependencyClient/);
    assert.match(route, /parseProductMergeRequest/);
  }
  assert.match(preflightRoute, /admin_product_merge_preflight/);
  assert.match(mergeRoute, /admin_merge_product/);
  assert.match(mergeRoute, /p_preflight_token/);
  assert.match(productsRoute, /resolve_canonical_products/);
  assert.match(productsRoute, /merged_into_product_id/);
  assert.match(productsRoute, /activeOnly/);

  assert.match(component, /ProductMergeDialog/);
  assert.match(component, /Digabungkan/);
  assert.match(component, /merged_target/);
  assert.match(component, /Lihat Riwayat/);
  assert.match(component, /Produk ini telah digabungkan ke/);
  assert.match(dialog, /activeOnly: "1"/);
  assert.match(dialog, /excludeProductId: source\.id/);
  assert.match(dialog, /merge-preflight/);
  assert.match(dialog, /preflightToken/);
  assert.match(dialog, /hasil QC terkait diarahkan ke Produk tujuan/);
  assert.match(dialog, /Submission arsip tidak diubah; riwayat QC tetap utuh/);
  assert.match(dialog, /resolvedQcProposalCount/);
  assert.match(dialog, /disabled=\{plan\?\.status !== "ready" \|\| preflightLoading\}/);
  assert.match(pickerRoute, /resolveProductId/);
  assert.match(pickerRoute, /resolve_canonical_products/);
  assert.match(pickerRoute, /\.eq\("active", true\)/);
  assert.match(hook, /canonicalById/);
  assert.match(hook, /canonical\?\.canonical_product_id/);
  assert.match(css, /\.status-pill\.merged/);
  assert.match(css, /\.product-merge-warning/);
  assert.match(packageJson, /verify:product-merge/);
});
