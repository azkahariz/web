import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  accountMatchesAdminSearch,
  adminSearchPlaceholder,
  buildStationFillingView,
  countDistinctStationSites,
  distinctStationSites,
  filterStationFillingRows,
  loadAllAdminRows,
  siteDisplayName,
  stationMatchesAdminSearch,
} from "../app/lib/admin-view.ts";
import { buildAloptamaFilename, csvCell, sanitizeFilenamePart } from "../app/lib/download.ts";
import { summarizeSitesByType } from "../app/lib/admin-summary.ts";

test("filename export memakai station-site_subtype terbaru dan aman", () => {
  assert.equal(
    buildAloptamaFilename(
      "Stasiun Meteorologi Soekarno-Hatta",
      "AWOS Runway 07L",
      "AWOS End Point",
      "csv",
    ),
    "stasiun-meteorologi-soekarno-hatta_awos-runway-07l_awos-end-point.csv",
  );
  assert.equal(sanitizeFilenamePart('  Stasiun /\\:*?"<>| A---__B  '), "stasiun-a-_b");
  assert.equal(buildAloptamaFilename("Stasiun A", "", "End Point", "csv"), "aloptama-data.csv");
  assert.equal(buildAloptamaFilename(undefined, null, "", "json"), "aloptama-data.json");
  assert.doesNotMatch(buildAloptamaFilename(undefined, "Site", "Subtipe", "csv"), /undefined|null/);

  const csv = `\uFEFF${[["Stasiun", "Site"], ["A", "B"]].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  assert.equal(csv, '\uFEFF"Stasiun","Site"\r\n"A","B"');
});

const stationSites = [
  { id: "site-1", station_id: "station-1", site_type_id: "type-awos", name: "AWOS Bandara X" },
  { id: "site-2", station_id: "station-1", site_type_id: "type-aaws", name: "AAWS Donggala" },
  { id: "site-3", station_id: "station-1", site_type_id: "type-water", name: "Water Level X" },
];
const stationSiteTypes = [
  { id: "type-awos", name: "AWOS Kategori III" },
  { id: "type-aaws", name: "AAWS" },
  { id: "type-water", name: "Water Level" },
];
const stationSubtypes = [
  { id: "awos-tdz", site_type_id: "type-awos", name: "TDZ" },
  { id: "awos-mid", site_type_id: "type-awos", name: "Mid Point" },
  { id: "awos-end", site_type_id: "type-awos", name: "End Point" },
  { id: "awos-station", site_type_id: "type-awos", name: "Station" },
  { id: "aaws", site_type_id: "type-aaws", name: "AAWS" },
  { id: "water", site_type_id: "type-water", name: "Water Level" },
];
const submission = (id, siteId, subtypeId) => ({
  id,
  station_id: "station-1",
  site_id: siteId,
  site_subtype_id: subtypeId,
});

test("view pengisian berawal dari tiga site master walau tanpa submission", () => {
  const view = buildStationFillingView("station-1", stationSites, stationSiteTypes, stationSubtypes, []);
  assert.equal(view.siteCount, 3);
  assert.equal(view.submissionCount, 0);
  assert.deepEqual([...new Set(view.rows.map((row) => row.site.name))], ["AWOS Bandara X", "AAWS Donggala", "Water Level X"]);
});

test("loader Admin mengambil seluruh page sites melewati batas 1000 row", async () => {
  const source = Array.from({ length: 2025 }, (_, index) => ({ id: `site-${index}` }));
  const requestedRanges = [];
  const result = await loadAllAdminRows(async (from, to) => {
    requestedRanges.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  });
  assert.equal(result.error, null);
  assert.equal(result.data?.length, 2025);
  assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("25 site master tetap tampil saat empat site belum terpetakan", () => {
  const sites = Array.from({ length: 25 }, (_, index) => ({
    id: `site-${index + 1}`,
    station_id: "station-x",
    site_type_id: index < 21 ? "mapped-type" : `missing-type-${index}`,
    name: `Site ${index + 1}`,
  }));
  const view = buildStationFillingView(
    "station-x",
    sites,
    [{ id: "mapped-type", name: "Tipe Terpetakan" }],
    [{ id: "mapped-subtype", site_type_id: "mapped-type", name: "Subtipe Terpetakan" }],
    [],
  );
  assert.equal(view.siteCount, 25);
  assert.equal(view.submissionCount, 0);
  assert.deepEqual(new Set(view.rows.map((row) => row.site.name)), new Set(sites.map((site) => site.name)));
  const unmappedRows = view.rows.filter((row) => row.siteType === null);
  assert.equal(unmappedRows.length, 4);
  assert.ok(unmappedRows.every((row) => row.subtype === null && row.submission === null));
});

test("satu submission tidak mengurangi count tiga site master", () => {
  const view = buildStationFillingView("station-1", stationSites, stationSiteTypes, stationSubtypes, [submission("sub-1", "site-1", "awos-mid")]);
  assert.equal(view.siteCount, 3);
  assert.equal(view.submissionCount, 1);
});

test("satu site dengan empat subtipe menjadi empat row tetapi tetap satu site", () => {
  const view = buildStationFillingView("station-1", [
    { id: "site-multi", station_id: "station-1", site_type_id: "type-multi", name: "Site Multi" },
  ], [{ id: "type-multi", name: "Tipe Multi" }], ["TDZ", "Mid Point", "End Point", "Station"].map((name, index) => ({
    id: `multi-${index}`, site_type_id: "type-multi", name,
  })), []);
  assert.equal(view.siteCount, 1);
  assert.equal(view.rows.length, 4);
  assert.deepEqual(view.rows.map((row) => row.subtype?.name), ["TDZ", "Mid Point", "End Point", "Station"]);
});

test("site tanpa submission tetap membawa nama site, tipe, dan subtipe master", () => {
  const view = buildStationFillingView("station-1", stationSites, stationSiteTypes, stationSubtypes, []);
  const row = view.rows.find((candidate) => candidate.site.id === "site-2");
  assert.equal(row?.site.name, "AAWS Donggala");
  assert.equal(row?.siteType?.name, "AAWS");
  assert.equal(row?.subtype?.name, "AAWS");
  assert.equal(row?.submission, null);
});

test("beberapa submission pada satu site tidak menduplikasi site count", () => {
  const submissions = [submission("sub-1", "site-1", "awos-tdz"), submission("sub-2", "site-1", "awos-mid")];
  const view = buildStationFillingView("station-1", [...stationSites, stationSites[0]], stationSiteTypes, stationSubtypes, submissions);
  assert.equal(countDistinctStationSites("station-1", [...stationSites, stationSites[0]]), 3);
  assert.equal(distinctStationSites("station-1", [...stationSites, stationSites[0]]).length, 3);
  assert.equal(view.siteCount, 3);
  assert.equal(view.submissionCount, 2);
});

test("fixture generated BMKG Pusat mempunyai delapan site master termasuk Gudang", async () => {
  const generated = JSON.parse(await readFile(new URL("../app/data.generated.json", import.meta.url), "utf8"));
  const bmkgPusat = generated.stationSites.filter((row) => row.station === "BMKG Pusat");
  assert.equal(new Set(bmkgPusat.map((row) => row.siteId)).size, 8);
});

test("search Stasiun dan Pengisian mencakup stasiun, site, tipe, dan subtipe", () => {
  const station = { id: "station-1", name: "Stasiun Meteorologi Halim" };
  const sites = [{ id: "site-1", station_id: station.id, site_type_id: "type-1", name: "AWOS Runway 24" }];
  const siteTypes = [{ id: "type-1", name: "AWOS Kategori II" }];
  const subtypes = [{ id: "subtype-1", site_type_id: "type-1", name: "AWOS End Point" }];
  for (const query of ["Halim", "Runway 24", "Kategori II", "End Point"]) {
    assert.equal(stationMatchesAdminSearch(station, query, sites, siteTypes, subtypes), true);
  }
  assert.equal(stationMatchesAdminSearch(station, "Campbell", sites, siteTypes, subtypes), false);
  const view = buildStationFillingView(station.id, sites, siteTypes, subtypes, []);
  assert.equal(filterStationFillingRows(station.name, view.rows, "End Point").length, 1);
  assert.equal(filterStationFillingRows(station.name, view.rows, "Campbell").length, 0);
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
  assert.match(login, /loadingText="Memverifikasi\.\.\."/);
  assert.match(login, /disabled=\{submitting\}/);
  assert.match(login, /Login berhasil\. Membuka dashboard\.\.\./);
  assert.match(login, /Username atau password tidak sesuai\./);
  assert.doesNotMatch(login, /setTimeout\(/);
  assert.match(metadata, /Alamat Detail<textarea autoComplete="off"/);
  assert.match(metadata, /No HP Penjaga<input autoComplete="off"/);
  assert.match(inventory, /id="aloptama-entry-operator" autoComplete="off"/);
});

test("shared async button memberi spinner, label proses, dan disabled state", async () => {
  const button = await readFile(new URL("../app/components/AsyncButton.tsx", import.meta.url), "utf8");
  assert.match(button, /loadingText/);
  assert.match(button, /disabled=\{disabled \|\| loading\}/);
  assert.match(button, /aria-busy=\{loading \|\| undefined\}/);
  assert.match(button, /className="loading-spinner"/);
});

test("shared feedback menggantikan dialog browser native pada flow production", async () => {
  const [feedback, dashboard, monitor, inventory] = await Promise.all([
    readFile(new URL("../app/components/AppFeedback.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminSubmissionMonitor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(feedback, /aria-live="polite"/);
  assert.match(feedback, /role="dialog" aria-modal="true"/);
  assert.match(feedback, /dialogLoading/);
  assert.match(feedback, /confirmationText/);
  assert.match(feedback, /disabled=\{Boolean\(dialog\.confirmationText && inputValue\.trim\(\) !== dialog\.confirmationText\)\}/);
  assert.match(feedback, /event\.key === "Escape"/);
  for (const source of [dashboard, monitor, inventory]) {
    assert.doesNotMatch(source, /window\.(?:alert|confirm|prompt)\s*\(/);
  }
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
  assert.match(dashboard, /buildStationFillingView\(station\.id, sites, siteTypes, subtypes, submissions\)/);
  assert.match(dashboard, /<th>Site<\/th><th>Tipe Site<\/th><th>Subtipe<\/th><th>Status<\/th>/);
  assert.match(dashboard, /loadAllAdminRows\(\(from, to\) => client\.from\("sites"\)/);
  assert.match(dashboard, /\.order\("name"\)\s*\.order\("id"\)\s*\.range\(from, to\)/);
  assert.match(dashboard, /<td>\{siteType\?\.name \?\? "Belum terpetakan"\}<\/td>/);
  assert.match(dashboard, /<td>\{subtype\?\.name \?\? "Belum terpetakan"\}<\/td>/);
  assert.match(dashboard, /<td><span className=\{`status-pill \$\{submission \? "active" : "pending"\}`\}>\{submission \? "Sudah ada data" : "Belum ada submission"\}<\/span><\/td>/);
  assert.doesNotMatch(dashboard, /buildStationSiteRows/);
  assert.doesNotMatch(dashboard, /\?\? submission\.site_id/);
  assert.doesNotMatch(dashboard, /localStorage|sessionStorage/);
});

test("Master Pengisian merender detail station secara lazy dan memoized", async () => {
  const dashboard = await readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /const StationFillingCard = memo\(/);
  assert.match(dashboard, /expandedStationId/);
  assert.match(dashboard, /\{expanded && <div className="admin-table-wrap station-filling-table">/);
  assert.match(dashboard, /previous\.view === next\.view/);
  assert.match(dashboard, /busyAction === next\.busyAction/);
  assert.match(dashboard, /filteredStationFillingViews = useMemo/);
});

test("Ringkasan mengelompokkan Site unik berdasarkan Tipe Site parent", async () => {
  const [dashboard, summary] = await Promise.all([
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/admin-summary.ts", import.meta.url), "utf8"),
  ]);
  assert.match(summary, /seenSites = new Set/);
  assert.match(summary, /counts\.set\(site\.site_type_id/);
  assert.match(dashboard, /summarizeSitesByType\(sites, siteTypes\)/);
  assert.match(dashboard, /Site berdasarkan Tipe Site/);
  assert.doesNotMatch(dashboard, /siteSubtypes.*summarizeSitesByType/);
  const summaryResult = summarizeSitesByType([
    { id: "awos", site_type_id: "kat3" },
    { id: "awos", site_type_id: "kat3" },
    { id: "warehouse", site_type_id: "warehouse" },
    { id: "unmapped", site_type_id: "missing" },
  ], [
    { id: "kat3", name: "AWOS Kategori III" },
    { id: "warehouse", name: "Gudang" },
  ]);
  assert.deepEqual(summaryResult, {
    totalCount: 3,
    byType: [
      { id: "kat3", name: "AWOS Kategori III", count: 1 },
      { id: "warehouse", name: "Gudang", count: 1 },
      { id: "unmapped", name: "Belum terpetakan", count: 1 },
    ],
  });
});
