import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyStationFollowUpPreset,
  applyStationMonitoring,
  DEFAULT_STATION_MONITORING_FILTERS,
  filterStationCompletionSummaries,
  getStationFollowUpCounts,
  getStationQcSummary,
  sortStationCompletionSummaries,
} from "../app/lib/station-monitoring.ts";

function summary(name, status, progress, overrides = {}) {
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
    content_last_updated: null,
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

test("Kondisi Pengisian memakai status canonical dan boundary 49/50/99", () => {
  const rows = [0, 49, 50, 99, 100, null].map((progress) => summary(String(progress), progress === null ? "TIDAK_DINILAI" : progress === 100 ? "LENGKAP" : "TERISI_SEBAGIAN", progress));
  const values = (condition) => filterStationCompletionSummaries(rows, { condition, qc: "all" }).map((row) => row.category_progress);
  assert.deepEqual(values("not-started"), []);
  assert.deepEqual(values("lt50"), [0, 49]);
  assert.deepEqual(values("50to99"), [50, 99]);
  assert.deepEqual(values("complete"), [100]);
  assert.deepEqual(values("not-assessed"), [null]);
  assert.deepEqual(values("attention"), []);
});

test("QC filter memakai pending_qc_count dan tidak mengubah status completion", () => {
  const rows = [
    summary("No QC", "TERISI_SEBAGIAN", 40, { pending_qc_count: 0 }),
    summary("One QC", "TERISI_SEBAGIAN", 40, { pending_qc_count: 1 }),
    summary("Ten QC", "LENGKAP", 100, { pending_qc_count: 10 }),
  ];
  assert.deepEqual(filterStationCompletionSummaries(rows, { condition: "all", qc: "pending" }).map((row) => row.station_name), ["One QC", "Ten QC"]);
  assert.deepEqual(filterStationCompletionSummaries(rows, { condition: "all", qc: "none" }).map((row) => row.station_name), ["No QC"]);
  assert.equal(getStationQcSummary(rows).stationCount, 2);
  assert.equal(getStationQcSummary(rows).totalPending, 11);
  assert.equal(getStationQcSummary(rows).maxPending, 10);
});

test("priority sort transparan: status, progress parsial, lalu nama", () => {
  const rows = [
    summary("Warehouse", "TIDAK_DINILAI", null),
    summary("Complete", "LENGKAP", 100),
    summary("Partial 70", "TERISI_SEBAGIAN", 70),
    summary("Partial 10 B", "TERISI_SEBAGIAN", 10),
    summary("Partial 10 A", "TERISI_SEBAGIAN", 10),
    summary("Not Started", "BELUM_DIMULAI", 0),
    summary("Attention", "PERLU_PERHATIAN", 20),
  ];
  assert.deepEqual(sortStationCompletionSummaries(rows, "priority").map((row) => row.station_name), [
    "Attention", "Not Started", "Partial 10 A", "Partial 10 B", "Partial 70", "Complete", "Warehouse",
  ]);
  assert.equal(sortStationCompletionSummaries(rows, "progress-asc").at(-1).station_name, "Warehouse");
  assert.equal(sortStationCompletionSummaries(rows, "progress-desc").at(-1).station_name, "Warehouse");
  const qcRows = rows.map((row, index) => ({ ...row, pending_qc_count: index }));
  assert.deepEqual(sortStationCompletionSummaries(qcRows, "qc-desc").map((row) => row.station_name), [
    "Attention", "Not Started", "Partial 10 A", "Partial 10 B", "Partial 70", "Complete", "Warehouse",
  ]);
});

test("quick follow-up count, preset, dan reset memakai subset yang terlihat pada kontrol", () => {
  const rows = [
    summary("Attention", "PERLU_PERHATIAN", 20),
    summary("Not Started", "BELUM_DIMULAI", 0),
    summary("Partial low", "TERISI_SEBAGIAN", 40),
    summary("Partial high", "TERISI_SEBAGIAN", 70),
    summary("Complete", "LENGKAP", 100),
    summary("Warehouse", "TIDAK_DINILAI", null),
  ];
  assert.deepEqual(getStationFollowUpCounts(rows), { notStarted: 1, partialUnder50: 1, partial50to99: 1, complete: 1 });
  assert.deepEqual(applyStationFollowUpPreset(DEFAULT_STATION_MONITORING_FILTERS, "not-started").condition, "not-started");
  assert.deepEqual(applyStationFollowUpPreset(DEFAULT_STATION_MONITORING_FILTERS, "partial-under-50").condition, "lt50");
  assert.deepEqual(applyStationFollowUpPreset(DEFAULT_STATION_MONITORING_FILTERS, "partial-50-99").condition, "50to99");
  assert.deepEqual(applyStationFollowUpPreset(DEFAULT_STATION_MONITORING_FILTERS, "complete").condition, "complete");
});

test("search subset dan filter tersusun AND tanpa mengubah source summary", () => {
  const filters = { ...DEFAULT_STATION_MONITORING_FILTERS, condition: "lt50" };
  const source = [...statusRows];
  assert.deepEqual(applyStationMonitoring(source, filters).map((row) => row.station_name), ["Partial"]);
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
  assert.match(controls, /Kondisi Pengisian/);
  assert.match(controls, /QC Produk/);
  assert.match(controls, /Prioritas Pengisian/);
  assert.match(controls, /QC Pending Terbanyak/);
  assert.match(controls, /Terisi 50-99%/);
  assert.match(controls, /Lengkap/);
  assert.doesNotMatch(controls, /key: "attention"/);
  assert.doesNotMatch(controls, /Aktivitas|Tidak diperbarui|Paling Lama Tidak Diperbarui|Pembaruan Terbaru/);
  assert.match(controls, /onQcPending/);
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
