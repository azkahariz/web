import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  enrichAdminProductPage,
  filterAdminProducts,
  loadProductPageEnrichmentInBatches,
  loadProductReferenceCategoriesInBatches,
  loadProductUsageCountsInBatches,
  normalizeProductReferenceCategories,
  normalizeProductSortDirection,
  normalizeProductSortField,
  normalizeProductStatusFilter,
  prepareAdminProductPage,
  productSourceLabel,
  sortAdminProducts,
} from "../app/lib/admin-product-list.ts";
import { loadAllProductCatalogRows } from "../app/lib/product-picker.ts";
import { rankProductSearch } from "../app/lib/product-qc.ts";

const productRows = [
  { id: "a", brand: "Vaisala", model: "WXT536", active: true, source_origin: "SPREADSHEET", merged_into_product_id: null, usage_count: 12 },
  { id: "b", brand: "Campbell", model: "CR1000", active: true, source_origin: "ADMIN", merged_into_product_id: null, usage_count: 2 },
  { id: "c", brand: "Kipp", model: "CMP11", active: false, source_origin: "QC", merged_into_product_id: null, usage_count: 7 },
  { id: "d", brand: "Campbell", model: "CR6", active: false, source_origin: "ADMIN", merged_into_product_id: "b", usage_count: 1 },
];

test("pencarian Product Picker memuat katalog melewati batas 1000 row", async () => {
  const catalog = Array.from({ length: 1004 }, (_, index) => ({
    id: `product-${index + 1}`,
    brand: index === 1000 ? "Vega" : `Brand ${String(index + 1).padStart(4, "0")}`,
    model: index === 1000 ? "Vegapuls C23" : `Model ${index + 1}`,
    active: true,
  }));
  const requestedRanges = [];
  const loaded = await loadAllProductCatalogRows(async (from, to) => {
    requestedRanges.push([from, to]);
    return { data: catalog.slice(from, to + 1), error: null };
  });

  assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999]]);
  assert.equal(loaded.data?.length, 1004);
  assert.equal(rankProductSearch("Vega", loaded.data ?? [])[0]?.product.id, "product-1001");
});

test("usage Produk dibatch lengkap dan tidak mengubah kegagalan batch menjadi false zero", async () => {
  const ids = Array.from({ length: 1103 }, (_, index) => `product-${index + 1}`);
  const authoritative = new Map(ids.map((id, index) => [id, index === 1080 ? 3 : index === 7 ? 8 : 0]));
  const singleCallRows = ids.slice(0, 1000).map((product_id) => ({ product_id, reference_count: authoritative.get(product_id) ?? 0 }));
  assert.equal(new Map(singleCallRows.map((row) => [row.product_id, row.reference_count])).get("product-1081") ?? 0, 0);

  const calls = [];
  const loaded = await loadProductUsageCountsInBatches(ids, async (batchIds) => {
    calls.push(batchIds);
    return { data: batchIds.map((product_id) => ({ product_id, reference_count: authoritative.get(product_id) ?? 0 })), error: null };
  });
  assert.deepEqual(calls.map((batch) => batch.length), [500, 500, 103]);
  assert.equal(new Set(calls.flat()).size, ids.length);
  assert.equal(new Map((loaded.data ?? []).map((row) => [row.product_id, row.reference_count])).get("product-1081"), 3);

  const sorted = prepareAdminProductPage(ids.map((id) => ({
    id, brand: id, model: "Model", active: true, source_origin: "ADMIN",
    usage_count: new Map((loaded.data ?? []).map((row) => [row.product_id, row.reference_count])).get(id) ?? 0,
  })), { sort: "usage", direction: "desc", pageSize: 2 });
  assert.deepEqual(sorted.rows.map((row) => row.id), ["product-8", "product-1081"]);

  const failed = await loadProductUsageCountsInBatches(ids, async (batchIds) => (
    batchIds.includes("product-501") ? { data: null, error: "batch failed" } : { data: [], error: null }
  ));
  assert.equal(failed.data, null);
  assert.equal(failed.error, "batch failed");
});

test("kategori referensi Produk dideduplikasi, diurutkan, dan dibatch tanpa partial success", async () => {
  assert.deepEqual(
    normalizeProductReferenceCategories([" Sensor Suhu ", "Display", "", "Display", "   ", "Sensor Tekanan"]),
    ["Display", "Sensor Suhu", "Sensor Tekanan"],
  );

  const ids = Array.from({ length: 1103 }, (_, index) => `product-${index + 1}`);
  const calls = [];
  const loaded = await loadProductReferenceCategoriesInBatches(ids, async (batchIds) => {
    calls.push(batchIds);
    return {
      data: batchIds.map((product_id) => ({
        product_id,
        categories: product_id === "product-1081" ? ["Sensor Suhu", "Display", "Display"] : [],
      })),
      error: null,
    };
  });
  assert.deepEqual(calls.map((batch) => batch.length), [500, 500, 103]);
  assert.equal(new Set(calls.flat()).size, ids.length);
  assert.deepEqual(new Map((loaded.data ?? []).map((row) => [row.product_id, row.categories])).get("product-1081"), ["Display", "Sensor Suhu"]);

  const failed = await loadProductReferenceCategoriesInBatches(ids, async (batchIds) => (
    batchIds.includes("product-501") ? { data: null, error: "batch failed" } : { data: [], error: null }
  ));
  assert.equal(failed.data, null);
  assert.equal(failed.error, "batch failed");
});

test("combined Product enrichment dibatch tanpa partial success", async () => {
  const ids = Array.from({ length: 1100 }, (_, index) => `product-${index + 1}`);
  const batchSizes = [];
  const loaded = await loadProductPageEnrichmentInBatches(ids, async (batch) => {
    batchSizes.push(batch.length);
    return { data: batch.map((product_id) => ({ product_id, reference_count: 2, categories: [" Sensor ", "Sensor"] })), error: null };
  });
  assert.deepEqual(batchSizes, [500, 500, 100]);
  assert.equal(loaded.data?.length, 1100);
  assert.deepEqual(loaded.data?.[0].categories, ["Sensor"]);
  const failed = await loadProductPageEnrichmentInBatches(ids, async (batch) => batch[0] === "product-501"
    ? { data: null, error: "batch failed" }
    : { data: batch.map((product_id) => ({ product_id, reference_count: 0, categories: [] })), error: null });
  assert.equal(failed.data, null);
  assert.equal(failed.error, "batch failed");
});

test("enrichment halaman Product tidak mengubah kegagalan ancillary menjadi nol palsu", () => {
  const products = Array.from({ length: 50 }, (_, index) => ({
    id: `product-${index + 1}`,
    brand: `Brand ${index + 1}`,
    model: `Model ${index + 1}`,
    active: true,
    source_origin: "ADMIN",
  }));
  const unavailable = enrichAdminProductPage(products, [], [], { usageUnavailable: true, categoriesUnavailable: true });
  assert.equal(unavailable.length, 50);
  assert.equal(unavailable[0].usage_count, null);
  assert.equal(unavailable[0].categories, null);

  const loaded = enrichAdminProductPage(products, [{ product_id: "product-1", reference_count: 7 }], [{ product_id: "product-1", categories: ["Sensor pasut"] }]);
  assert.equal(loaded[0].usage_count, 7);
  assert.deepEqual(loaded[0].categories, ["Sensor pasut"]);
  assert.equal(loaded[1].usage_count, 0);
  assert.deepEqual(loaded[1].categories, []);
});

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
  const [migration, usageMigration, usageCountsMigration, categoryMigration, referenceFilterMigration, enrichmentMigration, route, listLib, pickerRoute, pickerLib, component, dashboard, globals, inventoryApp, submissionMonitor, submissionLib, hook, sync, packageJson] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260815120000_super_admin_product_management.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260815130000_super_admin_product_usage.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260815140000_super_admin_product_usage_counts.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260909120000_admin_product_reference_categories.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260910130000_admin_product_reference_filters.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260911120000_admin_product_page_enrichment.sql", import.meta.url), "utf8"),
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
  assert.match(categoryMigration, /function public\.admin_product_reference_categories\(p_product_ids uuid\[\]\)/);
  assert.match(categoryMigration, /require_super_admin/);
  assert.match(categoryMigration, /submission_product_reference_category_rows/);
  assert.match(categoryMigration, /submission\.archived_at is null/);
  assert.match(categoryMigration, /proposal\.status in \('APPROVED', 'MERGED'\)/);
  assert.match(categoryMigration, /array_agg\(distinct btrim\(ref\.category_label\) order by btrim\(ref\.category_label\)\)/);
  assert.match(categoryMigration, /security definer[\s\S]*set search_path = ''/);
  assert.doesNotMatch(categoryMigration, /\b(insert|update|delete)\s+(into|public\.|from)/i);
  assert.match(referenceFilterMigration, /function public\.admin_product_reference_filter_occurrences\(\)/);
  assert.match(referenceFilterMigration, /function public\.admin_product_reference_filter_options\(\)/);
  assert.match(referenceFilterMigration, /function public\.admin_product_reference_filter_ids/);
  assert.match(referenceFilterMigration, /submission\.archived_at is null/);
  assert.match(referenceFilterMigration, /proposal\.status in \('APPROVED', 'MERGED'\)/);
  assert.match(referenceFilterMigration, /occurrence\.category_label = any\(v_categories\)/);
  assert.match(referenceFilterMigration, /occurrence\.station_category_id = p_station_category_id/);
  assert.match(referenceFilterMigration, /occurrence\.site_type_id = p_site_type_id/);
  assert.match(referenceFilterMigration, /category\.code in \('METEOROLOGI', 'KLIMATOLOGI', 'GEOFISIKA'\)/);
  assert.match(referenceFilterMigration, /security definer[\s\S]*set search_path = ''/);
  assert.doesNotMatch(referenceFilterMigration, /\b(insert|update|delete|alter|create table|create index)\b/i);
  assert.match(enrichmentMigration, /function public\.admin_product_page_enrichment\(p_product_ids uuid\[\]\)/);
  assert.match(enrichmentMigration, /require_super_admin/);
  assert.match(enrichmentMigration, /submission\.archived_at is null/);
  assert.match(enrichmentMigration, /proposal_status in \('APPROVED', 'MERGED'\)/);
  assert.match(enrichmentMigration, /resolve_canonical_product_id/);
  assert.match(enrichmentMigration, /functionCategories/);
  assert.doesNotMatch(enrichmentMigration, /\b(insert|update|delete|alter|create table|create index)\b/i);
  for (const action of ["PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_ACTIVATE", "PRODUCT_DEACTIVATE"]) assert.match(migration, new RegExp(action));
  assert.match(migration, /source_origin in \('SPREADSHEET', 'QC', 'ADMIN'\)/);
  assert.match(migration, /normalize_product_text/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(route, /auth\.getUser/);
  assert.match(route, /status: 403/);
  assert.match(route, /pageSize >= 10 && pageSize <= 1000/);
  assert.match(hook, /referencedProductIds/);
  assert.match(hook, /resolveProductId/);
  assert.match(inventoryApp, /productCatalog\.canonicalProducts/);
  assert.match(route, /normalizeProductStatusFilter/);
  assert.match(route, /normalizeProductSortField/);
  assert.match(route, /normalizeProductSortDirection/);
  assert.match(route, /prepareAdminProductPage/);
  assert.match(route, /admin_product_usage_counts/);
  assert.match(route, /loadProductUsageCountsInBatches/);
  assert.match(route, /admin_product_page_enrichment/);
  assert.match(route, /loadProductPageEnrichmentInBatches/);
  assert.match(route, /\.eq\("active", true\)[\s\S]*\.order\("id"\)[\s\S]*\.range\(from, from \+ 999\)/);
  assert.match(route, /from\("product_aliases"\)[\s\S]*\.order\("product_id"\)[\s\S]*\.order\("id"\)/);
  assert.match(route, /const usageSort = sortField === "usage"/);
  assert.match(route, /matchingRows\.length && usageSort[\s\S]*matchingRows\.map\(\(row\) => row\.id\)/);
  assert.match(route, /const pageProductIds = prepared\.rows\.map\(\(row\) => row\.id\)/);
  assert.match(route, /const deferEnrichment = url\.searchParams\.get\("deferEnrichment"\) === "1" && !usageSort/);
  assert.ok(route.indexOf("const pageProductIds = prepared.rows.map") > route.indexOf("prepareAdminProductPage("), "Usage sort biasa harus dipaginasi sebelum enrichment.");
  assert.match(route, /const pageEnrichmentResult = !activeOnly && !deferEnrichment/);
  assert.match(route, /enrichAdminProductPage/);
  assert.match(route, /usageUnavailable: Boolean\(pageEnrichmentResult\.error\)/);
  assert.match(route, /categoriesUnavailable: Boolean\(pageEnrichmentResult\.error\)/);
  assert.match(route, /issues/);
  assert.match(route, /search, status, source, sort: sortField, direction: sortDirection, page, pageSize/);
  assert.match(route, /searchParams\.get\("sources"\) === "1"/);
  assert.match(route, /searchParams\.get\("referenceFilterOptions"\) === "1"/);
  assert.match(route, /admin_product_reference_filter_options/);
  assert.match(route, /searchParams\.getAll\("category"\)/);
  assert.match(route, /admin_product_reference_filter_ids/);
  assert.match(route, /referenceProductIds\.has\(row\.id\)/);
  assert.ok(route.indexOf("referenceProductIds.has(row.id)") < route.indexOf("prepareAdminProductPage("), "Filter referensi harus diterapkan sebelum pagination.");
  assert.match(route, /productSourceLabel/);
  assert.match(listLib, /type AdminProductStatusFilter = "active" \| "inactive" \| "merged" \| "all"/);
  assert.match(listLib, /field === "usage"/);
  assert.match(listLib, /const filtered = filterAdminProducts/);
  assert.match(listLib, /const sorted = sortAdminProducts/);
  assert.match(listLib, /normalizeProductReferenceCategories/);
  assert.match(route, /usageProductId/);
  assert.match(route, /admin_product_usage/);
  assert.match(route, /usageCountProductId/);
  assert.match(route, /admin_product_usage_counts/);
  assert.match(pickerRoute, /\.eq\("active", true\)/);
  assert.match(pickerRoute, /mode === "search"/);
  assert.match(pickerRoute, /mode === "recommend"/);
  assert.match(pickerRoute, /rankProductSearch/);
  assert.match(pickerRoute, /recommendStationProducts/);
  assert.match(pickerRoute, /loadAllProductCatalogRows/);
  assert.match(pickerRoute, /from\("product_aliases"\)[\s\S]*\.range\(from, to\)/);
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
  const qcListMigration = await readFile(new URL("../supabase/migrations/20260902130000_admin_list_product_proposals.sql", import.meta.url), "utf8");
  assert.match(qcContextRoute, /admin_product_summary/);
  assert.match(qcContextRoute, /admin_list_product_proposals/);
  assert.match(qcListMigration, /submission_inventory_facts/);
  assert.match(qcListMigration, /p_page_size/);
  assert.match(qcContext, /productProposalId/);
  assert.match(qcContext, /functionCategories/);
  assert.match(dashboard, /fetch\(`\/api\/admin\/product-proposals\?\$\{params\.toString\(\)\}`/);
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
  assert.match(component, /params\.append\("category", category\)/);
  assert.match(component, /params\.set\("stationCategoryId", stationCategoryFilter\)/);
  assert.match(component, /params\.set\("siteTypeId", siteTypeFilter\)/);
  assert.match(component, /aria-multiselectable="true"/);
  assert.match(component, /Semua kategori/);
  assert.match(component, /Semua kelompok stasiun/);
  assert.match(component, /Semua tipe site/);
  assert.match(component, /Reset Filter/);
  assert.match(component, /setStatusFilter\("active"\)/);
  assert.match(component, /setCategoryFilters\(\[\]\)/);
  assert.match(component, /setPage\(1\)/);
  assert.match(globals, /\.product-reference-filters/);
  assert.match(globals, /\.product-category-filter-menu/);
  assert.match(globals, /\.product-category-filter-menu label \{[^}]*display: flex;[^}]*align-items: center;[^}]*gap: 8px;/);
  assert.match(globals, /\.product-category-filter-menu input \{[^}]*margin: 0;/);
  assert.doesNotMatch(component, />Urutkan<select/);
  assert.match(component, /pageSize/);
  assert.match(component, /fetch\(`\/api\/admin\/products/);
  assert.match(component, /Masukkan merk/);
  assert.match(component, /Masukkan tipe/);
  assert.match(component, /Simpan Perubahan/);
  assert.match(component, /<th>Kategori<\/th>/);
  assert.match(component, /product\.categories\.map/);
  assert.match(component, /product-category-empty/);
  assert.match(component, /colSpan=\{7\}/);
  assert.match(globals, /\.product-category-list[\s\S]*overflow-wrap: anywhere/);
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
  assert.match(component, /Promise\.all\(\[load\(\), loadSummary\(\), onChanged\(\)\]\)/);
  assert.match(component, /Math\.min\(current, Math\.max\(1, Math\.ceil\(nextTotalCount \/ pageSize\)\)\)/);
  assert.match(dashboard, /refreshProductSummary/);
  assert.match(dashboard, /<AdminProducts onChanged=\{refreshProductSummary\}/);
  assert.match(dashboard, /if \(tab === "products" \|\| dashboardLoaded\) return/);
  assert.match(dashboard, /\{tab === "products" && <AdminProducts/);
  assert.match(dashboard, /loading && tab !== "products"/);
  assert.doesNotMatch(dashboard, /<AdminProducts onChanged=\{\(\) => void refresh\(\)\}/);
  assert.match(component, /product\.usage_count === null \? "Gagal dimuat"/);
  assert.match(component, /product\.usage_count === undefined \? "Memuat\.\.\."/);
  assert.doesNotMatch(component, /product\.usage_count \?\? 0/);
  assert.match(component, /product\.categories === null/);
  assert.match(component, /const loadSummary = useCallback/);
  assert.match(component, /listRequestSequenceRef/);
  assert.match(component, /enrichmentProductId/);
  assert.match(component, /cachedReferenceFilterOptions/);
  assert.match(component, /initialEnrichmentSettled/);
  assert.match(component, /signal: controller\.signal|load\(controller\.signal\)/);
  assert.match(component, /summary\?\.total_count \?\? "\\u2014"/);
  assert.match(component, /listError && !listLoaded/);
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
  assert.match(hook, /loadAllProductCatalogRows/);
  assert.match(hook, /from\("product_proposals"\)[\s\S]*\.order\("id"\)[\s\S]*\.range\(from, to\)/);
  assert.match(hook, /setPage/);
  assert.doesNotMatch(hook, /data\.generated\.json/);
  assert.doesNotMatch(hook, /product_aliases/);
  assert.match(sync, /allowLegacyRemoteImport/);
  assert.match(sync, /Legacy import ke database remote diblokir/);
  assert.match(packageJson, /sync:master:local/);
  assert.match(packageJson, /sync:master:legacy:remote/);
});
