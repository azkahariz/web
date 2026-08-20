import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Product delete memakai dependency preflight, DB revalidation, dan confirmation UX", async () => {
  const [migration, qcMigration, mergeMigration, apiHelper, preflightRoute, deleteRoute, component, dialog, css, packageJson] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260825120000_product_delete.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260810170000_super_admin_product_qc.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260824120000_product_merge.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/admin-product-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/[id]/delete-preflight/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminProducts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/ProductDeleteDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const rpc of ["product_delete_validation", "admin_product_delete_preflight", "admin_delete_product"]) {
    assert.match(migration, new RegExp(`function public\\.${rpc}`));
  }
  assert.match(migration, /perform public\.require_super_admin\(\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /product_direct_reference_rows\(p_product_id\)/);
  assert.match(migration, /resolve_canonical_product_id\(coalesce/);
  assert.match(migration, /submission\.archived_at/);
  assert.match(migration, /proposal\.resolved_product_id = p_product_id/);
  assert.match(migration, /alias\.product_id = p_product_id/);
  assert.match(migration, /merged_into_product_id = p_product_id/);
  assert.match(migration, /v_product\.merged_into_product_id is not null/);
  assert.match(migration, /deactivate_first/);
  assert.match(migration, /merged_source/);
  assert.match(migration, /merge_target/);
  assert.match(migration, /current_references/);
  assert.match(migration, /archived_references/);
  assert.match(migration, /qc_history/);
  assert.match(migration, /aliases/);
  assert.match(migration, /lock table public\.products in share row exclusive mode/);
  assert.doesNotMatch(migration, /lock table public\.product_aliases/);
  assert.doesNotMatch(migration, /lock table public\.submissions/);
  assert.match(migration, /function public\.submission_direct_product_ids/);
  assert.match(migration, /function public\.guard_submission_product_references/);
  assert.match(migration, /create trigger submissions_guard_product_references/);
  assert.match(migration, /before insert or update of payload on public\.submissions/);
  assert.match(migration, /for key share/);
  assert.match(migration, /errcode = '23503'/);
  assert.match(migration, /where product\.id = p_product_id[\s\S]*for update/);
  assert.ok((migration.match(/product_delete_validation\(p_product_id\)/g) ?? []).length >= 2, "Execute harus mengulang validation setelah lock.");
  assert.match(migration, /p_preflight_token <> v_plan ->> 'preflightToken'/);
  assert.match(migration, /'PRODUCT_DELETE'/);
  assert.match(migration, /'product', v_plan -> 'product'/);
  assert.match(migration, /'dependencies', v_plan -> 'dependencies'/);
  assert.match(migration, /delete from public\.products/);
  assert.match(migration, /when foreign_key_violation/);
  assert.match(migration, /grant execute on function public\.admin_product_delete_preflight/);
  assert.match(migration, /grant execute on function public\.admin_delete_product/);

  assert.match(qcMigration, /resolved_product_id uuid references public\.products\(id\) on delete restrict/);
  assert.match(qcMigration, /product_id uuid not null references public\.products\(id\) on delete restrict/);
  assert.match(mergeMigration, /foreign key \(merged_into_product_id\)[\s\S]*on delete restrict/);

  assert.match(apiHelper, /productDeleteConflictMessage/);
  assert.match(apiHelper, /state_changed/);
  for (const route of [preflightRoute, deleteRoute]) {
    assert.match(route, /PRODUCT_UUID_PATTERN/);
    assert.match(route, /requireProductDependencyClient/);
  }
  assert.match(preflightRoute, /admin_product_delete_preflight/);
  assert.match(deleteRoute, /export async function DELETE/);
  assert.match(deleteRoute, /admin_delete_product/);
  assert.match(deleteRoute, /p_preflight_token/);

  assert.match(component, /ProductDeleteDialog/);
  assert.match(component, /Hapus Permanen/);
  assert.match(component, /disabled=\{product\.active\}/);
  assert.match(component, /Nonaktifkan Produk terlebih dahulu sebelum menghapus permanen/);
  assert.match(component, /inspectDeleteBlockers/);
  assert.match(component, /merged_into_product_id \? <button[^\n]*Lihat Riwayat<\/button> : <>[^\n]*product-delete-action/);
  assert.match(dialog, /Hapus Produk Permanen/);
  assert.match(dialog, /tidak dapat dipulihkan melalui aplikasi/);
  assert.match(dialog, /Tidak ditemukan item inventaris, riwayat QC, alias, arsip, atau hubungan penggabungan/);
  assert.match(dialog, /loadingText="Menghapus\.\.\."/);
  assert.match(dialog, /Produk berhasil dihapus permanen/);
  assert.match(dialog, /aria-busy=\{loading\}/);
  assert.match(css, /\.product-delete-action/);
  assert.match(css, /\.product-delete-dialog/);
  assert.match(css, /\.product-delete-blocked/);
  assert.match(packageJson, /verify:product-delete/);
});
