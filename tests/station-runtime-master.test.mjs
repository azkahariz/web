import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAllowedSiteSubtypes } from "../app/lib/site-subtypes.ts";
import { parseStationRuntimeMaster } from "../app/lib/station-runtime-master.ts";
import generated from "../app/data.generated.json" with { type: "json" };

const basePayload = {
  station: { id: "station-a", name: "Raja Haji Abdullah" },
  sites: [{ id: "site-a", stationId: "station-a", name: "AWOS All Weather Kat. 3 Cengkareng 25 L & 7 R", siteTypeId: "type-awos", siteTypeName: "AWOS Kategori III" }],
  siteSubtypes: ["End Point", "Mid", "Station", "TDZ"].map((suffix) => ({
    id: `allweather-${suffix}`,
    siteTypeId: "type-awos",
    siteTypeName: "AWOS Kategori III",
    name: `AWOS Kategori III AllWeather ${suffix}`,
    profileId: `profile-${suffix}`,
    profileName: `Profile ${suffix}`,
  })),
  itemProfiles: ["End Point", "Mid", "Station", "TDZ"].map((suffix) => ({ id: `profile-${suffix}`, name: `Profile ${suffix}` })),
  profileItems: [{ id: "mapping-1", profileId: "profile-TDZ", profileName: "Profile TDZ", itemId: "item-1", itemName: "Sensor" }],
  legacySubmissionSubtypeIdsBySite: { "site-a": ["coastal-TDZ"] },
};

test("runtime master memakai nama live dan subtype AllWeather, bukan label generated", () => {
  const master = parseStationRuntimeMaster(basePayload);
  assert.equal(master.stationSites[0].station, "Raja Haji Abdullah");
  assert.equal(master.stationSites[0].site, "AWOS All Weather Kat. 3 Cengkareng 25 L & 7 R");
  const allowed = getAllowedSiteSubtypes({
    siteName: master.stationSites[0].site,
    siteTypeName: master.stationSites[0].siteType,
    siteSubtypes: master.siteSubtypes,
    getSubtypeName: (row) => row.subtype,
  });
  assert.deepEqual(allowed.map((row) => row.subtype), [
    "AWOS Kategori III AllWeather End Point",
    "AWOS Kategori III AllWeather Mid",
    "AWOS Kategori III AllWeather Station",
    "AWOS Kategori III AllWeather TDZ",
  ]);
  assert.equal(master.barangByJenis["Profile TDZ"][0], "Sensor");
});

test("runtime master rejects incomplete payload instead of falling back to generated data", () => {
  assert.throws(() => parseStationRuntimeMaster({ station: { id: "station-a" } }), /nama stasiun/);
});

test("Station User runtime modules do not import data.generated.json", async () => {
  const files = [
    "../app/page.tsx",
    "../app/InventoryApp.tsx",
    "../app/lib/station-site-progress.ts",
    "../app/hooks/useStationSiteProgress.ts",
  ];
  const source = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  for (const moduleSource of source) assert.doesNotMatch(moduleSource, /data\.generated\.json/);
});

test("runtime master migration scopes data through current_station_id and exposes no station parameter", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260820120000_station_runtime_master.sql", import.meta.url), "utf8");
  assert.match(migration, /v_station_id := public\.current_station_id\(\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /grant execute on function public\.station_runtime_master\(\) to authenticated/);
  assert.doesNotMatch(migration, /station_runtime_master\(\s*p_station_id/i);
});

test("runtime master keeps legacy subtype references available for a data-driven remediation gate", async () => {
  const inventory = await readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8");
  assert.match(inventory, /legacySubmissionSubtypeIdsBySite/);
  assert.match(inventory, /remediationRequired/);
  assert.match(inventory, /Konfigurasi Site sedang diperbarui/);
});

test("runtime master mempertahankan subtype dan kategori representative master legacy sebagai oracle test", () => {
  const representative = [
    ["Digitalisasi Taman Alat Meteorologi"],
    ["AWS Maritim"],
    ["Water Level"],
    ["ARG"],
    ["AAWS"],
    ["AWOS Kategori I"],
    ["AWOS Kategori II"],
    ["AWOS Kategori III", "All Weather"],
    ["AWOS Kategori III", "Coastal"],
    ["AWOS Kategori III", "Degreane"],
    ["Gudang"],
  ];
  for (const [siteType, namePart] of representative) {
    const site = generated.stationSites.find((row) => row.siteType === siteType && (!namePart || row.site.includes(namePart)));
    assert.ok(site, `Fixture ${siteType}${namePart ? ` ${namePart}` : ""} harus tersedia.`);
    const subtypeRows = generated.siteSubtypes.filter((row) => row.siteTypeId === site.siteTypeId);
    const profileIds = new Set(subtypeRows.map((row) => row.profileId).filter(Boolean));
    const profileItems = (generated.master?.profileItems ?? []).filter((row) => profileIds.has(row.profileId));
    const runtime = parseStationRuntimeMaster({
      station: { id: site.stationId, name: site.station },
      sites: [{ id: site.siteId, stationId: site.stationId, name: site.site, siteTypeId: site.siteTypeId, siteTypeName: site.siteType }],
      siteSubtypes: subtypeRows.map((row) => ({ id: row.subtypeId, siteTypeId: row.siteTypeId, siteTypeName: row.siteType, name: row.subtype, profileId: row.profileId, profileName: row.profile })),
      itemProfiles: Array.from(new Map(subtypeRows.map((row) => [row.profileId, { id: row.profileId, name: row.profile }])).values()),
      profileItems: profileItems.map((row) => ({ id: row.mappingId, profileId: row.profileId, profileName: row.profile, itemId: row.itemId, itemName: row.item })),
    });
    const expected = getAllowedSiteSubtypes({ siteName: site.site, siteTypeName: site.siteType, siteSubtypes: subtypeRows, getSubtypeName: (row) => row.subtype });
    const actual = getAllowedSiteSubtypes({ siteName: runtime.stationSites[0].site, siteTypeName: runtime.stationSites[0].siteType, siteSubtypes: runtime.siteSubtypes, getSubtypeName: (row) => row.subtype });
    assert.deepEqual(actual.map((row) => row.subtypeId), expected.map((row) => row.subtypeId), `${site.site} subtype berubah.`);
    for (const subtype of actual) {
      assert.deepEqual(runtime.barangByJenis[subtype.profile] ?? [], generated.barangByJenis[subtype.profile] ?? [], `${subtype.profile} kategori berubah.`);
    }
  }
});
