import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getItemFunctionCategories,
  inventoryCategoryEntries,
  itemIdByName,
  physicalUnitCount,
  recordedCategoryCount,
  removeInventoryCategory,
  withItemFunctionCategories,
} from "../app/lib/category-functions.ts";
import { buildInventoryCsv, buildInventoryJson, createDefaultDraftPayload } from "../app/lib/inventory-export.ts";
import { summarizeSubmissionProgress, summarizeWarehouseInventory } from "../app/lib/submission-monitoring.ts";
import { isWarehouseContext, WAREHOUSE_PROFILE } from "../app/lib/warehouse.ts";

const generated = JSON.parse(await readFile(new URL("../app/data.generated.json", import.meta.url), "utf8"));
const warehouseSubtype = generated.siteSubtypes.find((row) => row.siteType === "Gudang" && row.subtype === "Gudang");
const warehouseSite = generated.stationSites.find((row) => row.siteType === "Gudang");
const categoryIds = itemIdByName(generated.master);

function combinedProduct(categories, id = "physical-1") {
  return withItemFunctionCategories({
    id: "item-1",
    itemKind: "product",
    brand: "Vaisala",
    model: "HMP155",
    quantity: 1,
    units: [{
      id,
      serialNumber: "ABC123",
      condition: "Baik",
      installedYear: "2025",
      procurementYear: "2025",
      procurementActivity: "Pengadaan Aloptama MKG 2025",
      notes: "",
    }],
  }, categories, categoryIds);
}

test("master Gudang memakai UUID canonical dan Profil Barang Gudang sebagai allowed catalog", () => {
  assert.ok(warehouseSite?.siteId);
  assert.ok(warehouseSubtype?.siteTypeId);
  assert.ok(warehouseSubtype?.subtypeId);
  assert.ok(warehouseSubtype?.profileId);
  assert.equal(warehouseSubtype.profile, WAREHOUSE_PROFILE);
  assert.equal(generated.barangByJenis[WAREHOUSE_PROFILE].length, 128);
  assert.equal(isWarehouseContext(generated, warehouseSite, warehouseSubtype), true);
  assert.deepEqual(summarizeWarehouseInventory({}), { categoryCount: 0, unitCount: 0 });
});

test("kategori Gudang tetap on-demand dan key kosong tidak menjadi progress palsu", () => {
  const inventory = { "Sensor Tekanan Udara": [] };
  assert.deepEqual(Object.keys(inventory), ["Sensor Tekanan Udara"]);
  assert.deepEqual(summarizeWarehouseInventory(inventory), { categoryCount: 0, unitCount: 0 });
  assert.equal(recordedCategoryCount(inventory), 0);
});

test("satu unit Suhu dan Kelembaban memenuhi dua kategori Site dengan denominator tetap", () => {
  const categories = ["Sensor Suhu Udara", "Sensor Kelembaban Udara"];
  const item = combinedProduct(categories);
  const inventory = { "Sensor Suhu Udara": [item] };
  assert.equal(physicalUnitCount(inventory), 1);
  assert.equal(inventoryCategoryEntries(inventory, categories[0]).length, 1);
  assert.equal(inventoryCategoryEntries(inventory, categories[1]).length, 1);
  assert.deepEqual(summarizeSubmissionProgress(categories, inventory), {
    filledCount: 2,
    totalCount: 2,
    progressPercent: 100,
    progressStatus: "Lengkap",
  });
});

test("kombinasi Arah dan Kecepatan Angin tetap satu physical unit", () => {
  const categories = ["Sensor Kecepatan Angin", "Sensor Arah Angin"];
  const inventory = { "Sensor Kecepatan Angin": [combinedProduct(categories, "wind-unit")] };
  assert.equal(physicalUnitCount(inventory), 1);
  assert.equal(recordedCategoryCount(inventory), 2);
  assert.equal(inventoryCategoryEntries(inventory, categories[1])[0].item.units[0].id, "wind-unit");
});

test("ubah fungsi mempertahankan product dan physical unit ID", () => {
  const item = combinedProduct(["Sensor Suhu Udara"]);
  const changed = withItemFunctionCategories(item, ["Sensor Suhu Udara", "Sensor Kelembaban Udara"], categoryIds);
  assert.equal(changed.id, item.id);
  assert.equal(changed.units[0].id, item.units[0].id);
  assert.deepEqual(getItemFunctionCategories(changed, "Sensor Suhu Udara"), ["Sensor Suhu Udara", "Sensor Kelembaban Udara"]);
  assert.equal(changed.functionCategoryIds.length, 2);
});

test("hapus satu kategori kombinasi mempertahankan physical unit pada fungsi lain", () => {
  const item = combinedProduct(["Sensor Suhu Udara", "Sensor Kelembaban Udara"]);
  const inventory = {
    "Sensor Suhu Udara": [item],
    "Sensor Kelembaban Udara": [],
  };
  const next = removeInventoryCategory(inventory, "Sensor Suhu Udara", categoryIds);
  assert.equal(physicalUnitCount(next), 1);
  assert.equal(next["Sensor Suhu Udara"], undefined);
  assert.equal(next["Sensor Kelembaban Udara"][0].units[0].id, "physical-1");
  assert.deepEqual(next["Sensor Kelembaban Udara"][0].functionCategories, ["Sensor Kelembaban Udara"]);
});

test("export Gudang menyimpan field pengadaan dan identity unit kombinasi", () => {
  const categories = ["Sensor Suhu Udara", "Sensor Kelembaban Udara"];
  const payload = createDefaultDraftPayload("station", "warehouse", "warehouse-subtype");
  payload.inventory = { "Sensor Suhu Udara": [combinedProduct(categories)] };
  const context = {
    stationName: "BMKG Pusat",
    siteName: "Gudang BMKG Pusat",
    siteTypeName: "Gudang",
    subtypeName: "Gudang",
    profile: WAREHOUSE_PROFILE,
    categories,
    payload,
    warehouseMode: true,
  };
  const csv = buildInventoryCsv(context);
  assert.match(csv, /"Tahun Pengadaan","Nama Kegiatan Pengadaan"/);
  assert.match(csv, /"physical-1"/);
  assert.equal(csv.match(/"physical-1"/g)?.length, 2);
  assert.match(csv, /"Sensor Suhu Udara; Sensor Kelembaban Udara"/);
  assert.doesNotMatch(csv.split("\r\n")[0], /Metadata|Tahun Pasang/);

  const json = buildInventoryJson(context, "2026-08-13T00:00:00.000Z");
  assert.equal(json.source, "warehouse");
  assert.equal(json.siteMetadata, null);
  assert.equal(json.physicalUnits.length, 1);
  assert.equal(json.physicalUnits[0].physicalUnitId, "physical-1");
  assert.deepEqual(json.physicalUnits[0].functionCategories, categories);
});

test("form Site biasa dan Gudang mempertahankan field serta lifecycle infrastructure existing", async () => {
  const [form, migration, hook, qc] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260813150000_station_warehouse.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useServerDraft.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useProductCatalog.ts", import.meta.url), "utf8"),
  ]);
  assert.match(form, /warehouseMode \? [\s\S]*Tahun pengadaan/);
  assert.match(form, /Nama kegiatan pengadaan/);
  assert.match(form, /: <label>Tahun pasang/);
  assert.match(form, /!warehouseMode && \(/);
  assert.match(form, /create_product_proposal/);
  assert.match(hook, /open_submission|admin_open_submission/);
  assert.match(hook, /save_submission/);
  assert.match(hook, /release_submission/);
  assert.match(qc, /product_proposals/);
  assert.match(migration, /perform public\.require_super_admin\(\)/);
  assert.match(migration, /profile\.name = 'Profil Barang Gudang'/);
  assert.match(migration, /submission_warehouse_summary/);
  assert.doesNotMatch(migration, /create table|alter table|disable row level security/i);
});
