import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAdminRuntimeMaster } from "../app/lib/admin-inventory-master.ts";
import { getAllowedSiteSubtypes } from "../app/lib/site-subtypes.ts";

const stationId = "station-cengkareng";
const targetSiteId = "cd5167ab-e1b2-4939-8040-85dc4259d258";
const coastalSiteId = "24e992b7-8683-4f12-92af-2a594ab3b2c0";
const siteTypeId = "type-awos";
const roles = ["End Point", "Mid", "Station", "TDZ"];

function fixture() {
  const profiles = roles.map((role) => ({ id: `profile-${role}`, name: `Profile ${role}`, active: true }));
  return {
    station: { id: stationId, name: "Stasiun Meteorologi Soekarno Hatta - Tangerang", active: true },
    sites: [
      { id: targetSiteId, station_id: stationId, site_type_id: siteTypeId, name: "AWOS All Weather Kat. 3 Cengkareng 25 L & 7 R", active: true },
      { id: coastalSiteId, station_id: stationId, site_type_id: siteTypeId, name: "AWOS Coastal Kat. 3 Cengkareng 25 R & 07 L", active: true },
    ],
    siteTypes: [{ id: siteTypeId, name: "AWOS Kategori III", active: true }],
    siteSubtypes: ["AllWeather", "Coastal"].flatMap((family) => roles.map((role) => ({
      id: `${family}-${role}`,
      site_type_id: siteTypeId,
      item_profile_id: `profile-${role}`,
      name: `AWOS Kategori III ${family} ${role}`,
      active: true,
    }))),
    itemProfiles: profiles,
    profileItems: roles.map((role) => ({ id: `mapping-${role}`, item_profile_id: `profile-${role}`, item_id: `item-${role}`, active: true })),
    items: roles.map((role) => ({ id: `item-${role}`, name: `Kategori ${role}`, active: true })),
    submissions: roles.map((role) => ({ site_id: targetSiteId, site_subtype_id: `AllWeather-${role}` })),
  };
}

test("Admin runtime memakai shape Station User, UUID site, dan family Supabase current", () => {
  const master = buildAdminRuntimeMaster(fixture());
  const target = master.stationSites.find((site) => site.siteId === targetSiteId);
  const coastal = master.stationSites.find((site) => site.siteId === coastalSiteId);
  assert.equal(target?.site, "AWOS All Weather Kat. 3 Cengkareng 25 L & 7 R");
  assert.equal(coastal?.site, "AWOS Coastal Kat. 3 Cengkareng 25 R & 07 L");
  const allowedTarget = getAllowedSiteSubtypes({ siteName: target.site, siteTypeName: target.siteType, siteSubtypes: master.siteSubtypes, getSubtypeName: (row) => row.subtype });
  const allowedCoastal = getAllowedSiteSubtypes({ siteName: coastal.site, siteTypeName: coastal.siteType, siteSubtypes: master.siteSubtypes, getSubtypeName: (row) => row.subtype });
  assert.deepEqual(allowedTarget.map((row) => row.subtypeId), roles.map((role) => `AllWeather-${role}`));
  assert.deepEqual(allowedCoastal.map((row) => row.subtypeId), roles.map((role) => `Coastal-${role}`));
  assert.equal(master.legacySubmissionSubtypeIdsBySite[targetSiteId].every((id) => allowedTarget.some((subtype) => subtype.subtypeId === id)), true);
  assert.deepEqual(master.barangByJenis["Profile TDZ"], ["Kategori TDZ"]);
});

test("runtime Admin tidak lagi memiliki dependency generated dan route memakai UUID", async () => {
  const [loader, inventoryPage, submissionPage, exportSource, inventory, api] = await Promise.all([
    readFile(new URL("../app/lib/admin-inventory-master.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/inventory/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/submissions/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/admin-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/runtime-master/route.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [loader, inventoryPage, submissionPage, exportSource]) assert.doesNotMatch(source, /data\.generated\.json/);
  assert.match(loader, /parseStationRuntimeMaster/);
  assert.match(inventoryPage, /initialSiteId=\{runtimeSite\.siteId\}/);
  assert.match(inventoryPage, /initialSubtypeId=\{subtype\.subtypeId\}/);
  assert.match(submissionPage, /initialSubtypeId=\{submission\.site_subtype_id\}/);
  assert.match(inventory, /row\.siteId === initialSiteId/);
  assert.match(inventory, /row\.subtypeId === initialSubtypeId/);
  assert.match(api, /auth\.getUser\(\)/);
  assert.match(api, /super_admins/);
  assert.match(api, /cache-control.: .no-store/);
});
