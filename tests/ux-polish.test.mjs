import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  accountMatchesAdminSearch,
  adminSearchPlaceholder,
  countDistinctStationSites,
  siteDisplayName,
  stationMatchesAdminSearch,
} from "../app/lib/admin-view.ts";
import { buildAloptamaFilename, csvCell, sanitizeFilenamePart } from "../app/lib/download.ts";

test("filename export memakai station-site_subtype terbaru dan aman", () => {
  assert.equal(
    buildAloptamaFilename(
      "Stasiun Meteorologi Soekarno-Hatta",
      "AWOS Runway 07L",
      "AWOS End Point",
      "csv",
    ),
    "stasiun-meteorologi-soekarno-hatta-awos-runway-07l_awos-end-point.csv",
  );
  assert.equal(sanitizeFilenamePart('  Stasiun /\\:*?"<>| A---__B  '), "stasiun-a-_b");
  assert.equal(buildAloptamaFilename("Stasiun A", "", "End Point", "csv"), "aloptama-data.csv");
  assert.equal(buildAloptamaFilename(undefined, null, "", "json"), "aloptama-data.json");
  assert.doesNotMatch(buildAloptamaFilename(undefined, "Site", "Subtipe", "csv"), /undefined|null/);

  const csv = `\uFEFF${[["Stasiun", "Site"], ["A", "B"]].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  assert.equal(csv, '\uFEFF"Stasiun","Site"\r\n"A","B"');
});

test("count site admin tetap distinct ketika row terduplikasi", () => {
  const sites = [
    { id: "site-1", station_id: "station-1" },
    { id: "site-1", station_id: "station-1" },
    { id: "site-2", station_id: "station-1" },
    { id: "site-3", station_id: "station-1" },
    { id: "site-4", station_id: "station-2" },
  ];
  const subtypes = Array.from({ length: 6 }, (_, index) => ({ id: `subtype-${index}`, site_id: `site-${index % 3 + 1}` }));
  const submissions = Array.from({ length: 12 }, (_, index) => ({ id: `submission-${index}`, site_id: `site-${index % 3 + 1}` }));
  assert.equal(subtypes.length, 6);
  assert.equal(submissions.length, 12);
  assert.equal(countDistinctStationSites("station-1", sites), 3);
});

test("search Stasiun dan Pengisian mencakup stasiun, site, tipe, dan subtipe", () => {
  const station = { id: "station-1", name: "Stasiun Meteorologi Halim" };
  const sites = [{ id: "site-1", station_id: station.id, site_type_id: "type-1", name: "AWOS Runway 24" }];
  const siteTypes = [{ id: "type-1", name: "AWOS Kategori III" }];
  const subtypes = [{ site_type_id: "type-1", name: "AWOS End Point" }];
  for (const query of ["Halim", "Runway 24", "Kategori III", "End Point"]) {
    assert.equal(stationMatchesAdminSearch(station, query, sites, siteTypes, subtypes), true);
  }
  assert.equal(stationMatchesAdminSearch(station, "Campbell", sites, siteTypes, subtypes), false);
  assert.equal(adminSearchPlaceholder("stations"), "Cari stasiun, nama alat, tipe, atau subtipe alat...");
});

test("search Akun Stasiun hanya memakai nama stasiun dan username", () => {
  const stationMap = new Map([["station-1", { id: "station-1", name: "Stasiun Klimatologi Bogor" }]]);
  const account = { station_id: "station-1", username: "staklim.bogor" };
  assert.equal(accountMatchesAdminSearch(account, "Klimatologi", stationMap), true);
  assert.equal(accountMatchesAdminSearch(account, "staklim.bogor", stationMap), true);
  assert.equal(accountMatchesAdminSearch(account, "Vaisala", stationMap), false);
  assert.equal(adminSearchPlaceholder("accounts"), "Cari nama stasiun atau username...");
  assert.doesNotMatch(adminSearchPlaceholder("accounts"), /brand|tipe/i);
});

test("label site admin tidak menampilkan UUID sebagai fallback utama", () => {
  const uuid = "7eb0d2e7-1111-2222-3333-444444444444";
  assert.equal(siteDisplayName(uuid, new Map([[uuid, { name: "AWOS Runway 07L" }]])), "AWOS Runway 07L");
  assert.equal(siteDisplayName(uuid, new Map()), "Site tidak ditemukan");
  assert.notEqual(siteDisplayName(uuid, new Map()), uuid);
});

test("login toggle password accessible dan form non-login menolak address autofill", async () => {
  const [login, metadata, inventory] = await Promise.all([
    readFile(new URL("../app/LoginForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/SiteMetadataForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(login, /autoComplete="username"/);
  assert.match(login, /autoComplete="current-password"/);
  assert.match(login, /type=\{passwordVisible \? "text" : "password"\}/);
  assert.match(login, /type="button"/);
  assert.match(login, /Tampilkan password/);
  assert.match(login, /Sembunyikan password/);
  assert.match(login, /onClick=\{\(\) => setPasswordVisible\(\(current\) => !current\)\}/);
  assert.match(metadata, /Alamat Detail<textarea autoComplete="off"/);
  assert.match(metadata, /No HP Penjaga<input autoComplete="off"/);
  assert.match(inventory, /id="aloptama-entry-operator" autoComplete="off"/);
});

test("temporary password hanya berada di response sukses dan state dialog", async () => {
  const [route, dashboard] = await Promise.all([
    readFile(new URL("../app/api/admin/accounts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /return NextResponse\.json\(\{ ok: true, username: account\.username, temporaryPassword \}\)/);
  assert.match(route, /metadata: \{\}/);
  assert.doesNotMatch(route, /\.from\("station_accounts"\)\.update\(\{[^}]*password/);
  assert.match(dashboard, /setCredential\(null\)/);
  assert.match(dashboard, /type=\{credentialVisible \? "text" : "password"\}/);
  assert.match(dashboard, /Setelah dialog ditutup, password tidak dapat ditampilkan kembali/);
  assert.match(dashboard, /siteDisplayName\(submission\.site_id, siteMap\)/);
  assert.doesNotMatch(dashboard, /\?\? submission\.site_id/);
  assert.doesNotMatch(dashboard, /localStorage|sessionStorage/);
});
