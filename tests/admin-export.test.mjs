import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAdminExportPlan } from "../app/lib/admin-export-plan.ts";
import { buildStationFillingView } from "../app/lib/admin-view.ts";
import { buildInventoryCsv, createDefaultDraftPayload } from "../app/lib/inventory-export.ts";
import { getAllowedSiteSubtypes } from "../app/lib/site-subtypes.ts";

const familyNames = {
  AllWeather: [
    "AWOS Kategori III AllWeather End Point",
    "AWOS Kategori III AllWeather Mid",
    "AWOS Kategori III AllWeather Station",
    "AWOS Kategori III AllWeather TDZ",
  ],
  Coastal: [
    "AWOS Kategori III Coastal End Point",
    "AWOS Kategori III Coastal Mid",
    "AWOS Kategori III Coastal Station",
    "AWOS Kategori III Coastal TDZ",
  ],
  Degreane: [
    "AWOS Kategori III Degreane End Point",
    "AWOS Kategori III Degreane Mid",
    "AWOS Kategori III Degreane Station",
    "AWOS Kategori III Degreane TDZ",
  ],
  Microstep: [
    "AWOS Kategori III Microstep End Point",
    "AWOS Kategori III Microstep Mid",
    "AWOS Kategori III Microstep Station",
    "AWOS Kategori III Microstep TDZ",
  ],
  Vaisala: [
    "AWOS Kategori III Vaisala End Point",
    "AWOS Kategori III Vaisala Mid",
    "AWOS Kategori III Vaisala Station",
    "AWOS Kategori III Vaisala TDZ",
  ],
};
const allAwosSubtypes = Object.values(familyNames).flat().map((name, index) => ({ id: `awos-${index}`, name }));

for (const [family, expected] of Object.entries(familyNames)) {
  test(`AWOS Kategori III ${family} hanya memakai empat subtype family yang benar`, () => {
    const siteName = family === "AllWeather" ? "AWOS All Weather Kat. 3 Test" : `AWOS ${family} Kat. 3 Test`;
    const actual = getAllowedSiteSubtypes({
      siteName,
      siteTypeName: "AWOS Kategori III",
      siteSubtypes: allAwosSubtypes,
      getSubtypeName: (subtype) => subtype.name,
    });
    assert.deepEqual(actual.map((subtype) => subtype.name), expected);
  });
}

test("AWOS Kategori III unknown tidak fallback ke seluruh subtype", () => {
  assert.deepEqual(getAllowedSiteSubtypes({
    siteName: "AWOS Unknown Kat. 3 Test",
    siteTypeName: "AWOS Kategori III",
    siteSubtypes: allAwosSubtypes,
    getSubtypeName: (subtype) => subtype.name,
  }), []);
});

test("shared AWOS mapping dipakai view Admin tanpa mengubah distinct site count", () => {
  const subtypes = allAwosSubtypes.map((subtype) => ({ ...subtype, site_type_id: "awos-type" }));
  const view = buildStationFillingView("station", [{
    id: "site", station_id: "station", site_type_id: "awos-type", name: "AWOS Coastal Kat. 3 Test",
  }], [{ id: "awos-type", name: "AWOS Kategori III" }], subtypes, []);
  assert.equal(view.siteCount, 1);
  assert.equal(view.rows.length, 4);
  assert.deepEqual(view.rows.map((row) => row.subtype?.name), familyNames.Coastal);
});

const station = { id: "station-a", name: "Stasiun A" };
const sites = [
  { id: "site-1", station_id: station.id, site_type_id: "type-1", name: "Site 1" },
  { id: "site-2", station_id: station.id, site_type_id: "type-2", name: "Site 2" },
];
const siteTypes = [{ id: "type-1", name: "Tipe 1" }, { id: "type-2", name: "Tipe 2" }];
const subtypes = [
  { id: "sub-1", site_type_id: "type-1", name: "Sub 1" },
  { id: "sub-2", site_type_id: "type-1", name: "Sub 2" },
  { id: "sub-3", site_type_id: "type-2", name: "Sub 1" },
];
const rows = buildStationFillingView(station.id, sites, siteTypes, subtypes, []).rows;

test("bulk Station menghasilkan ZIP berisi seluruh kombinasi termasuk tanpa submission", () => {
  const plan = buildAdminExportPlan(station, rows, { stationId: station.id });
  assert.equal(plan.kind, "zip");
  assert.equal(plan.filename, "stasiun-a.zip");
  assert.equal(plan.entries.length, 3);
  assert.ok(plan.entries.every((entry) => entry.submission === null));
});

test("fflate menghasilkan ZIP yang dapat dibuka dengan seluruh CSV", async () => {
  const { strFromU8, strToU8, unzipSync, zipSync } = await import("fflate");
  const plan = buildAdminExportPlan(station, rows, { stationId: station.id });
  const archive = zipSync(Object.fromEntries(plan.entries.map((entry) => [entry.filename, strToU8(`CSV ${entry.filename}`)])));
  const extracted = unzipSync(archive);
  assert.deepEqual(Object.keys(extracted), plan.entries.map((entry) => entry.filename));
  assert.equal(strFromU8(extracted[plan.entries[0].filename]), `CSV ${plan.entries[0].filename}`);
});

test("bulk Site menghasilkan ZIP seluruh subtype Site", () => {
  const plan = buildAdminExportPlan(station, rows, { stationId: station.id, siteId: "site-1" });
  assert.equal(plan.kind, "zip");
  assert.equal(plan.filename, "stasiun-a_site-1.zip");
  assert.equal(plan.entries.length, 2);
});

test("single subtype menghasilkan CSV dengan convention shared", () => {
  const plan = buildAdminExportPlan(station, rows, { stationId: station.id, siteId: "site-1", siteSubtypeId: "sub-1" });
  assert.equal(plan.kind, "csv");
  assert.equal(plan.filename, "stasiun-a_site-1_sub-1.csv");
  assert.equal(plan.entries.length, 1);
});

test("filename collision dalam ZIP mendapat suffix deterministic", () => {
  const collisionRows = ["Sub/A", "Sub:A"].map((name, index) => ({
    site: sites[0], siteType: siteTypes[0], subtype: { id: `collision-${index}`, site_type_id: "type-1", name }, submission: null,
  }));
  const plan = buildAdminExportPlan(station, collisionRows, { stationId: station.id });
  assert.deepEqual(plan.entries.map((entry) => entry.filename), [
    "stasiun-a_site-1_sub-a.csv",
    "stasiun-a_site-1_sub-a-2.csv",
  ]);
});

test("CSV default dan CSV semua jalur memakai serializer yang sama", () => {
  const context = {
    stationName: "Stasiun A",
    siteName: "Site 1",
    siteTypeName: "Tipe 1",
    subtypeName: "Sub 1",
    profile: "Profil 1",
    categories: ["Sensor"],
    payload: createDefaultDraftPayload("station-a", "site-1", "sub-1"),
  };
  const stationCsv = buildInventoryCsv(context);
  const adminSingleCsv = buildInventoryCsv(context);
  const adminBulkCsv = buildInventoryCsv(context);
  assert.equal(stationCsv, adminSingleCsv);
  assert.equal(adminSingleCsv, adminBulkCsv);
  assert.match(stationCsv, /^\uFEFF"Stasiun"/);
  assert.match(stationCsv, /"Stasiun A","Site 1","Tipe 1","Sub 1"/);
});

test("download Browse dan Admin tidak menjalankan lifecycle lock atau write", async () => {
  const [inventory, adminExport, dashboard, adminBrowse, ensureRoute, hook, unified] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/admin-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/inventory/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/submissions/ensure/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useServerDraft.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/UnifiedFillingList.tsx", import.meta.url), "utf8"),
  ]);
  const saveBeforeDownload = inventory.match(/async function saveBeforeDownload\(\)[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(saveBeforeDownload, /if \(!sync\.isEditing \|\| !sync\.dirty\) return true;[\s\S]*persistLocalNow\(\)/);
  assert.match(saveBeforeDownload, /sync\.saveNow\(\)/);
  assert.ok(inventory.indexOf("{!sync.isEditing && renderDownloadMenu()}") < inventory.indexOf("<fieldset className=\"editing-surface\""));
  assert.match(inventory, /buildInventoryCsv/);
  assert.match(inventory, /buildInventoryJson/);
  assert.doesNotMatch(adminExport, /\.rpc\(|\.insert\(|\.update\(|\.upsert\(|open_submission|release_submission|touch_submission|takeover/);
  assert.match(adminExport, /loadAllAdminRows[\s\S]*\.eq\("station_id", scope\.stationId\)/);
  assert.match(unified, /target="_blank" rel="noopener noreferrer">Buka<\/Link>[\s\S]*>Unduh<\/AsyncButton>/);
  const masterTable = dashboard.match(/fillingMode === "master" && <div className="admin-list">[\s\S]*?submissionMonitorMounted/)?.[0] ?? "";
  assert.doesNotMatch(masterTable, /Edit sebagai Admin|editRow|\/ensure/);
  assert.doesNotMatch(adminBrowse, /\.insert\(|\.update\(|\.upsert\(|open_submission/);
  assert.match(hook, /if \(adminMode && !adminSubmissionId\)[\s\S]*setStatus\("browsing"\)/);
  assert.match(ensureRoute, /is_super_admin/);
  assert.match(ensureRoute, /site_subtype_is_allowed/);
  assert.doesNotMatch(ensureRoute, /getAllowedSiteSubtypes/);
  assert.match(ensureRoute, /\.upsert\(\{/);
  assert.match(ensureRoute, /admin_open_submission/);
});
