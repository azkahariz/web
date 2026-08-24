import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { composeUnifiedFillingRows, fillingPairKey } from "../app/lib/unified-filling.ts";
import { WAREHOUSE_SITE_TYPE_ID } from "../app/lib/warehouse.ts";

function masterRow(index, overrides = {}) {
  const site = overrides.site ?? { id: `site-${index}`, name: `Site ${index}` };
  const subtype = overrides.subtype === null ? null : overrides.subtype ?? { id: `subtype-${index}`, name: `Subtipe ${index}` };
  return {
    site,
    siteType: overrides.siteType ?? { id: `type-${index}`, name: "AWS" },
    subtype,
    submission: overrides.submission ?? null,
  };
}

function completion(index, status, overrides = {}) {
  return {
    site_id: `site-${index}`,
    site_name: `Site ${index}`,
    site_type_id: `type-${index}`,
    site_type_name: "AWS",
    site_subtype_id: `subtype-${index}`,
    subtype_name: `Subtipe ${index}`,
    profile_id: `profile-${index}`,
    is_expected: true,
    is_warehouse: false,
    active_submission_count: status === "BELUM_DIMULAI" ? 0 : 1,
    submission_id: status === "BELUM_DIMULAI" ? null : `submission-${index}`,
    submission_version: status === "BELUM_DIMULAI" ? null : 2,
    status,
    expected_category_count: 10,
    filled_category_count: status === "LENGKAP" ? 10 : status === "TERISI_SEBAGIAN" ? 4 : 0,
    missing_categories: status === "LENGKAP" ? [] : Array.from({ length: 6 }, (_, category) => ({ id: `category-${index}-${category}`, label: `Kategori ${category + 1}` })),
    warehouse_category_count: 0,
    warehouse_unit_count: 0,
    pending_qc_count: 0,
    content_last_saved_at: null,
    issues: [],
    ...overrides,
  };
}

test("unified view menampilkan missing, kosong, parsial, dan lengkap tepat satu kali", () => {
  const masterRows = [1, 2, 3, 4].map((index) => masterRow(index));
  const detailRows = [
    completion(1, "BELUM_DIMULAI"),
    completion(2, "KOSONG"),
    completion(3, "TERISI_SEBAGIAN"),
    completion(4, "LENGKAP"),
    completion(3, "TERISI_SEBAGIAN", { is_expected: false }),
  ];
  const rows = composeUnifiedFillingRows(masterRows, detailRows);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.completion?.status), ["BELUM_DIMULAI", "KOSONG", "TERISI_SEBAGIAN", "LENGKAP"]);
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
  assert.equal(fillingPairKey("site-3", "subtype-3"), "site-3:subtype-3");
});

test("Gudang tetap satu row informasional dan diurutkan terakhir", () => {
  const warehouse = masterRow("warehouse", {
    site: { id: "site-warehouse", name: "Gudang Balai" },
    siteType: { id: WAREHOUSE_SITE_TYPE_ID, name: "Gudang" },
    subtype: { id: "subtype-warehouse", name: "Gudang" },
    submission: { id: "submission-warehouse", site_id: "site-warehouse", site_subtype_id: "subtype-warehouse" },
  });
  const rows = composeUnifiedFillingRows([warehouse, masterRow(1)], [completion(1, "LENGKAP")]);
  assert.equal(rows.length, 2);
  assert.equal(rows.at(-1).isWarehouse, true);
  assert.equal(rows.at(-1).completion, null);
});

test("legacy unexpected pair tetap muncul sekali sebagai attention row", () => {
  const unexpected = completion("legacy", "PERLU_PERHATIAN", {
    is_expected: false,
    submission_id: "submission-legacy",
  });
  const rows = composeUnifiedFillingRows([masterRow(1)], [completion(1, "LENGKAP"), unexpected]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.key === "site-legacy:subtype-legacy")?.completion?.is_expected, false);
});

test("UI memakai satu daftar Pengisian dan shared detail renderer tanpa view duplikat", async () => {
  const [dashboard, unified, monitor, shared] = await Promise.all([
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/UnifiedFillingList.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminSubmissionMonitor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/SubmissionProgressDetail.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, />Per Stasiun</);
  assert.match(dashboard, />Semua Pengisian</);
  assert.match(dashboard, /<UnifiedFillingList/);
  assert.doesNotMatch(dashboard, /Yang belum dilengkapi|station-filling-table/);
  assert.match(unified, /<h3>Pengisian<\/h3>/);
  assert.match(unified, /Belum ada submission/);
  assert.match(unified, /Lihat semua \$\{missingCategories\.length\} kategori/);
  assert.match(unified, /Inventaris Gudang tersedia/);
  assert.match(unified, /Tidak ada pengisian non-Gudang yang dinilai/);
  assert.match(unified, /<SubmissionProgressDetail/);
  assert.match(monitor, /<SubmissionProgressDetail/);
  assert.match(shared, /Progress Barang/);
  assert.match(shared, /Hapus Permanen/);
});

test("detail submission tetap lazy, cacheable, retryable, dan tidak dipreload", async () => {
  const dashboard = await readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8");
  const unified = await readFile(new URL("../app/admin/UnifiedFillingList.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /unifiedSubmissionDetailCacheRef\.current\.get\(submissionId\)/);
  assert.match(dashboard, /unifiedSubmissionDetailRequestsRef\.current\.get\(submissionId\)/);
  assert.match(dashboard, /\/api\/admin\/submissions\?id=/);
  assert.match(unified, /if \(!submissionDetails\[submissionId\]\) await onLoadSubmissionDetail\(submissionId\)/);
  assert.match(unified, /onLoadSubmissionDetail\(submissionId, true\)/);
  assert.doesNotMatch(dashboard.match(/const refresh = useCallback[\s\S]*?\}, \[\]\);/)?.[0] ?? "", /payload|expected_items/);
});

test("row tanpa submission tidak mendapat action destructive", async () => {
  const unified = await readFile(new URL("../app/admin/UnifiedFillingList.tsx", import.meta.url), "utf8");
  assert.match(unified, /expanded && submissionId[\s\S]*<SubmissionProgressDetail/);
  assert.doesNotMatch(unified.match(/<div className="unified-filling-actions">[\s\S]*?<\/div>/)?.[0] ?? "", /Arsipkan|Hapus Permanen/);
});
