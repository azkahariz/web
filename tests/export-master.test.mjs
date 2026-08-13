import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EXPORT_DEFINITIONS,
  combinedRows,
  csv,
  parseArgs,
  resolveDatabaseTarget,
  validateMaster,
} from "../scripts/export-master-csv.mjs";

const ids = {
  station: "11111111-1111-4111-8111-111111111111",
  site: "22222222-2222-4222-8222-222222222222",
  siteType: "33333333-3333-4333-8333-333333333333",
  subtypeA: "44444444-4444-4444-8444-444444444444",
  subtypeB: "55555555-5555-4555-8555-555555555555",
  profile: "66666666-6666-4666-8666-666666666666",
  item: "77777777-7777-4777-8777-777777777777",
  mapping: "88888888-8888-4888-8888-888888888888",
  category: "99999999-9999-4999-8999-999999999999",
  product: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

function fixture() {
  return {
    stations: [{ station_id: ids.station, "Nama Stasiun": "Stasiun, \"Pusat\"", station_active: true }],
    sites: [{ site_id: ids.site, "Nama Site": "Site A", station_id: ids.station, "Nama Stasiun": "Stasiun, \"Pusat\"", site_type_id: ids.siteType, "Tipe Site": "AWOS Kategori III", site_active: true, station_active: true, site_type_active: true }],
    siteTypes: [{ site_type_id: ids.siteType, "Tipe Site": "AWOS Kategori III", active: true }],
    siteSubtypes: [
      { site_subtype_id: ids.subtypeA, "Sub Tipe Site": "AWOS Kategori III Vaisala TDZ", site_type_id: ids.siteType, "Tipe Site": "AWOS Kategori III", item_profile_id: ids.profile, "Profil Barang": "AWOS TDZ", site_subtype_active: true, site_type_active: true, item_profile_active: true },
      { site_subtype_id: ids.subtypeB, "Sub Tipe Site": "AWOS Kategori III Vaisala Mid", site_type_id: ids.siteType, "Tipe Site": "AWOS Kategori III", item_profile_id: ids.profile, "Profil Barang": "AWOS Mid", site_subtype_active: true, site_type_active: true, item_profile_active: true },
    ],
    itemProfiles: [{ item_profile_id: ids.profile, "Profil Barang": "AWOS TDZ", active: true }],
    items: [{ item_id: ids.item, "Barang Terpasang": "Sensor", active: true }],
    profileItems: [{ profile_item_id: ids.mapping, item_profile_id: ids.profile, "Jenis": "AWOS TDZ", "Profil Barang": "AWOS TDZ", item_id: ids.item, "Barang Terpasang": "Sensor", mapping_active: true, item_profile_active: true, item_active: true }],
    productCategories: [{ product_category_id: ids.category, product_categories: "Sensor", active: true }],
    products: [{ product_id: ids.product, "Merk": "Brand", "Tipe": "Type", active: true, source_origin: "SPREADSHEET", spreadsheet_synced: true }],
  };
}

test("export master hanya membaca tabel master dan memakai ordering deterministik", async () => {
  const source = await readFile(new URL("../scripts/export-master-csv.mjs", import.meta.url), "utf8");
  assert.match(source, /set transaction read only/);
  assert.match(source, /order by lower\(name\), id/);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert)\b/i);
  for (const table of ["stations", "sites", "site_types", "site_subtypes", "item_profiles", "items", "profile_items", "product_categories", "products"]) {
    assert.match(source, new RegExp(`public\\.${table}`));
  }
  for (const operationalTable of ["submissions", "locks", "audit_logs", "product_proposals"]) {
    assert.doesNotMatch(source, new RegExp(`public\\.${operationalTable}`));
  }
});

test("CSV meng-escape koma, quote, newline, dan menyertakan header UTF-8", () => {
  const result = csv([{ value: "a,b\"c\nx" }], ["value"]);
  assert.ok(result.startsWith("\uFEFFvalue\r\n"));
  assert.match(result, /"a,b""c\nx"/);
});

test("validasi UUID/FK dan gabungan mempertahankan Site AWOS parent", () => {
  const data = fixture();
  assert.doesNotThrow(() => validateMaster(data));
  const rows = combinedRows(data);
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.site_id)).size, 1);
  assert.ok(rows.every((row) => row["Tipe Site"] === "AWOS Kategori III"));
  assert.ok(rows.every((row) => row.site_id === ids.site && row.station_id === ids.station));
});

test("site Gudang tanpa subtype tetap masuk export gabungan", () => {
  const data = fixture();
  const warehouseType = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  data.sites.push({ ...data.sites[0], site_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Nama Site": "Gudang Site", site_type_id: warehouseType, "Tipe Site": "Gudang" });
  data.siteTypes.push({ site_type_id: warehouseType, "Tipe Site": "Gudang", active: true });
  const row = combinedRows(data).find((item) => item["Nama Site"] === "Gudang Site");
  assert.equal(row["Tipe Site"], "Gudang");
  assert.equal(row["Sub Tipe Site"], "");
  assert.equal(row["Profil Barang"], "");
});

test("argument output dan definisi file export stabil", () => {
  assert.deepEqual(parseArgs([]), { target: "local", output: "exports/master" });
  assert.deepEqual(parseArgs(["--output", "tmp/master"]), { target: "local", output: "tmp/master" });
  assert.deepEqual(parseArgs(["--target", "remote"]), { target: "remote", output: "exports/master" });
  assert.deepEqual(EXPORT_DEFINITIONS.map(([filename]) => filename), [
    "stations.csv", "sites.csv", "site_types.csv", "site_subtypes.csv", "item_profiles.csv",
    "items.csv", "profile_items.csv", "product_categories.csv", "products.csv", "nama-stasiun.csv",
  ]);
});

test("target export memisahkan local dan remote tanpa fallback", () => {
  assert.equal(resolveDatabaseTarget("local", { SUPABASE_DB_URL: "postgresql://remote.example/db" }).label, "LOCAL");
  assert.match(resolveDatabaseTarget("local").url, /127\.0\.0\.1:54322/);
  assert.equal(resolveDatabaseTarget("remote", { SUPABASE_DB_URL: "postgresql://remote.example/db" }).label, "REMOTE");
  assert.throws(() => resolveDatabaseTarget("remote", {}), /SUPABASE_DB_URL remote tidak tersedia/);
  assert.throws(() => resolveDatabaseTarget("remote", { SUPABASE_DB_URL: "postgresql://127.0.0.1:54322/postgres" }), /bukan Supabase lokal/);
});
