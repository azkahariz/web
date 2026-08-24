import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseQcPendingSummary } from "../app/lib/qc-pending-summary.ts";

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

test("Ringkasan QC memakai bucket server-side tanpa mengubah Monitoring Pengisian", async () => {
  const [migration, route, dashboard] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260830150000_admin_pending_product_proposal_summary.sql", import.meta.url), "utf8"),
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
  assert.match(route, /pendingSummary/);
  assert.match(dashboard, /QC Pending/);
  assert.match(dashboard, /Pengisian/);
  assert.match(dashboard, /Gudang/);
  assert.match(dashboard, /Tidak Digunakan Saat Ini/);
  assert.doesNotMatch(dashboard, /\borphan\b/i);
  assert.match(dashboard, /monitoringQcSummary\.stationCount/);
});
