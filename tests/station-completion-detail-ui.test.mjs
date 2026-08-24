import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  stationCompletionDetailKey,
  stationCompletionDetailResponse,
  stationCompletionIncompleteRows,
  stationCompletionStatusLabel,
} from "../app/lib/station-completion-view.ts";
import { createStationCompletionDetailCache } from "../app/lib/station-completion-detail-cache.ts";

function row(status, overrides = {}) {
  return {
    site_id: `site-${status}`,
    site_name: `Site ${status}`,
    site_type_id: "type",
    site_type_name: "AWS",
    site_subtype_id: `subtype-${status}`,
    subtype_name: "AWS",
    profile_id: "profile",
    is_expected: true,
    is_warehouse: false,
    active_submission_count: status === "BELUM_DIMULAI" ? 0 : 1,
    submission_id: status === "BELUM_DIMULAI" ? null : `submission-${status}`,
    submission_version: status === "BELUM_DIMULAI" ? null : 1,
    status,
    expected_category_count: 21,
    filled_category_count: status === "TERISI_SEBAGIAN" ? 13 : 0,
    missing_categories: Array.from({ length: status === "TERISI_SEBAGIAN" ? 8 : 21 }, (_, index) => ({ id: `category-${index}`, label: `Kategori ${index + 1}` })),
    warehouse_category_count: 0,
    warehouse_unit_count: 0,
    pending_qc_count: 0,
    content_last_saved_at: null,
    issues: [],
    ...overrides,
  };
}

test("detail memprioritaskan masalah dan menyembunyikan Lengkap serta Gudang tersedia", () => {
  const rows = [
    row("LENGKAP"),
    row("TERISI_SEBAGIAN"),
    row("KOSONG"),
    row("BELUM_DIMULAI"),
    row("PERLU_PERHATIAN"),
    row("GUDANG_TERSEDIA", { is_warehouse: true }),
  ];
  assert.deepEqual(stationCompletionIncompleteRows(rows).map((item) => item.status), [
    "PERLU_PERHATIAN", "BELUM_DIMULAI", "KOSONG", "TERISI_SEBAGIAN",
  ]);
});

test("status detail memakai label Indonesia dan unknown tidak menjadi Lengkap", () => {
  assert.equal(stationCompletionStatusLabel("BELUM_DIMULAI"), "Belum Dimulai");
  assert.equal(stationCompletionStatusLabel("KOSONG"), "Kosong");
  assert.equal(stationCompletionStatusLabel("TERISI_SEBAGIAN"), "Terisi Sebagian");
  assert.equal(stationCompletionStatusLabel("LENGKAP"), "Lengkap");
  assert.equal(stationCompletionStatusLabel("PERLU_PERHATIAN"), "Perlu Perhatian");
  assert.equal(stationCompletionStatusLabel("TIDAK_DINILAI"), "Tidak Dinilai");
  assert.equal(stationCompletionStatusLabel("GUDANG_TERSEDIA"), "Gudang Tersedia");
  assert.equal(stationCompletionStatusLabel("UNKNOWN"), "Status tidak dikenal");
});

test("pair key memakai identity UUID stabil dan parser menolak response malformed", () => {
  assert.equal(stationCompletionDetailKey(row("KOSONG")), "site-KOSONG:subtype-KOSONG:submission-KOSONG");
  assert.equal(stationCompletionDetailResponse(null), null);
  assert.equal(stationCompletionDetailResponse({ station_id: "station", summary: {}, rows: "invalid" }), null);
});

test("unified detail menampilkan semua status, Gudang netral, issue, dan retry", async () => {
  const component = await readFile(new URL("../app/admin/UnifiedFillingList.tsx", import.meta.url), "utf8");
  for (const text of [
    "Pengisian",
    "Belum ada submission",
    "kategori terisi",
    "Lihat semua",
    "Sembunyikan kategori",
    "Tidak ada pengisian non-Gudang yang dinilai",
    "Coba muat ulang",
  ]) assert.match(component, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(component, /completion\.issues\.map/);
  assert.match(component, /Inventaris Gudang tersedia/);
  assert.doesNotMatch(component, /Pengisian Gudang belum tersedia\./);
  assert.match(component, /aria-expanded=\{showAllMissing\}/);
  assert.doesNotMatch(component, /WIGOS|AWS Center|Koordinat|Elevasi|Alamat|Teknisi|BMN|Serial Number|Tahun|Kondisi|Quantity/);
});

test("cache detail lazy mencegah fetch ulang dan mendukung request Station berbeda", async () => {
  const cache = createStationCompletionDetailCache();
  let calls = 0;
  const load = async (stationId) => {
    calls += 1;
    await Promise.resolve();
    return { stationId };
  };

  assert.equal(calls, 0);
  const firstA = cache.load("A", () => load("A"));
  const concurrentA = cache.load("A", () => load("A"));
  assert.equal(firstA, concurrentA);
  assert.deepEqual(await firstA, { stationId: "A" });
  assert.equal(calls, 1);
  assert.deepEqual(await cache.load("A", () => load("A")), { stationId: "A" });
  assert.equal(calls, 1);
  assert.deepEqual(await cache.load("B", () => load("B")), { stationId: "B" });
  assert.equal(calls, 2);
  cache.invalidate("A");
  await cache.load("A", () => load("A"));
  assert.equal(calls, 3);
});

test("detail RPC hanya dipanggil saat open dan cache runtime dipakai", async () => {
  const dashboard = await readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8");
  assert.equal(dashboard.match(/client\.rpc\("admin_station_completion_detail"/g)?.length, 1);
  assert.match(dashboard, /completionDetailCacheRef\.current\.load\(stationId/);
  assert.match(dashboard, /if \(open\) void loadCompletionDetail\(station\.id\)/);
  assert.match(dashboard, /completionDetails\.get\(station\.id\) \?\? null/);
  const initialEffect = dashboard.match(/useEffect\(\(\) => \{\s*if \(tab !== "stations"[\s\S]*?\}, \[fillingMode, refreshCompletionSummary, tab\]\);/)?.[0] ?? "";
  assert.doesNotMatch(initialEffect, /loadCompletionDetail|admin_station_completion_detail/);
});

test("mutation submission meneruskan station UUID untuk invalidasi detail terarah", async () => {
  const [dashboard, monitor] = await Promise.all([
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminSubmissionMonitor.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(monitor, /onChanged\(row\.station_id\)/);
  assert.match(dashboard, /invalidateCompletionDetail\(stationId\)/);
  assert.match(dashboard, /expandedStationId === stationId \? loadCompletionDetail\(stationId, true\)/);
});
