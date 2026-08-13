import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SOURCE_COLUMNS, SOURCE_FILES, sourceRows } from "../scripts/export-source-csv-remote.mjs";

const ids = {
  station: "11111111-1111-4111-8111-111111111111",
  site: "22222222-2222-4222-8222-222222222222",
  siteType: "33333333-3333-4333-8333-333333333333",
  subtype: "44444444-4444-4444-8444-444444444444",
  profile: "55555555-5555-4555-8555-555555555555",
  item: "66666666-6666-4666-8666-666666666666",
  mapping: "77777777-7777-4777-8777-777777777777",
  category: "88888888-8888-4888-8888-888888888888",
  product: "99999999-9999-4999-8999-999999999999",
};

function fixture() {
  return {
    sites: [{ station_id: ids.station, "Nama Stasiun": "Stasiun A", station_active: true, site_id: ids.site, "Nama Site": "Site A", site_active: true, site_type_id: ids.siteType, "Tipe Site": "AWOS Kategori III", site_type_active: true }],
    siteSubtypes: [{ site_type_id: ids.siteType, "Tipe Site": "AWOS Kategori III", site_type_active: true, site_subtype_id: ids.subtype, "Sub Tipe Site": "AWOS Kategori III Coastal TDZ", site_subtype_active: true, item_profile_id: ids.profile, "Profil Barang": "AWOS TDZ" }],
    profileItems: [{ item_profile_id: ids.profile, "Jenis": "AWOS TDZ", item_profile_active: true, item_id: ids.item, "Barang Terpasang": "Sensor, \"A\"", item_active: true, profile_item_id: ids.mapping, mapping_active: true }],
    productCategories: [{ product_category_id: ids.category, product_categories: "Sensor", active: true }],
    products: [{ product_id: ids.product, "Merk": "Brand", "Tipe": "Type", active: true }],
  };
}

test("source export mempertahankan header dan urutan kolom generator", () => {
  assert.deepEqual(SOURCE_FILES.map(([filename]) => filename), [
    "Nama Stasiun.csv", "Jenis Site.csv", "Barang.csv", "product_categories.csv", "products.csv",
  ]);
  assert.deepEqual(SOURCE_COLUMNS.subtypes, [
    "site_type_id", "Tipe Site", "site_type_active", "site_subtype_id", "Sub Tipe Site",
    "site_subtype_active", "item_profile_id", "Profil Barang",
  ]);
  assert.equal(SOURCE_COLUMNS.stations[1], "Nama Stasiun");
  assert.equal(SOURCE_COLUMNS.stations[4], "Nama Site");
  assert.equal(SOURCE_COLUMNS.stations.at(-1), "Column 21");
});

test("source export merekonstruksi relasi UUID menjadi nama, AWOS tetap satu parent, dan Gudang literal", () => {
  const data = fixture();
  const rows = sourceRows(data);
  assert.equal(rows.stations.length, 1);
  assert.equal(rows.stations[0]["Tipe Site"], "AWOS Kategori III");
  assert.equal(rows.subtypes[0]["Profil Barang"], "AWOS TDZ");
  assert.equal(rows.stations[0].site_id, ids.site);
  data.sites.push({ ...data.sites[0], site_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Nama Site": "Gudang Site", site_type_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Tipe Site": "Gudang" });
  data.siteSubtypes.push({ ...data.siteSubtypes[0], site_type_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Tipe Site": "Gudang", "Sub Tipe Site": "Gudang", item_profile_id: null, "Profil Barang": null });
  const warehouse = sourceRows(data).subtypes.find((row) => row["Tipe Site"] === "Gudang");
  assert.equal(warehouse["Sub Tipe Site"], "Gudang");
  assert.equal(warehouse["Profil Barang"], "Gudang");
});

test("source exporter tidak menulis operational data atau generated resmi", async () => {
  const source = await readFile(new URL("../scripts/export-source-csv-remote.mjs", import.meta.url), "utf8");
  assert.match(source, /set transaction read only/);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert)\b/i);
  assert.doesNotMatch(source, /app[\\/]data\.generated\.json/);
  for (const table of ["stations", "sites", "site_types", "site_subtypes", "item_profiles", "items", "profile_items", "product_categories", "products"]) {
    assert.doesNotMatch(source, new RegExp(`public\\.${table}`));
  }
});
