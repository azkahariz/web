import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("master Produk memakai RPC Super Admin, pagination server-side, dan guard legacy sync", async () => {
  const [migration, route, component, hook, sync, packageJson] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260815120000_super_admin_product_management.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminProducts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useProductCatalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/sync-master.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  for (const rpc of ["admin_product_summary", "admin_list_products", "admin_create_product", "admin_update_product", "admin_set_product_active"]) {
    assert.match(migration, new RegExp(`function public\\.${rpc}`));
  }
  for (const action of ["PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_ACTIVATE", "PRODUCT_DEACTIVATE"]) assert.match(migration, new RegExp(action));
  assert.match(migration, /source_origin in \('SPREADSHEET', 'QC', 'ADMIN'\)/);
  assert.match(migration, /normalize_product_text/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(route, /auth\.getUser/);
  assert.match(route, /status: 403/);
  assert.match(route, /count: "exact"/);
  assert.match(route, /pageSize >= 10 && pageSize <= 1000/);
  assert.match(route, /\.range\(\(page - 1\) \* pageSize, page \* pageSize - 1\)/);
  assert.match(component, /Cari Merk atau Tipe/);
  assert.match(component, /pageSize/);
  assert.match(component, /fetch\(`\/api\/admin\/products/);
  assert.match(component, /Masukkan merk/);
  assert.match(component, /Masukkan tipe/);
  assert.match(component, /Simpan Perubahan/);
  assert.doesNotMatch(component, /confirmLabel: "Berikutnya"/);
  for (const option of ["50", "100", "200", "400", "custom"]) assert.match(component, new RegExp(`value=\\"${option}\\"`));
  assert.doesNotMatch(hook, /data\.generated\.json/);
  assert.match(sync, /allowLegacyRemoteImport/);
  assert.match(sync, /Legacy import ke database remote diblokir/);
  assert.match(packageJson, /sync:master:local/);
  assert.match(packageJson, /sync:master:legacy:remote/);
});
