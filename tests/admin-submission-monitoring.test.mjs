import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SUBMISSION_PAGE_SIZE,
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

test("list ringan, lazy detail cache, search/filter, dan archive dijaga oleh contract", async () => {
  const [migration, route, monitor, dashboard] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260812120000_admin_submission_monitoring.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/submissions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminSubmissionMonitor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
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
  assert.match(monitor, /const isInitialLoad = lastScheduledRequestKeyRef\.current === null/);
  assert.match(monitor, /if \(isInitialLoad\) \{[\s\S]*void loadList\(\)/);
  assert.match(monitor, /window\.setTimeout\(\(\) => void loadList\(\), 250\)/);
  assert.match(monitor, /if \(!detailCache\[id\]\) await loadDetail\(id\)/);
  assert.match(monitor, /\/api\/admin\/submissions\?id=/);
  assert.match(monitor, /setDetailCache\(\{\}\)/);
  assert.match(monitor, /Memuat detail submission/);
  assert.match(monitor, /Coba lagi/);
  assert.match(monitor, /Mengarsipkan\.\.\./);
  assert.match(monitor, /loadingText="Membuka mode edit\.\.\."/);
  assert.match(dashboard, /runAction\(/);
  assert.match(dashboard, /loadingText="Melepas lock\.\.\."/);
  assert.match(monitor, /pageSize: 50|SUBMISSION_PAGE_SIZE/);
  assert.doesNotMatch(monitor, /setInterval|Realtime|channel\(/);
  assert.match(monitor, /href=\{`\/admin\/submissions\/\$\{row\.id\}`\}>Buka Lengkap/);
  assert.match(dashboard, /\.select\("id, station_id, site_id, site_subtype_id, version, operator_name/);
  assert.doesNotMatch(dashboard, /version, payload, operator_name/);
  assert.match(dashboard, /\.is\("archived_at", null\)/);
  assert.match(dashboard, /navigate\("stations", \{ fillingMode: "submissions" \}\)/);
  for (const status of ["PENDING", "APPROVED", "MERGED", "REJECTED"]) {
    assert.match(dashboard, new RegExp(`navigate\\("qc", \\{ qcStatus: "${status}" \\}\\)`));
  }
});
