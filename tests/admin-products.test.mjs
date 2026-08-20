import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  filterAdminProducts,
  normalizeProductSortDirection,
  normalizeProductSortField,
  normalizeProductStatusFilter,
  prepareAdminProductPage,
  productSourceLabel,
  sortAdminProducts,
} from "../app/lib/admin-product-list.ts";

const productRows = [
  { id: "a", brand: "Vaisala", model: "WXT536", active: true, source_origin: "SPREADSHEET", merged_into_product_id: null, usage_count: 12 },
  { id: "b", brand: "Campbell", model: "CR1000", active: true, source_origin: "ADMIN", merged_into_product_id: null, usage_count: 2 },
  { id: "c", brand: "Kipp", model: "CMP11", active: false, source_origin: "QC", merged_into_product_id: null, usage_count: 7 },
  { id: "d", brand: "Campbell", model: "CR6", active: false, source_origin: "ADMIN", merged_into_product_id: "b", usage_count: 1 },
];

test("filter Produk membedakan status aktif, nonaktif, digabungkan, sumber, dan pencarian", () => {
  assert.deepEqual(filterAdminProducts(productRows).map((row) => row.id), ["a", "b"]);
  assert.deepEqual(filterAdminProducts(productRows, { status: "inactive" }).map((row) => row.id), ["c"]);
  assert.deepEqual(filterAdminProducts(productRows, { status: "merged" }).map((row) => row.id), ["d"]);
  assert.deepEqual(filterAdminProducts(productRows, { status: "all" }).map((row) => row.id), ["a", "b", "c", "d"]);
  assert.deepEqual(filterAdminProducts(productRows, { status: "all", source: "ADMIN" }).map((row) => row.id), ["b", "d"]);
  assert.deepEqual(filterAdminProducts(productRows, { status: "active", source: "ADMIN", search: "cr1000" }).map((row) => row.id), ["b"]);
});

test("sorting Produk stabil, case-insensitive, dan Penggunaan numerik", () => {
  assert.deepEqual(sortAdminProducts(productRows, "brand", "asc").map((row) => row.id), ["d", "b", "c", "a"]);
  assert.deepEqual(sortAdminProducts(productRows, "model", "desc").map((row) => row.id), ["a", "b", "d", "c"]);
  assert.deepEqual(sortAdminProducts(productRows, "usage", "asc").map((row) => row.id), ["d", "b", "c", "a"]);
  assert.deepEqual(sortAdminProducts(productRows, "usage", "desc").map((row) => row.id), ["a", "c", "b", "d"]);
  assert.deepEqual(sortAdminProducts(productRows, "status", "asc").map((row) => row.id), ["b", "a", "d", "c"]);
  assert.deepEqual(sortAdminProducts(productRows, "source", "asc").map((row) => row.id), ["d", "b", "a", "c"]);
});

test("filter dan sorting Produk diterapkan sebelum pagination server-side", () => {
  const result = prepareAdminProductPage(productRows, { status: "all", source: "ADMIN", sort: "usage", direction: "desc", page: 2, pageSize: 1 });
  assert.equal(result.totalCount, 2);
  assert.deepEqual(result.rows.map((row) => row.id), ["d"]);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 1);
});

test("parameter Product list memakai allowlist dan label sumber manusiawi", () => {
  assert.equal(normalizeProductStatusFilter("unknown"), "active");
  assert.equal(normalizeProductStatusFilter("merged"), "merged");
  assert.equal(normalizeProductSortField("usage"), "usage");
  assert.equal(normalizeProductSortField("unknown"), "brand");
  assert.equal(normalizeProductSortDirection("desc"), "desc");
  assert.equal(normalizeProductSortDirection("sideways"), "asc");
  assert.equal(productSourceLabel("SPREADSHEET"), "Legacy Spreadsheet");
  assert.equal(productSourceLabel("QC"), "QC Produk");
  assert.equal(productSourceLabel("IMPORT_LAMA"), "IMPORT_LAMA");
});

test("master Produk memakai RPC Super Admin, filter/sorting server-side, dan guard legacy sync", async () => {
  const [migration, usageMigration, usageCountsMigration, route, listLib, pickerRoute, pickerLib, component, dashboard, globals, inventoryApp, submissionMonitor, submissionLib, hook, sync, packageJson] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260815120000_super_admin_product_management.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260815130000_super_admin_product_usage.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260815140000_super_admin_product_usage_counts.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/admin-product-list.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/product-picker.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminProducts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
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
  assert.match(route, /pageSize >= 10 && pageSize <= 1000/);
  assert.match(route, /normalizeProductStatusFilter/);
  assert.match(route, /normalizeProductSortField/);
  assert.match(route, /normalizeProductSortDirection/);
  assert.match(route, /prepareAdminProductPage/);
  assert.match(route, /admin_product_usage_counts/);
  assert.match(route, /const shouldLoadUsageCounts = !activeOnly \|\| sortField === "usage"/);
  assert.match(route, /matchingRows\.map\(\(row\) => row\.id\)/);
  assert.match(route, /search, status, source, sort: sortField, direction: sortDirection, page, pageSize/);
  assert.match(route, /searchParams\.get\("sources"\) === "1"/);
  assert.match(route, /productSourceLabel/);
  assert.match(listLib, /type AdminProductStatusFilter = "active" \| "inactive" \| "merged" \| "all"/);
  assert.match(listLib, /field === "usage"/);
  assert.match(listLib, /const filtered = filterAdminProducts/);
  assert.match(listLib, /const sorted = sortAdminProducts/);
  assert.match(route, /usageProductId/);
  assert.match(route, /admin_product_usage/);
  assert.match(route, /usageCountProductId/);
  assert.match(route, /admin_product_usage_counts/);
  assert.match(pickerRoute, /\.eq\("active", true\)/);
  assert.match(pickerRoute, /mode === "search"/);
  assert.match(pickerRoute, /mode === "recommend"/);
  assert.match(pickerRoute, /rankProductSearch/);
  assert.match(pickerRoute, /recommendStationProducts/);
  assert.match(pickerRoute, /count: "exact"/);
  assert.match(pickerRoute, /\.order\("brand"/);
  assert.match(pickerRoute, /\.order\("model"/);
  assert.match(pickerRoute, /PRODUCT_PICKER_PAGE_SIZE/);
  assert.match(pickerLib, /PRODUCT_PICKER_PAGE_SIZE = 100/);
  assert.match(hook, /setTimeout\(async \(\) => \{/);
  assert.match(hook, /\}, 300\)/);
  assert.match(hook, /recommendationSequenceRef/);
  assert.match(globals, /\.product-drawer[^}]*overflow-y: auto/);
  assert.match(globals, /\.product-results[^}]*overflow: visible/);
  assert.match(globals, /\.custom-product[^}]*safe-area-inset-bottom/);
  assert.match(pickerRoute, /\.range\(\(page - 1\) \* PRODUCT_PICKER_PAGE_SIZE, page \* PRODUCT_PICKER_PAGE_SIZE - 1\)/);
  const qcContextRoute = await readFile(new URL("../app/api/admin/product-proposals/route.ts", import.meta.url), "utf8");
  const qcContext = await readFile(new URL("../app/lib/qc-proposal-context.ts", import.meta.url), "utf8");
  assert.match(qcContextRoute, /admin_product_summary/);
  assert.match(qcContextRoute, /\.in\("id", submissionIds\)/);
  assert.match(qcContextRoute, /select\("id, site_id, site_subtype_id, payload"\)/);
  assert.match(qcContextRoute, /buildQcProposalContexts/);
  assert.match(qcContext, /productProposalId/);
  assert.match(qcContext, /functionCategories/);
  assert.match(dashboard, /fetch\("\/api\/admin\/product-proposals"/);
  assert.match(dashboard, /proposal\.context\.categories/);
  assert.match(component, /Cari Merk atau Tipe/);
  assert.match(component, /statusFilter/);
  assert.match(component, /sourceFilter/);
  assert.match(component, /Semua status/);
  assert.match(component, /Semua sumber/);
  assert.match(component, /className="sortable-header"/);
  assert.match(component, /aria-sort=/);
  assert.match(component, /changeSort\(field\)/);
  assert.match(component, /status: statusFilter/);
  assert.match(component, /params\.set\("source", sourceFilter\)/);
  assert.doesNotMatch(component, />Urutkan<select/);
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
  assert.match(component, /await onChanged\(\)/);
  assert.match(component, /Math\.min\(current, Math\.max\(1, Math\.ceil\(nextTotalCount \/ pageSize\)\)\)/);
  assert.match(dashboard, /refreshProductSummary/);
  assert.match(dashboard, /<AdminProducts onChanged=\{refreshProductSummary\}/);
  assert.doesNotMatch(dashboard, /<AdminProducts onChanged=\{\(\) => void refresh\(\)\}/);
  assert.match(component, /product\.usage_count \?\? 0/);
  assert.doesNotMatch(component, /loadUsageCounts/);
  assert.match(component, /referensi/);
  assert.match(component, /product-usage-state/);
  assert.match(component, /product-usage-spinner/);
  assert.doesNotMatch(component, /usageLoading && !usage && <p className="app-dialog-error"/);
  assert.match(component, /Produk ini belum memiliki penggunaan pada submission aktif\./);
  assert.match(component, /aria-busy=\{usageLoading \|\| dependenciesLoading \|\| referencesLoading\}/);
  assert.match(globals, /\.product-usage-state[\s\S]*color: var\(--muted\)/);
  assert.match(globals, /\.product-usage-spinner[\s\S]*animation: product-usage-spin/);
  assert.match(component, /Penggunaan Produk/);
  assert.match(inventoryApp, /product-pagination/);
  assert.match(inventoryApp, /product-skeleton/);
  assert.match(inventoryApp, /aria-busy=\{productCatalog\.loading\}/);
  assert.match(inventoryApp, /Memperbarui/);
  assert.match(inventoryApp, /Mungkin produk yang Anda cari sudah tersedia/);
  assert.match(inventoryApp, /Tetap usulkan produk baru/);
  assert.match(inventoryApp, /chooseRecommendedProduct/);
  assert.match(hook, /requestSequenceRef/);
  assert.match(hook, /recommendationSequenceRef/);
  assert.match(hook, /mode: "recommend"/);
  assert.match(hook, /displayPage/);
  assert.match(hook, /setError\("Katalog produk gagal dimuat\."\)/);
  assert.doesNotMatch(hook, /setLiveProducts\(\[\]\)/);
  assert.match(hook, /fetch\(`\/api\/products/);
  assert.match(hook, /PRODUCT_PICKER_PAGE_SIZE/);
  assert.match(hook, /setPage/);
  assert.doesNotMatch(hook, /data\.generated\.json/);
  assert.doesNotMatch(hook, /product_aliases/);
  assert.match(sync, /allowLegacyRemoteImport/);
  assert.match(sync, /Legacy import ke database remote diblokir/);
  assert.match(packageJson, /sync:master:local/);
  assert.match(packageJson, /sync:master:legacy:remote/);
});
