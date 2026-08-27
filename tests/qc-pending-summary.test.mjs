import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseQcPendingSummary } from "../app/lib/qc-pending-summary.ts";
import { parseQcProposalStatusSummary } from "../app/lib/qc-proposal-status-summary.ts";

test("QC Pending summary menerima breakdown yang saling eksklusif dan reconcile", () => {
  assert.deepEqual(parseQcPendingSummary({
    total_pending: 12,
    pending_pengisian: 7,
    pending_gudang: 3,
    pending_tidak_digunakan: 2,
  }), {
    totalPending: 12,
    pendingPengisian: 7,
    pendingGudang: 3,
    pendingTidakDigunakan: 2,
  });
  assert.equal(parseQcPendingSummary({
    total_pending: 12,
    pending_pengisian: 7,
    pending_gudang: 3,
    pending_tidak_digunakan: 1,
  }), null);
});

test("ringkasan status QC database-wide tidak bergantung pada page list lebih dari 1000 row", () => {
  const summary = parseQcProposalStatusSummary({
    total: 1187,
    pending: 167,
    approved: 351,
    merged: 499,
    rejected: 170,
    other: 0,
  });
  assert.deepEqual(summary, { PENDING: 167, APPROVED: 351, MERGED: 499, REJECTED: 170, other: 0, total: 1187 });
  assert.equal(summary?.total, 1187);
  assert.equal(parseQcProposalStatusSummary({ total: 1187, pending: 167, approved: 351, merged: 499, rejected: 169, other: 0 }), null);
});

test("Ringkasan QC memakai aggregate terpisah dan list berhalaman tanpa mengubah Monitoring Pengisian", async () => {
  const [migration, statusMigration, listMigration, route, dashboard] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260830150000_admin_pending_product_proposal_summary.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260902120000_admin_product_proposal_status_summary.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260902130000_admin_list_product_proposals.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/product-proposals/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /admin_pending_product_proposal_summary/);
  assert.match(migration, /PENGISIAN/);
  assert.match(migration, /GUDANG/);
  assert.match(migration, /TIDAK_DIGUNAKAN_SAAT_INI/);
  assert.match(migration, /submission_inventory_facts/);
  assert.match(migration, /station_completion_rows\(null\)/);
  assert.match(route, /admin_pending_product_proposal_summary/);
  assert.match(statusMigration, /admin_product_proposal_status_summary/);
  assert.match(statusMigration, /count\(\*\) filter \(where proposal\.status = 'PENDING'\)/);
  assert.match(listMigration, /row_number\(\) over/);
  assert.match(listMigration, /v_page_size/);
  assert.match(listMigration, /where proposal\.status = p_status/);
  assert.match(listMigration, /submission_inventory_facts/);
  assert.match(route, /statusSummary/);
  assert.match(route, /listError/);
  assert.match(route, /pendingSummaryError/);
  assert.match(route, /statusSummaryError/);
  assert.match(route, /admin_list_product_proposals/);
  assert.match(dashboard, /qcStatusSummary/);
  assert.doesNotMatch(dashboard, /qcStatusSummary\?\.PENDING \?\? qcPendingSummary/);
  assert.doesNotMatch(dashboard, /qcStatusSummary\?\.\[status\] \?\? proposals\.filter/);
  assert.match(dashboard, /setPendingProposalIds\(new Set/);
  assert.match(dashboard, /Promise\.all\(\[refreshQcProposals\(\), refreshPendingProposalIds\(\)\]\)/);
  assert.match(route, /pendingSummary/);
  assert.match(dashboard, /QC Pending/);
  assert.match(dashboard, /Pengisian/);
  assert.match(dashboard, /Gudang/);
  assert.match(dashboard, /Tidak Digunakan Saat Ini/);
  assert.doesNotMatch(dashboard, /\borphan\b/i);
  assert.match(dashboard, /monitoringQcSummary\.stationCount/);
});
