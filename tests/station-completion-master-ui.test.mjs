import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  stationCompletionCategory,
  stationCompletionRows,
  stationCompletionStatusLabel,
} from "../app/lib/station-completion-view.ts";

function category(overrides = {}) {
  return stationCompletionCategory({
    expected_category_count: 701,
    filled_category_count: 171,
    category_progress: 24,
    warehouse_expected_count: 0,
    warehouse_existing_count: 0,
    warehouse_category_count: 0,
    warehouse_unit_count: 0,
    ...overrides,
  });
}

test("ringkasan parsial memakai angka backend tanpa menghitung ulang", () => {
  assert.deepEqual(category(), {
    label: "171 / 701 Kategori",
    progress: 24,
  });
});

test("status completion dipetakan ke label Indonesia dan unknown tetap defensif", () => {
  assert.equal(stationCompletionStatusLabel("LENGKAP"), "Lengkap");
  assert.equal(stationCompletionStatusLabel("TERISI_SEBAGIAN"), "Terisi Sebagian");
  assert.equal(stationCompletionStatusLabel("BELUM_DIMULAI"), "Belum Dimulai");
  assert.equal(stationCompletionStatusLabel("PERLU_PERHATIAN"), "Perlu Perhatian");
  assert.equal(stationCompletionStatusLabel("STATUS_BARU"), "Status tidak dikenal");
});

test("Gudang tanpa denominator kategori tidak menampilkan persentase menyesatkan", () => {
  const missing = category({
    expected_category_count: 0,
    filled_category_count: 0,
    category_progress: null,
    warehouse_expected_count: 1,
    warehouse_existing_count: 0,
  });
  assert.deepEqual(missing, { label: "Kategori: -", progress: null });

  const available = category({
    expected_category_count: 0,
    filled_category_count: 0,
    category_progress: null,
    warehouse_expected_count: 1,
    warehouse_existing_count: 1,
    warehouse_category_count: 4,
    warehouse_unit_count: 11,
  });
  assert.deepEqual(available, { label: "Gudang · 4 kategori · 11 unit", progress: null });
  assert.doesNotMatch(`${missing.label} ${available.label}`, /0%|100%|NaN|0\s*\/\s*0 Kategori/);
});

test("response null atau malformed tidak membuat UI crash", () => {
  assert.deepEqual(stationCompletionRows(null), []);
  assert.deepEqual(stationCompletionRows({}), []);
  assert.deepEqual(stationCompletionRows({ rows: "invalid" }), []);
  assert.deepEqual(stationCompletionRows({ rows: [null, { station_name: "Tanpa UUID" }] }), []);
});

test("Master Pengisian memakai satu summary batch tanpa eager detail atau metadata", async () => {
  const dashboard = await readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8");
  assert.equal(dashboard.match(/client\.rpc\("admin_station_completion_summary"\)/g)?.length, 1);
  const initialCompletionEffect = dashboard.match(/useEffect\(\(\) => \{\s*if \(tab !== "stations"[\s\S]*?\}, \[fillingMode, refreshCompletionSummary, tab\]\);/)?.[0] ?? "";
  assert.match(initialCompletionEffect, /refreshCompletionSummary/);
  assert.doesNotMatch(initialCompletionEffect, /admin_station_completion_detail|loadCompletionDetail/);
  assert.match(dashboard, /completionByStationId\.get\(station\.id\)/);
  assert.match(dashboard, /Data kelengkapan belum dapat dimuat/);
  assert.match(dashboard, /aria-label={`Progress kategori \$\{category\.progress\} persen`}/);
  assert.doesNotMatch(dashboard, /WIGOS|AWS Center|Latitude|Longitude|Metadata lengkap/);
});
