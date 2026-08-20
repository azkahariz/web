import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildStationSiteProgress } from "../app/lib/station-site-progress.ts";
import {
  WAREHOUSE_PROFILE_ID,
  WAREHOUSE_SITE_TYPE_ID,
  WAREHOUSE_SUBTYPE_ID,
} from "../app/lib/warehouse.ts";

const data = {
  stationSites: [],
  siteSubtypes: [
    ...["End Point", "Mid", "Station", "TDZ"].map((suffix, index) => ({
      siteType: "AWOS Kategori III",
      siteTypeId: "awos-type",
      subtype: `AWOS Kategori III Vaisala ${suffix}`,
      profile: `AWOS ${index}`,
      subtypeId: `awos-${index}`,
    })),
    { siteType: "AWS", siteTypeId: "aws-type", subtype: "AWS Station", profile: "AWS", subtypeId: "aws-subtype" },
    { siteType: "Gudang", subtype: "Gudang", profile: "Gudang", siteTypeId: WAREHOUSE_SITE_TYPE_ID, subtypeId: WAREHOUSE_SUBTYPE_ID, profileId: WAREHOUSE_PROFILE_ID },
  ],
  barangByJenis: {
    "AWOS 0": ["A", "B"],
    "AWOS 1": ["C", "D"],
    "AWS": ["E", "F", "G"],
  },
  products: [],
};

const sites = [
  { siteId: "awos-site", station: "Stasiun Uji", site: "AWOS Vaisala Kat. 3 Uji", siteType: "AWOS Kategori III", siteTypeId: "awos-type" },
  { siteId: "aws-site", station: "Stasiun Uji", site: "AWS Uji", siteType: "AWS", siteTypeId: "aws-type" },
  { siteId: "warehouse-site", station: "Stasiun Uji", site: "Gudang Uji", siteType: "Gudang", siteTypeId: WAREHOUSE_SITE_TYPE_ID },
  { siteId: "empty-site", station: "Stasiun Uji", site: "AWS Belum Mulai", siteType: "AWS", siteTypeId: "aws-type" },
];

test("ringkasan Station User menghitung AWOS multi-subtype sebagai satu parent site dan kategori", () => {
  const rows = buildStationSiteProgress(data, sites, [
    { siteId: "awos-site", siteSubtypeId: "awos-0", filledCount: 2, totalCount: 2, progressKind: "EXPECTED", warehouseCategoryCount: 0, warehouseUnitCount: 0 },
    { siteId: "awos-site", siteSubtypeId: "awos-1", filledCount: 1, totalCount: 2, progressKind: "EXPECTED", warehouseCategoryCount: 0, warehouseUnitCount: 0 },
    { siteId: "aws-site", siteSubtypeId: "aws-subtype", filledCount: 3, totalCount: 3, progressKind: "EXPECTED", warehouseCategoryCount: 0, warehouseUnitCount: 0 },
    { siteId: "warehouse-site", siteSubtypeId: WAREHOUSE_SUBTYPE_ID, filledCount: 0, totalCount: 0, progressKind: "WAREHOUSE", warehouseCategoryCount: 4, warehouseUnitCount: 7 },
  ]);

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.find((row) => row.siteId === "awos-site"), {
    siteId: "awos-site",
    siteName: "AWOS Vaisala Kat. 3 Uji",
    siteType: "AWOS Kategori III",
    warehouseMode: false,
    filledCount: 3,
    totalCount: 4,
    progressPercent: 75,
    warehouseCategoryCount: 0,
    warehouseUnitCount: 0,
  });
  assert.deepEqual(rows.find((row) => row.siteId === "aws-site"), {
    siteId: "aws-site",
    siteName: "AWS Uji",
    siteType: "AWS",
    warehouseMode: false,
    filledCount: 3,
    totalCount: 3,
    progressPercent: 100,
    warehouseCategoryCount: 0,
    warehouseUnitCount: 0,
  });
  assert.deepEqual(rows.find((row) => row.siteId === "warehouse-site"), {
    siteId: "warehouse-site",
    siteName: "Gudang Uji",
    siteType: "Gudang",
    warehouseMode: true,
    filledCount: 0,
    totalCount: 0,
    progressPercent: 0,
    warehouseCategoryCount: 4,
    warehouseUnitCount: 7,
  });
  assert.deepEqual(rows.find((row) => row.siteId === "empty-site"), {
    siteId: "empty-site",
    siteName: "AWS Belum Mulai",
    siteType: "AWS",
    warehouseMode: false,
    filledCount: 0,
    totalCount: 3,
    progressPercent: 0,
    warehouseCategoryCount: 0,
    warehouseUnitCount: 0,
  });
});

test("RPC ringkasan Station User tidak mengembalikan payload submission", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260814110000_station_site_progress_summary.sql", import.meta.url), "utf8");
  assert.match(migration, /list_station_submission_summaries/);
  assert.match(migration, /v_station_id := public\.current_station_id\(\)/);
  assert.doesNotMatch(migration, /returns table \([\s\S]*payload jsonb/);
});
