import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("master Produk memakai RPC Super Admin, pagination server-side, dan guard legacy sync", async () => {
  const [migration, usageMigration, usageCountsMigration, route, pickerRoute, pickerLib, component, inventoryApp, submissionMonitor, submissionLib, hook, sync, packageJson] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260815120000_super_admin_product_management.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260815130000_super_admin_product_usage.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260815140000_super_admin_product_usage_counts.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/product-picker.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminProducts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminSubmissionMonitor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/submission-monitoring.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useProductCatalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/sync-master.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  for (const rpc of ["admin_product_summary", "admin_list_products", "admin_create_product", "admin_update_product", "admin_set_product_active"]) {
    assert.match(migration, new RegExp(`function public\\.${rpc}`));
  }
  assert.match(usageMigration, /function public\.admin_product_usage/);
  assert.match(usageMigration, /require_super_admin/);
  assert.match(usageMigration, /submission\.archived_at is null/);
  assert.match(usageMigration, /item\.value ->> 'productId'/);
  assert.match(usageMigration, /productProposalId/);
  assert.match(usageMigration, /proposal\.status in \('APPROVED', 'MERGED'\)/);
  assert.match(usageMigration, /count\(distinct site_id\)/);
  assert.match(usageMigration, /security definer[\s\S]*set search_path = ''/);
  assert.match(usageCountsMigration, /function public\.admin_product_usage_counts/);
  assert.match(usageCountsMigration, /require_super_admin/);
  assert.match(usageCountsMigration, /submission\.archived_at is null/);
  assert.match(usageCountsMigration, /proposal\.status in \('APPROVED', 'MERGED'\)/);
  assert.match(usageCountsMigration, /security definer[\s\S]*set search_path = ''/);
  for (const action of ["PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_ACTIVATE", "PRODUCT_DEACTIVATE"]) assert.match(migration, new RegExp(action));
  assert.match(migration, /source_origin in \('SPREADSHEET', 'QC', 'ADMIN'\)/);
  assert.match(migration, /normalize_product_text/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(route, /auth\.getUser/);
  assert.match(route, /status: 403/);
  assert.match(route, /count: "exact"/);
  assert.match(route, /pageSize >= 10 && pageSize <= 1000/);
  assert.match(route, /\.range\(\(page - 1\) \* pageSize, page \* pageSize - 1\)/);
  assert.match(route, /usageProductId/);
  assert.match(route, /admin_product_usage/);
  assert.match(route, /usageCountProductId/);
  assert.match(route, /admin_product_usage_counts/);
  assert.match(pickerRoute, /\.eq\("active", true\)/);
  assert.match(pickerRoute, /count: "exact"/);
  assert.match(pickerRoute, /\.order\("brand"/);
  assert.match(pickerRoute, /\.order\("model"/);
  assert.match(pickerRoute, /PRODUCT_PICKER_PAGE_SIZE/);
  assert.match(pickerLib, /PRODUCT_PICKER_PAGE_SIZE = 100/);
  assert.match(pickerRoute, /\.range\(\(page - 1\) \* PRODUCT_PICKER_PAGE_SIZE, page \* PRODUCT_PICKER_PAGE_SIZE - 1\)/);
  assert.match(component, /Cari Merk atau Tipe/);
  assert.match(component, /pageSize/);
  assert.match(component, /fetch\(`\/api\/admin\/products/);
  assert.match(component, /Masukkan merk/);
  assert.match(component, /Masukkan tipe/);
  assert.match(component, /Simpan Perubahan/);
  assert.doesNotMatch(component, /confirmLabel: "Berikutnya"/);
  for (const option of ["50", "100", "200", "500", "1000"]) assert.match(submissionLib, new RegExp(`\\b${option}\\b`));
  for (const contract of ["Baris per halaman", "Menampilkan", "Sebelumnya", "Berikutnya", "Halaman", "Custom..."]) {
    assert.match(component, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(submissionMonitor, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(component, /SUBMISSION_PAGE_SIZE_OPTIONS/);
  assert.match(component, /normalizeSubmissionPageSize/);
  assert.match(component, /onBlur=\{\(\) => applyPageSize\(pageSizeDraft\)\}/);
  assert.match(component, /pageSizeCancelRef/);
  assert.match(component, /usageCounts/);
  assert.match(component, /referensi/);
  assert.match(component, /Penggunaan Produk/);
  assert.match(inventoryApp, /product-pagination/);
  assert.match(inventoryApp, /product-skeleton/);
  assert.match(inventoryApp, /aria-busy=\{productCatalog\.loading\}/);
  assert.match(inventoryApp, /Memperbarui/);
  assert.match(hook, /requestSequenceRef/);
  assert.match(hook, /displayPage/);
  assert.match(hook, /setError\("Katalog produk gagal dimuat\."\)/);
  assert.doesNotMatch(hook, /setLiveProducts\(\[\]\)/);
  assert.match(hook, /fetch\(`\/api\/products/);
  assert.match(hook, /PRODUCT_PICKER_PAGE_SIZE/);
  assert.match(hook, /setPage/);
  assert.doesNotMatch(hook, /data\.generated\.json/);
  assert.match(sync, /allowLegacyRemoteImport/);
  assert.match(sync, /Legacy import ke database remote diblokir/);
  assert.match(packageJson, /sync:master:local/);
  assert.match(packageJson, /sync:master:legacy:remote/);
});
