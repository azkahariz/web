import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildStationSiteProgress, summarizeStationSiteProgress } from "../app/lib/station-site-progress.ts";
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
      subtype: `AWOS Kategori III Vaisala ${suffix}`,
      profile: `AWOS ${index}`,
      subtypeId: `awos-${index}`,
    })),
    { siteType: "AWS", subtype: "AWS Station", profile: "AWS", subtypeId: "aws-subtype" },
    { siteType: "Gudang", subtype: "Gudang", profile: "Gudang", siteTypeId: WAREHOUSE_SITE_TYPE_ID, subtypeId: WAREHOUSE_SUBTYPE_ID, profileId: WAREHOUSE_PROFILE_ID },
  ],
  barangByJenis: {},
  products: [],
};

const sites = [
  { siteId: "awos-site", station: "Stasiun Uji", site: "AWOS Vaisala Kat. 3 Uji", siteType: "AWOS Kategori III" },
  { siteId: "aws-site", station: "Stasiun Uji", site: "AWS Uji", siteType: "AWS" },
  { siteId: "warehouse-site", station: "Stasiun Uji", site: "Gudang Uji", siteType: "Gudang", siteTypeId: WAREHOUSE_SITE_TYPE_ID },
  { siteId: "empty-site", station: "Stasiun Uji", site: "AWS Belum Mulai", siteType: "AWS" },
];

test("ringkasan Station User menghitung AWOS multi-subtype sebagai satu parent site", () => {
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
    status: "Terisi sebagian",
    detail: "2/4 subtipe sudah diisi",
    warehouseMode: false,
  });
  assert.equal(rows.find((row) => row.siteId === "aws-site")?.status, "Lengkap");
  assert.deepEqual(rows.find((row) => row.siteId === "warehouse-site"), {
    siteId: "warehouse-site",
    siteName: "Gudang Uji",
    siteType: "Gudang",
    status: "Terisi sebagian",
    detail: "4 kategori · 7 unit",
    warehouseMode: true,
  });
  assert.equal(rows.find((row) => row.siteId === "empty-site")?.status, "Belum mulai");
  assert.deepEqual(summarizeStationSiteProgress(rows), { total: 4, notStarted: 1, partial: 2, complete: 1 });
});

test("RPC ringkasan Station User tidak mengembalikan payload submission", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260814110000_station_site_progress_summary.sql", import.meta.url), "utf8");
  assert.match(migration, /list_station_submission_summaries/);
  assert.match(migration, /v_station_id := public\.current_station_id\(\)/);
  assert.doesNotMatch(migration, /returns table \([\s\S]*payload jsonb/);
});
