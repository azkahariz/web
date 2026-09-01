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
  stationIdsForScope,
  STATION_CATEGORIES,
  sortStationCompletionSummaries,
} from "../app/lib/station-monitoring.ts";
import { parseSiteTypeCompletionRows, summarizeSiteTypeProgress, summarizeStationMonitoring, summarizeQc, warehouseSubmissionProgressPercent } from "../app/lib/admin-summary.ts";
import { parseStationCompletionRows } from "../app/lib/station-completion-view.ts";

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
  assert.deepEqual(applyStationFollowUpPreset({ ...DEFAULT_STATION_MONITORING_FILTERS, stationCategoryId: "meteorologi", siteTypeId: "awos" }, "complete"), {
    ...DEFAULT_STATION_MONITORING_FILTERS,
    stationCategoryId: "meteorologi",
    siteTypeId: "awos",
    condition: "complete",
  });
});

test("search subset dan filter tersusun AND tanpa mengubah source summary", () => {
  const filters = { ...DEFAULT_STATION_MONITORING_FILTERS, condition: "lt50" };
  const source = [...statusRows];
  assert.deepEqual(applyStationMonitoring(source, filters).map((row) => row.station_name), ["Partial"]);
  assert.deepEqual(source, statusRows);
});

test("scope hierarkis memakai UUID kategori stasiun dan Tipe Site sebagai filter AND", () => {
  assert.deepEqual(STATION_CATEGORIES.map((category) => category.code), ["METEOROLOGI", "KLIMATOLOGI", "GEOFISIKA", "BALAI", "PUSAT"]);
  const stations = [
    { id: "meteorologi", station_category_id: STATION_CATEGORIES[0].id },
    { id: "klimatologi", station_category_id: STATION_CATEGORIES[1].id },
    { id: "unmapped", station_category_id: null },
  ];
  const sites = [
    { station_id: "meteorologi", site_type_id: "awos-iii" },
    { station_id: "meteorologi", site_type_id: "aws" },
    { station_id: "klimatologi", site_type_id: "arg" },
  ];
  assert.deepEqual([...stationIdsForScope(stations, sites, { stationCategoryId: STATION_CATEGORIES[0].id, siteTypeId: "awos-iii" })], ["meteorologi"]);
  assert.deepEqual([...stationIdsForScope(stations, sites, { stationCategoryId: "all", siteTypeId: "arg" })], ["klimatologi"]);
  assert.deepEqual([...stationIdsForScope(stations, sites, { stationCategoryId: "all", siteTypeId: "unknown" })], []);
});

test("ringkasan monitoring memakai status canonical dan progress global berbobot", () => {
  const rows = [
    summary("49", "TERISI_SEBAGIAN", 49, { expected_category_count: 100, filled_category_count: 49 }),
    summary("50", "TERISI_SEBAGIAN", 50, { expected_category_count: 3, filled_category_count: 2 }),
    summary("99", "TERISI_SEBAGIAN", 99, { expected_category_count: 100, filled_category_count: 99 }),
    summary("Complete", "LENGKAP", 100, { expected_category_count: 1, filled_category_count: 1 }),
    summary("Warehouse", "TIDAK_DINILAI", null, { expected_category_count: 0, filled_category_count: 0 }),
    summary("Attention", "PERLU_PERHATIAN", 20, { expected_category_count: 10, filled_category_count: 2 }),
  ];
  assert.deepEqual(summarizeStationMonitoring(rows), {
    notStarted: 0,
    partialUnder50: 1,
    partial50to99: 2,
    complete: 1,
    notAssessed: 1,
    attention: 1,
    total: 6,
    expectedCategoryCount: 214,
    filledCategoryCount: 153,
    globalProgress: 71,
  });
});

test("QC summary memilih station terbanyak dan site type Gudang netral", () => {
  assert.deepEqual(summarizeQc([
    { station_name: "B", pending_qc_count: 2 },
    { station_name: "A", pending_qc_count: 2 },
    { station_name: "C", pending_qc_count: 0 },
  ]), { stationCount: 2, totalPending: 4, topStation: { name: "A", count: 2 } });
  const [warehouse] = summarizeSiteTypeProgress([{
    site_type_id: "warehouse",
    site_type_name: "Gudang",
    site_count: 1,
    expected_category_count: 0,
    filled_category_count: 0,
    category_progress: 0,
    is_warehouse: true,
    warehouse_station_count: 10,
    warehouse_submitted_station_count: 6,
    warehouse_progress_percent: 60,
  }]);
  assert.equal(warehouse.category_progress, null);
  assert.equal(warehouse.warehouse_progress_percent, 60);
});

test("progress Submission Gudang memakai distinct Station dan pembulatan kartu", () => {
  assert.equal(warehouseSubmissionProgressPercent(0, 10), 0);
  assert.equal(warehouseSubmissionProgressPercent(6, 10), 60);
  assert.equal(warehouseSubmissionProgressPercent(10, 10), 100);
  assert.equal(warehouseSubmissionProgressPercent(5, 8), 63);
  assert.equal(warehouseSubmissionProgressPercent(0, 0), null);
  assert.equal(warehouseSubmissionProgressPercent(null, 10), null);
});

test("metric Gudang tidak mengubah completion Station atau progress global", () => {
  const completionRows = [
    summary("Partial", "TERISI_SEBAGIAN", 50, { expected_category_count: 10, filled_category_count: 5 }),
    summary("Complete", "LENGKAP", 100, { expected_category_count: 10, filled_category_count: 10 }),
  ];
  const before = summarizeStationMonitoring(completionRows);
  summarizeSiteTypeProgress([{
    site_type_id: "warehouse",
    site_type_name: "Gudang",
    site_count: 10,
    expected_category_count: 0,
    filled_category_count: 0,
    category_progress: null,
    is_warehouse: true,
    warehouse_station_count: 10,
    warehouse_submitted_station_count: 6,
    warehouse_progress_percent: 60,
  }]);
  assert.deepEqual(summarizeStationMonitoring(completionRows), before);
  assert.deepEqual(before, {
    notStarted: 0,
    partialUnder50: 0,
    partial50to99: 1,
    complete: 1,
    notAssessed: 0,
    attention: 0,
    total: 2,
    expectedCategoryCount: 20,
    filledCategoryCount: 15,
    globalProgress: 75,
  });
});

test("parser menerima bentuk JSONB rows aktual dan menolak respons malformed", () => {
  const stationResponse = { rows: [summary("Station A", "TERISI_SEBAGIAN", 40)] };
  const siteTypeResponse = { rows: [{
    site_type_id: "type-a",
    site_type_name: "AWS",
    site_count: 2,
    expected_category_count: 4,
    filled_category_count: 2,
    category_progress: 50,
    is_warehouse: false,
  }] };
  assert.equal(parseStationCompletionRows(stationResponse)?.length, 1);
  assert.equal(parseSiteTypeCompletionRows(siteTypeResponse)?.[0].category_progress, 50);
  assert.equal(parseStationCompletionRows({ rows: [{ invalid: true }] }), null);
  assert.equal(parseSiteTypeCompletionRows({ rows: [{ ...siteTypeResponse.rows[0], site_count: "2" }] }), null);
});

test("RPC site type memakai agregasi bulk, UUID, dan tidak mengembalikan payload", async () => {
  const [migration, repair] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260830120000_admin_site_type_completion_summary.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260830140000_fix_admin_site_type_completion_summary.sql", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /admin_site_type_completion_summary/);
  assert.match(migration, /station_completion_rows\(null\)/);
  assert.match(migration, /count\(distinct id\)/);
  assert.match(migration, /require_super_admin/);
  assert.match(migration, /revoke all on function public\.admin_site_type_completion_summary\(\) from public, anon/);
  assert.doesNotMatch(migration.split("comment on function")[0], /payload/);
  assert.match(repair, /left join category_counts on category_counts\.site_type_id = site_counts\.site_type_id/);
  assert.match(repair, /perform public\.require_super_admin\(\)/);
  assert.match(repair, /grant execute on function public\.admin_site_type_completion_summary\(\) to authenticated/);
});

test("station category master memiliki lima identity tetap dan mapping UUID eksplisit", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260830130000_station_categories.sql", import.meta.url), "utf8");
  for (const code of ["METEOROLOGI", "KLIMATOLOGI", "GEOFISIKA", "BALAI", "PUSAT"]) {
    assert.equal(migration.match(new RegExp(`'${code}'`, "g"))?.length, 1);
  }
  assert.equal(migration.match(/insert into public\.station_categories \(id, code, name\)/)?.length, 1);
  assert.equal(migration.match(/station_category_id uuid references public\.station_categories\(id\)/)?.length, 1);
  const mapping = migration.match(/with mapping\(station_id, station_category_id\)[\s\S]*?\r?\n\)\r?\nupdate public\.stations/)?.[0] ?? "";
  assert.equal(mapping.match(/'[0-9a-f-]{36}'::uuid/g)?.length, 197);
  assert.match(mapping, /2d251d56-f6e0-41db-b312-03b2a14da2e7/);
  assert.match(mapping, /33ec8aed-24cb-46c7-8e7c-1600276dce60/);
  assert.doesNotMatch(mapping, /station\.name|ilike|case\s+when/i);
  assert.doesNotMatch(migration, /alter table public\.stations[\s\S]*station_category_id[^;]*not null/i);
});

test("UI monitoring hanya hidup di Per Stasiun dan perubahan kontrol tidak memanggil RPC", async () => {
  const [dashboard, controls, unified] = await Promise.all([
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/StationMonitoringControls.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/UnifiedFillingList.tsx", import.meta.url), "utf8"),
  ]);
  assert.equal(dashboard.match(/client\.rpc\("admin_completion_monitoring_summary"\)/g)?.length, 1);
  assert.doesNotMatch(dashboard, /client\.rpc\("admin_station_completion_summary"\)/);
  assert.doesNotMatch(dashboard, /client\.rpc\("admin_site_type_completion_summary"\)/);
  assert.match(dashboard, /fillingMode === "master" && <StationMonitoringControls/);
  assert.match(dashboard, /applyStationMonitoring\([\s\S]*completionRows/);
  assert.match(dashboard, /changeMonitoringFilters/);
  assert.doesNotMatch(controls, /rpc\(|fetch\(|getSupabaseBrowserClient/);
  assert.match(controls, /Kondisi Pengisian/);
  assert.match(controls, /Jenis Stasiun/);
  assert.match(controls, /Tipe Site/);
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
  assert.match(dashboard, /qcContext/);
  assert.match(dashboard, /stationCategoryId/);
  assert.match(dashboard, /navigate\("qc", \{ qcStatus: "PENDING", qcContext: "pengisian" \}\)/);
  assert.match(unified, /composeUnifiedFillingRows/);
  assert.doesNotMatch(dashboard, /Yang belum dilengkapi|station-filling-table/);
});

test("refresh summary tidak mengubah state filter dan detail tetap lazy", async () => {
  const dashboard = await readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8");
  const refreshSummary = dashboard.match(/const refreshCompletionSummary = useCallback[\s\S]*?\n  \}, \[\]\);/)?.[0] ?? "";
  assert.doesNotMatch(refreshSummary, /setStationMonitoringFilters/);
  assert.match(dashboard, /if \(open\) void loadCompletionDetail\(station\.id\)/);
  assert.doesNotMatch(dashboard.match(/onQuickAction=\{[\s\S]*?\}/)?.[0] ?? "", /loadCompletionDetail|refreshCompletionSummary/);
  assert.match(dashboard, /const \[completionLoaded, setCompletionLoaded\] = useState\(false\)/);
  assert.match(dashboard, /const \[siteTypeCompletionLoaded, setSiteTypeCompletionLoaded\] = useState\(false\)/);
  assert.match(dashboard, /completionError && <div className="station-completion-error"/);
  assert.match(dashboard, /siteTypeCompletionError && <div className="station-completion-error"/);
  assert.match(dashboard, /Coba muat ulang/);
  assert.match(dashboard, /refreshStationCompletionSummary\(true\)/);
  assert.match(dashboard, /refreshSiteTypeCompletionSummary\(true\)/);
  assert.match(dashboard, /client\.rpc\("admin_completion_monitoring_summary"\)/);
});

test("RPC monitoring gabungan memakai satu detail materialized dan mempertahankan RPC legacy", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260903120000_optimize_station_completion.sql", import.meta.url), "utf8");
  const combined = migration.match(/create or replace function public\.admin_completion_monitoring_summary[\s\S]*?comment on function public\.admin_completion_monitoring_summary/)?.[0] ?? "";
  assert.equal(combined.match(/station_completion_rows\(null\)/g)?.length, 1);
  assert.match(combined, /detail as materialized/);
  assert.match(combined, /'station_summary'/);
  assert.match(combined, /'site_type_summary'/);
  assert.match(combined, /perform public\.require_super_admin\(\)/);
  assert.match(migration, /grant execute on function public\.admin_completion_monitoring_summary\(\) to authenticated/);
  assert.doesNotMatch(combined, /\b(insert|update|delete)\b/i);
  assert.doesNotMatch(migration, /drop function public\.admin_(station|site_type)_completion_summary/);
});

test("RPC Gudang menghitung current Submission per distinct Station tanpa payload traversal", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260905120000_gudang_submission_progress.sql", import.meta.url), "utf8");
  const functions = migration.split("comment on function")[0];
  assert.match(migration, /count\(distinct site\.station_id\)::integer as warehouse_station_count/);
  assert.match(migration, /count\(distinct submission\.station_id\) filter \(where submission\.id is not null\)::integer as warehouse_submitted_station_count/);
  assert.match(migration, /submission\.archived_at is null/);
  assert.match(migration, /station_completion_is_warehouse_site_type\(site\.site_type_id\)/);
  assert.match(migration, /warehouse_submitted_station_count \* 100\.0 \/ warehouse_counts\.warehouse_station_count/);
  assert.doesNotMatch(functions, /submission_inventory_facts|payload\s*->|jsonb_array_elements/);
  assert.doesNotMatch(functions, /\b(insert|update|delete)\b/i);
  assert.match(migration, /create or replace function public\.admin_site_type_completion_summary\(\)/);
  assert.match(migration, /create or replace function public\.admin_completion_monitoring_summary\(\)/);
});

test("completion rows memperluas inventory sekali per Submission dan memakai hasil pre-aggregation", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260903120000_optimize_station_completion.sql", import.meta.url), "utf8");
  const rows = migration.match(/create or replace function public\.station_completion_rows[\s\S]*?comment on function public\.station_completion_rows/)?.[0] ?? "";
  assert.equal(rows.match(/submission_inventory_facts\(submission\.payload\)/g)?.length, 1);
  assert.match(rows, /inventory_facts as materialized/);
  assert.match(rows, /inventory_summary as materialized/);
  assert.match(rows, /array_agg\(distinct fact\.category_label\)/);
  assert.match(rows, /left join inventory_summary/);
  assert.doesNotMatch(rows, /submission_category_coverage/);
});
