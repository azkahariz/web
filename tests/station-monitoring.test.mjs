import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyStationFollowUpPreset,
  applyStationMonitoring,
  DEFAULT_STATION_MONITORING_FILTERS,
  filterStationCompletionSummaries,
  getStationFollowUpCounts,
  isOlderThanDays,
  sortStationCompletionSummaries,
} from "../app/lib/station-monitoring.ts";

const NOW = Date.parse("2026-08-24T12:00:00.000Z");

function summary(name, status, progress, updated = null, overrides = {}) {
  return {
    station_id: `station-${name}`,
    station_name: name,
    site_count: 1,
    expected_submission_count: status === "TIDAK_DINILAI" ? 0 : 1,
    existing_submission_count: status === "BELUM_DIMULAI" ? 0 : 1,
    complete_submission_count: status === "LENGKAP" ? 1 : 0,
    partial_submission_count: status === "TERISI_SEBAGIAN" ? 1 : 0,
    empty_submission_count: 0,
    not_started_count: status === "BELUM_DIMULAI" ? 1 : 0,
    expected_attention_count: status === "PERLU_PERHATIAN" ? 1 : 0,
    unexpected_submission_count: 0,
    attention_count: status === "PERLU_PERHATIAN" ? 1 : 0,
    expected_category_count: progress === null ? 0 : 100,
    filled_category_count: progress ?? 0,
    category_progress: progress,
    warehouse_expected_count: status === "TIDAK_DINILAI" ? 1 : 0,
    warehouse_existing_count: 0,
    warehouse_category_count: 0,
    warehouse_unit_count: 0,
    pending_qc_count: 0,
    content_last_updated: updated,
    station_status: status,
    issues: [],
    ...overrides,
  };
}

const statusRows = [
  summary("Attention", "PERLU_PERHATIAN", 20),
  summary("Not Started", "BELUM_DIMULAI", 0),
  summary("Partial", "TERISI_SEBAGIAN", 45),
  summary("Complete", "LENGKAP", 100),
  summary("Warehouse", "TIDAK_DINILAI", null),
];

test("status filter memakai canonical backend status dan Belum Lengkap tidak memuat Tidak Dinilai", () => {
  const filter = (status) => filterStationCompletionSummaries(statusRows, { status, progress: "all", activity: "all" }, NOW)
    .map((row) => row.station_status);
  assert.equal(filter("all").length, 5);
  assert.deepEqual(filter("incomplete"), ["PERLU_PERHATIAN", "BELUM_DIMULAI", "TERISI_SEBAGIAN"]);
  for (const status of ["LENGKAP", "TERISI_SEBAGIAN", "BELUM_DIMULAI", "PERLU_PERHATIAN", "TIDAK_DINILAI"]) {
    assert.deepEqual(filter(status), [status]);
  }
});

test("progress filter menjaga boundary 0, 24, 25, 49, 50, 99, 100, dan null", () => {
  const rows = [0, 24, 25, 49, 50, 99, 100, null].map((progress) => summary(String(progress), progress === null ? "TIDAK_DINILAI" : "TERISI_SEBAGIAN", progress));
  const values = (progress) => filterStationCompletionSummaries(rows, { status: "all", progress, activity: "all" }, NOW).map((row) => row.category_progress);
  assert.deepEqual(values("lt25"), [0, 24]);
  assert.deepEqual(values("lt50"), [0, 24, 25, 49]);
  assert.deepEqual(values("50to99"), [50, 99]);
  assert.deepEqual(values("100"), [100]);
});

test("activity filter memakai durasi strict lebih dari 7 dan 14 hari", () => {
  const ago = (milliseconds) => new Date(NOW - milliseconds).toISOString();
  const day = 24 * 60 * 60 * 1000;
  assert.equal(isOlderThanDays(ago(7 * day), NOW, 7), false);
  assert.equal(isOlderThanDays(ago(7 * day + 1000), NOW, 7), true);
  assert.equal(isOlderThanDays(ago(14 * day), NOW, 14), false);
  assert.equal(isOlderThanDays(ago(14 * day + 1000), NOW, 14), true);

  const rows = [
    summary("Never", "BELUM_DIMULAI", 0, null),
    summary("Fresh", "TERISI_SEBAGIAN", 30, ago(6 * day + 23 * 60 * 60 * 1000)),
    summary("Exact 7", "TERISI_SEBAGIAN", 30, ago(7 * day)),
    summary("Stale 7", "TERISI_SEBAGIAN", 30, ago(7 * day + 1000)),
    summary("Exact 14", "PERLU_PERHATIAN", 30, ago(14 * day)),
    summary("Stale 14", "PERLU_PERHATIAN", 30, ago(14 * day + 1000)),
    summary("Complete", "LENGKAP", 100, ago(30 * day)),
    summary("Warehouse", "TIDAK_DINILAI", null, null),
  ];
  const activity = (value) => filterStationCompletionSummaries(rows, { status: "all", progress: "all", activity: value }, NOW).map((row) => row.station_name);
  assert.deepEqual(activity("never"), ["Never"]);
  assert.deepEqual(activity("stale7"), ["Stale 7", "Exact 14", "Stale 14"]);
  assert.deepEqual(activity("stale14"), ["Stale 14"]);
});

test("priority sort transparan: status, progress parsial, activity, lalu nama", () => {
  const day = 24 * 60 * 60 * 1000;
  const rows = [
    summary("Warehouse", "TIDAK_DINILAI", null),
    summary("Complete", "LENGKAP", 100),
    summary("Partial 70", "TERISI_SEBAGIAN", 70),
    summary("Partial 10 B", "TERISI_SEBAGIAN", 10, new Date(NOW - day).toISOString()),
    summary("Partial 10 A", "TERISI_SEBAGIAN", 10, null),
    summary("Not Started", "BELUM_DIMULAI", 0),
    summary("Attention", "PERLU_PERHATIAN", 20),
  ];
  assert.deepEqual(sortStationCompletionSummaries(rows, "priority").map((row) => row.station_name), [
    "Attention", "Not Started", "Partial 10 A", "Partial 10 B", "Partial 70", "Complete", "Warehouse",
  ]);
  assert.equal(sortStationCompletionSummaries(rows, "progress-asc").at(-1).station_name, "Warehouse");
  assert.equal(sortStationCompletionSummaries(rows, "progress-desc").at(-1).station_name, "Warehouse");
  assert.equal(sortStationCompletionSummaries(rows, "oldest").at(-1).station_name, "Warehouse");
  assert.equal(sortStationCompletionSummaries(rows, "newest").at(-1).station_name, "Warehouse");
});

test("quick follow-up count dan preset memakai subset yang terlihat pada kontrol", () => {
  const stale = new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString();
  const rows = [
    summary("Attention", "PERLU_PERHATIAN", 20, stale),
    summary("Not Started", "BELUM_DIMULAI", 0),
    summary("Partial low", "TERISI_SEBAGIAN", 40, stale),
    summary("Partial high", "TERISI_SEBAGIAN", 70, stale),
    summary("Complete", "LENGKAP", 100, stale),
    summary("Warehouse", "TIDAK_DINILAI", null),
  ];
  assert.deepEqual(getStationFollowUpCounts(rows, NOW), { attention: 1, notStarted: 1, partialUnder50: 1, stale7: 3 });
  assert.deepEqual(applyStationFollowUpPreset(DEFAULT_STATION_MONITORING_FILTERS, "not-started").status, "BELUM_DIMULAI");
  assert.deepEqual(applyStationFollowUpPreset(DEFAULT_STATION_MONITORING_FILTERS, "partial-under-50"), {
    ...DEFAULT_STATION_MONITORING_FILTERS, status: "TERISI_SEBAGIAN", progress: "lt50",
  });
  assert.deepEqual(applyStationFollowUpPreset(DEFAULT_STATION_MONITORING_FILTERS, "stale-7"), {
    ...DEFAULT_STATION_MONITORING_FILTERS, status: "incomplete", activity: "stale7",
  });
});

test("search subset dan filter tersusun AND tanpa mengubah source summary", () => {
  const filters = { ...DEFAULT_STATION_MONITORING_FILTERS, status: "TERISI_SEBAGIAN", progress: "lt50" };
  const source = [...statusRows];
  assert.deepEqual(applyStationMonitoring(source, filters, NOW).map((row) => row.station_name), ["Partial"]);
  assert.deepEqual(source, statusRows);
});

test("UI monitoring hanya hidup di Per Stasiun dan perubahan kontrol tidak memanggil RPC", async () => {
  const [dashboard, controls, unified] = await Promise.all([
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/StationMonitoringControls.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/UnifiedFillingList.tsx", import.meta.url), "utf8"),
  ]);
  assert.equal(dashboard.match(/client\.rpc\("admin_station_completion_summary"\)/g)?.length, 1);
  assert.match(dashboard, /fillingMode === "master" && <StationMonitoringControls/);
  assert.match(dashboard, /applyStationMonitoring\([\s\S]*completionRows/);
  assert.match(dashboard, /setStationMonitoringFilters/);
  assert.doesNotMatch(controls, /rpc\(|fetch\(|getSupabaseBrowserClient/);
  assert.match(controls, /Menampilkan <strong>\{visibleCount\}<\/strong> dari <strong>\{totalCount\}/);
  assert.match(controls, /Reset filter/);
  assert.match(controls, /disabled=\{count === 0\}/);
  assert.match(dashboard, /stationActivityLabel\(completion\)/);
  assert.match(unified, /composeUnifiedFillingRows/);
  assert.doesNotMatch(dashboard, /Yang belum dilengkapi|station-filling-table/);
});

test("refresh summary tidak mengubah state filter dan detail tetap lazy", async () => {
  const dashboard = await readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8");
  const refreshSummary = dashboard.match(/const refreshCompletionSummary = useCallback[\s\S]*?\n  \}, \[\]\);/)?.[0] ?? "";
  assert.doesNotMatch(refreshSummary, /setStationMonitoringFilters/);
  assert.match(dashboard, /if \(open\) void loadCompletionDetail\(station\.id\)/);
  assert.doesNotMatch(dashboard.match(/onQuickAction=\{[\s\S]*?\}/)?.[0] ?? "", /loadCompletionDetail|refreshCompletionSummary/);
});
