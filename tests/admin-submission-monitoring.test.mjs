import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SUBMISSION_PAGE_SIZE,
  normalizeSubmissionPageSize,
  submissionItemDisplays,
  submissionPageOffset,
  summarizeSubmissionProgress,
} from "../app/lib/submission-monitoring.ts";

const expected17 = Array.from({ length: 17 }, (_, index) => `Kategori ${index + 1}`);
const product = (index) => ({ id: `product-${index}`, brand: "Vaisala", model: `Model ${index}`, quantity: 1 });

test("progress hanya menghitung kategori expected yang mempunyai barang valid", () => {
  assert.deepEqual(summarizeSubmissionProgress(expected17, {}), {
    filledCount: 0, totalCount: 17, progressPercent: 0, progressStatus: "Kosong",
  });

  const partial = Object.fromEntries(expected17.slice(0, 12).map((name, index) => [name, [product(index)]]));
  assert.deepEqual(summarizeSubmissionProgress(expected17, partial), {
    filledCount: 12, totalCount: 17, progressPercent: 71, progressStatus: "Terisi Sebagian",
  });

  const complete = Object.fromEntries(expected17.map((name, index) => [name, [product(index)]]));
  assert.deepEqual(summarizeSubmissionProgress(expected17, complete), {
    filledCount: 17, totalCount: 17, progressPercent: 100, progressStatus: "Lengkap",
  });
});

test("metadata lengkap tidak memengaruhi progress barang", () => {
  const payload = {
    inventory: {},
    siteMetadata: { wigosId: "0-360-04-36001", addressDetail: "Lengkap", latitude: "-6.2" },
  };
  assert.deepEqual(summarizeSubmissionProgress(expected17, payload.inventory), {
    filledCount: 0, totalCount: 17, progressPercent: 0, progressStatus: "Kosong",
  });
});

test("denominator mengikuti profile subtype masing-masing dan mapping kosong ditandai", () => {
  assert.equal(summarizeSubmissionProgress(expected17, {}).totalCount, 17);
  assert.equal(summarizeSubmissionProgress(expected17.slice(0, 8), {}).totalCount, 8);
  assert.deepEqual(summarizeSubmissionProgress([], {}), {
    filledCount: 0, totalCount: 0, progressPercent: 0, progressStatus: "Belum terpetakan",
  });
});

test("row kosong atau tidak valid tidak membuat kategori terisi", () => {
  const inventory = {
    "Kategori 1": [{ id: "empty", brand: "", model: "", quantity: 1 }],
    "Kategori 2": [{ id: "material", itemKind: "material", material: "", quantity: 1 }],
    "Kategori 3": [{ id: "valid-material", itemKind: "material", material: "Tiang", quantity: 1 }],
  };
  const result = summarizeSubmissionProgress(expected17, inventory);
  assert.equal(result.filledCount, 1);
});

test("pagination 50 row menghasilkan offset benar melewati 1000 submission", () => {
  assert.equal(SUBMISSION_PAGE_SIZE, 50);
  assert.equal(submissionPageOffset(1), 0);
  assert.equal(submissionPageOffset(2), 50);
  assert.equal(submissionPageOffset(21), 1000);
});

test("page size custom dibatasi 10 sampai 1000 dan offset mengikuti nilai aktif", () => {
  assert.equal(normalizeSubmissionPageSize(9), 10);
  assert.equal(normalizeSubmissionPageSize(100), 100);
  assert.equal(normalizeSubmissionPageSize(1001), 1000);
  assert.equal(normalizeSubmissionPageSize("invalid"), 50);
  assert.equal(submissionPageOffset(2, 200), 200);
});

test("detail barang menampilkan produk ganda, material, dan item kosong dari satu payload", () => {
  const rows = submissionItemDisplays({
    expected_items: [
      { name: "Sensor", filled: true },
      { name: "Mounting", filled: true },
      { name: "Radio", filled: false },
    ],
    payload: { inventory: {
      Sensor: [
        { id: "1", brand: "Vaisala", model: "HMP155", quantity: 1 },
        { id: "2", brand: "Campbell", model: "Model X", quantity: 1 },
      ],
      Mounting: [{ id: "3", itemKind: "material", material: "Tiang galvanis", quantity: 1 }],
      Radio: [],
    } },
  });
  assert.deepEqual(rows[0].entries.map((entry) => [entry.primary, entry.secondary]), [["Vaisala", "HMP155"], ["Campbell", "Model X"]]);
  assert.deepEqual(rows[1].entries, [{
    kind: "material",
    primary: "Tiang galvanis",
    unitCount: 1,
    functions: ["Mounting"],
    pendingQc: false,
  }]);
  assert.equal(rows[2].filled, false);
});

test("payload kategori legacy tetap dikenali dengan identity canonical lama", () => {
  const category = "SIstem Catu Daya Tidak Terputus";
  const inventory = { [category]: [product(1)] };
  assert.deepEqual(summarizeSubmissionProgress([category], inventory), {
    filledCount: 1, totalCount: 1, progressPercent: 100, progressStatus: "Lengkap",
  });
  assert.equal(submissionItemDisplays({ expected_items: [{ name: category, filled: true }], payload: { inventory } })[0].filled, true);
});

test("item submission menandai proposal QC pending tanpa menjadikan badge sebagai aksi", async () => {
  const detail = {
    expected_items: [{ name: "Sensor", filled: true }],
    payload: { inventory: { Sensor: [{ brand: "Vaisala", model: "HMP155", quantity: 1, productProposalId: "proposal-pending" }] } },
  };
  const rows = submissionItemDisplays(detail, new Set(["proposal-pending"]));
  assert.equal(rows[0].hasPendingQc, true);
  assert.equal(rows[0].entries[0].pendingQc, true);
  const component = await readFile(new URL("../app/admin/SubmissionProgressDetail.tsx", import.meta.url), "utf8");
  assert.match(component, /className="qc-pending-badge"/);
  assert.doesNotMatch(component.match(/className="qc-pending-badge"[\s\S]{0,160}/)?.[0] ?? "", /href|onClick/);
});

test("list ringan, lazy detail cache, sorting, page size, dan delete dijaga oleh contract", async () => {
  const [migration, extensionMigration, route, monitor, dashboard, feedback, sharedDetail] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260812120000_admin_submission_monitoring.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260813120000_admin_monitoring_sort_delete.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/submissions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminSubmissionMonitor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AppFeedback.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/SubmissionProgressDetail.tsx", import.meta.url), "utf8"),
  ]);

  const pagedProjection = migration.match(/paged as \([\s\S]*?from filtered/)?.[0] ?? "";
  assert.doesNotMatch(pagedProjection, /payload/);
  assert.match(migration, /limit v_page_size[\s\S]*offset \(v_page - 1\) \* v_page_size/);
  assert.match(migration, /concat_ws\(' ', station_name, site_name, site_type_name, subtype_name, operator_name\) ilike/);
  assert.match(migration, /progress_status = p_progress_status/);
  assert.match(migration, /SUBMISSION_ARCHIVE/);
  assert.match(migration, /SUBMISSION_RESTORE/);
  assert.match(migration, /lock_last_activity_at >= now\(\) - interval '5 minutes'[\s\S]*Submission has an active editor lock/);
  assert.match(migration, /set archived_at = null,[\s\S]*archived_by = null[\s\S]*archive_reason = null/);
  assert.match(migration, /'payload', submission\.payload/);

  assert.match(route, /admin_list_submissions/);
  assert.match(route, /admin_get_submission_detail/);
  assert.match(route, /admin_archive_submission/);
  assert.match(route, /admin_restore_submission/);
  assert.match(route, /auth\.getUser\(bearer\)/);
  assert.match(route, /Belum login[\s\S]*status: 401/);
  assert.doesNotMatch(route, /is_super_admin/);
  assert.match(route, /error\.code === "42501"[\s\S]*Akses Super Admin diperlukan[\s\S]*status: 403/);
  assert.match(route, /rpcErrorResponse\(error, "Daftar submission gagal dimuat\."\)/);
  assert.doesNotMatch(route, /SUPABASE_SECRET_KEY|createSupabaseAdminClient/);
  assert.match(monitor, /lastScheduledRequestKeyRef/);
  assert.match(monitor, /listCacheRef = useRef\(new Map<string, ListCacheValue>\(\)\)/);
  assert.match(monitor, /listCacheRef\.current\.get\(requestKey\)/);
  assert.match(monitor, /listCacheRef\.current\.set\(requestKey, cached\)/);
  assert.match(monitor, /pageSize: result\.pageSize \?\? pageSize/);
  assert.match(monitor, /listCacheRef\.current\.clear\(\)/);
  assert.match(monitor, /loadList\(\{ force: true \}\)/);
  assert.match(monitor, /const \[debouncedSearch, setDebouncedSearch\] = useState\(""\)/);
  assert.match(monitor, /window\.setTimeout\(\(\) => \{[\s\S]*setPage\(1\)[\s\S]*setDebouncedSearch\(search\)[\s\S]*\}, 250\)/);
  assert.match(monitor, /lastScheduledRequestKeyRef\.current = requestKey;[\s\S]*void loadList\(\)/);
  assert.match(monitor, /if \(!detailCache\[id\]\) await loadDetail\(id\)/);
  assert.match(monitor, /\/api\/admin\/submissions\?id=/);
  assert.match(monitor, /setDetailCache\(\{\}\)/);
  assert.match(monitor, /Memuat detail submission/);
  assert.match(monitor, /Coba lagi/);
  assert.match(sharedDetail, /Mengarsipkan\.\.\./);
  assert.doesNotMatch(monitor, /Edit sebagai Admin|Membuka mode edit/);
  assert.match(dashboard, /runAction\(/);
  assert.match(dashboard, /loadingText="Melepas lock\.\.\."/);
  assert.match(dashboard, /const \[submissionMonitorMounted, setSubmissionMonitorMounted\] = useState\(false\)/);
  assert.match(dashboard, /setSubmissionMonitorMounted\(true\)/);
  assert.match(dashboard, /<div hidden=\{tab !== "stations" \|\| fillingMode !== "submissions"\}>[\s\S]*<AdminSubmissionMonitor/);
  assert.doesNotMatch(dashboard, /!loading && tab === "stations" && fillingMode === "submissions" && <AdminSubmissionMonitor/);
  assert.match(monitor, /\[page, pageSize, debouncedSearch, stationId, siteTypeId, progress, updated, archive, sortField, sortDirection\]/);
  assert.match(monitor, /pageSize: String\(pageSize\)[\s\S]*sort: sortField[\s\S]*direction: sortDirection/);
  assert.match(monitor, /SUBMISSION_PAGE_SIZE_OPTIONS/);
  assert.match(monitor, /min=\{SUBMISSION_PAGE_SIZE_MIN\}[\s\S]*max=\{SUBMISSION_PAGE_SIZE_MAX\}/);
  assert.doesNotMatch(monitor, /setInterval|Realtime|channel\(/);
  assert.match(sharedDetail, /href=\{`\/admin\/submissions\/\$\{detail\.id\}`\} target="_blank" rel="noopener noreferrer">Buka/);
  assert.match(sharedDetail, /submissionItemDisplays\(detail, pendingProposalIds\)/);
  assert.match(monitor, /confirmationText: "HAPUS"/);
  assert.match(route, /admin_permanently_delete_submission/);
  assert.match(extensionMigration, /require_super_admin\(\)/);
  assert.match(extensionMigration, /SUBMISSION_PERMANENT_DELETE/);
  assert.match(extensionMigration, /lock_last_activity_at >= now\(\) - interval '5 minutes'/);
  assert.match(extensionMigration, /delete from public\.submissions/);
  assert.doesNotMatch(extensionMigration.match(/jsonb_build_object\([\s\S]*?\n    \)/)?.[0] ?? "", /payload/);
  for (const field of ["station", "site", "siteType", "subtype", "progress", "version", "operator", "updated"]) {
    assert.match(extensionMigration, new RegExp(`v_sort_field = '${field}'`));
  }
  assert.match(feedback, /ToastVariant = "success" \| "error" \| "info" \| "warning"/);
  assert.match(feedback, /toast-\$\{item\.variant\}/);
  assert.match(feedback, /confirmAction/);
  assert.match(feedback, /confirmationText/);
  assert.match(dashboard, /\.select\("id, station_id, site_id, site_subtype_id, version, operator_name/);
  assert.doesNotMatch(dashboard, /version, payload, operator_name/);
  assert.match(dashboard, /\.is\("archived_at", null\)/);
  assert.match(dashboard, /navigate\("stations", \{ fillingMode: "submissions" \}\)/);
  for (const status of ["PENDING", "APPROVED", "MERGED", "REJECTED"]) {
    assert.match(dashboard, new RegExp(`navigate\\("qc", \\{ qcStatus: "${status}" \\}\\)`));
  }
});
