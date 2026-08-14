import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import data from "../app/data.generated.json" with { type: "json" };
import { normalizeProductText, resolveInstalledProduct, suggestProducts } from "../app/lib/product-qc.ts";

test("normalisasi dan suggestion mengenali variasi Campbell CR1000X tanpa auto merge", () => {
  assert.equal(normalizeProductText(" CR-1000 X "), "cr1000x");
  const suggestions = suggestProducts("Campbel", "CR 1000 X", data.products);
  assert.equal(suggestions[0]?.brand, "Campbell Scientific");
  assert.equal(suggestions[0]?.model, "CR1000X");
});

test("resolusi proposal menjaga raw input dan memakai canonical hanya setelah QC", () => {
  const item = { id: "item", brand: "Campbel", model: "CR 1000 X", itemKind: "custom-product", quantity: 1, productProposalId: "proposal" };
  const pending = new Map([["proposal", { id: "proposal", proposedBrand: item.brand, proposedModel: item.model, status: "PENDING" }]]);
  assert.deepEqual(resolveInstalledProduct(item, pending), { brand: "Campbel", model: "CR 1000 X", status: "PENDING", reviewNote: undefined });
  const merged = new Map([["proposal", { ...pending.get("proposal"), status: "MERGED", resolvedBrand: "Campbell Scientific", resolvedModel: "CR1000X" }]]);
  assert.deepEqual(resolveInstalledProduct(item, merged), { brand: "Campbell Scientific", model: "CR1000X", status: "MERGED" });
  assert.equal(item.brand, "Campbel");
  assert.equal(item.model, "CR 1000 X");
});

test("migration menegakkan super admin, QC, alias, audit, dan admin lock di database", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260810170000_super_admin_product_qc.sql", import.meta.url), "utf8");
  for (const table of ["super_admins", "product_proposals", "product_aliases", "admin_audit_log"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
  }
  assert.match(sql, /create or replace function public\.is_super_admin/);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/);
  assert.match(sql, /admin_force_release_submission/);
  assert.match(sql, /admin_force_takeover_submission/);
  assert.match(sql, /QC_BULK_MERGE/);
  assert.match(sql, /spreadsheet_synced boolean not null default true/);
  assert.match(sql, /and submission\.locked_by_session_id = p_session_id/);
});

test("cleanup proposal Pending hanya berjalan setelah payload submission tersimpan", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260814120000_pending_product_proposal_cleanup.sql", import.meta.url), "utf8");
  assert.match(sql, /reconcile_pending_product_proposals/);
  assert.match(sql, /entry\.value ->> 'productProposalId'/);
  assert.match(sql, /proposal\.status = 'PENDING'/);
  assert.match(sql, /proposal\.station_id = p_station_id/);
  assert.match(sql, /proposal\.submission_id = p_submission_id/);
  assert.match(sql, /perform public\.reconcile_pending_product_proposals\(v_station_id, v_submission\.id, p_payload\)/);
  assert.match(sql, /perform public\.reconcile_pending_product_proposals\(v_submission\.station_id, v_submission\.id, p_payload\)/);
  assert.match(sql, /revoke all on function public\.reconcile_pending_product_proposals/);
});

test("admin route memvalidasi role sebelum memakai secret dan secret tidak masuk komponen client", async () => {
  const [route, serverAdmin, dashboard, inventory] = await Promise.all([
    readFile(new URL("../app/api/admin/accounts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/supabase/admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /is_super_admin/);
  assert.match(route, /status: 403/);
  assert.match(route, /createSupabaseAdminClient/);
  assert.match(serverAdmin, /SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(dashboard, /SUPABASE_SECRET_KEY|sb_secret_/);
  assert.doesNotMatch(inventory, /SUPABASE_SECRET_KEY|sb_secret_/);
});

test("station product proposal dan admin QC tetap mempertahankan format export lama", async () => {
  const [inventory, exportSource, typeSource, databaseSync] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inventory-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/types/inventory.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/master/database.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(typeSource, /productProposalId\?: string/);
  assert.match(typeSource, /itemKind\?: "product" \| "custom-product" \| "material"/);
  assert.match(inventory, /create_product_proposal/);
  assert.match(inventory, /resolveInstalledProduct/);
  assert.match(exportSource, /"Stasiun"[\s\S]*"Merk"[\s\S]*"Tipe Produk"/);
  assert.match(databaseSync, /function spreadsheetProductValues/);
  assert.match(databaseSync, /function shouldWarnForMissingProduct/);
});
