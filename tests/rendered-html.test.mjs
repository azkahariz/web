import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { EMPTY_SITE_METADATA, resolveFieldDomain, siteMetadataCsvValues } from "../app/lib/site-metadata.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let serverUrl;

function getAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      probe.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function startNextServer() {
  const port = await getAvailablePort();
  const output = [];
  server = spawn(process.execPath, [
    resolve(projectRoot, "node_modules/next/dist/bin/next"),
    "start",
    "--hostname", "127.0.0.1",
    "--port", String(port),
  ], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => output.push(chunk.toString()));
  server.stderr.on("data", (chunk) => output.push(chunk.toString()));
  serverUrl = `http://127.0.0.1:${port}`;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`next start berhenti: ${output.join("")}`);
    try {
      const response = await fetch(serverUrl);
      if (response.ok) return;
    } catch {
      // Server masih melakukan inisialisasi.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`next start tidak siap: ${output.join("")}`);
}

before(startNextServer);
after(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill();
  await new Promise((resolveExit) => server.once("exit", resolveExit));
});

async function render() {
  return fetch(`${serverUrl}/`, { headers: { accept: "text/html" } });
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  cells.push(value);
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function profileForSubtype(subtype, barangByJenis) {
  if (barangByJenis[subtype]) return subtype;
  if (!subtype.startsWith("AWOS Kategori III")) return "";
  for (const suffix of ["End Point", "Station", "TDZ", "Mid"]) {
    if (subtype.endsWith(suffix)) return `AWOS ${suffix}`;
  }
  return "";
}

test("server merender gerbang autentikasi", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Aloptama Collect/);
  assert.ok(
    /Konfigurasi Supabase belum tersedia/i.test(html) || /Masuk untuk melanjutkan/i.test(html),
    "halaman awal harus menampilkan konfigurasi atau form login",
  );
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("data hasil CSV lengkap dan Water Level memiliki 17 kategori", async () => {
  const data = JSON.parse(await readFile(new URL("../app/data.generated.json", import.meta.url), "utf8"));
  const [stationCsv, siteSubtypeCsv, barangCsv, productCsv] = await Promise.all([
    readFile(new URL("../../Nama Stasiun.csv", import.meta.url), "utf8"),
    readFile(new URL("../../Jenis Site.csv", import.meta.url), "utf8"),
    readFile(new URL("../../Barang.csv", import.meta.url), "utf8"),
    readFile(new URL("../../products.csv", import.meta.url), "utf8"),
  ]);
  const stationRows = parseCsv(stationCsv);
  const siteSubtypeRows = parseCsv(siteSubtypeCsv);
  const barangRows = parseCsv(barangCsv);
  const barangByJenis = Object.groupBy(barangRows, (row) => row.Jenis);
  const expectedProductCount = new Set(
    parseCsv(productCsv)
      .map(({ Merk: brand, Tipe: model }) => `${brand.trim()}\u001f${model.trim()}`.toLocaleLowerCase("id-ID"))
      .filter((key) => !key.startsWith("\u001f") && !key.endsWith("\u001f")),
  ).size;
  const expectedWaterLevel = barangByJenis["Water Level"].map((row) => row["Barang Terpasang"]);

  const expectedStationSites = Array.from(new Map(stationRows.map((row) => [
    row.site_id || `${row["Nama Stasiun"]}\u001f${row["Nama Site"]}\u001f${row["Tipe Site"]}`,
    {
      station: row["Nama Stasiun"].trim(),
      site: row["Nama Site"].trim(),
      siteType: row["Tipe Site"].trim(),
    },
  ])).values());
  const expectedSiteSubtypes = siteSubtypeRows.map((row) => {
    const subtype = row["Sub Tipe Site"].trim();
    return {
      siteType: row["Tipe Site"].trim(),
      subtype,
      profile: row["Profil Barang"]?.trim() || profileForSubtype(subtype, data.barangByJenis),
    };
  });

  assert.deepEqual(data.stationSites.map(({ station, site, siteType }) => ({ station, site, siteType })), expectedStationSites);
  assert.deepEqual(data.siteSubtypes.map(({ siteType, subtype, profile }) => ({ siteType, subtype, profile })), expectedSiteSubtypes);
  assert.equal(
    new Set(data.stationSites.map((row) => row.station)).size,
    new Set(expectedStationSites.map((row) => row.station)).size,
  );
  assert.equal(data.products.length, expectedProductCount);
  assert.equal(expectedWaterLevel.length, 17);
  assert.deepEqual(data.barangByJenis["Water Level"], expectedWaterLevel);
  assert.ok(data.products.every((product) => product.brand.trim() && product.model.trim()));

  const usedSiteTypes = new Set(data.stationSites.map((row) => row.siteType));
  for (const siteType of usedSiteTypes) {
    const mappings = data.siteSubtypes.filter((row) => row.siteType === siteType);
    assert.ok(mappings.length > 0, `${siteType} tidak mempunyai subtipe`);
    assert.ok(
      mappings.every((row) => row.profile && data.barangByJenis[row.profile]?.length > 0),
      `${siteType} mempunyai subtipe tanpa profil Barang`,
    );
  }
  assert.equal(Object.keys(barangByJenis).length, Object.keys(data.barangByJenis).length);
});

test("stasiun dikunci dari akun dan site difilter memakai UUID stasiun", async () => {
  const source = await readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8");
  assert.match(source, /value=\{station\} readOnly/);
  assert.match(source, /row\.stationId === account\.stationId/);
  assert.doesNotMatch(source, /setStation\(/);
  assert.match(source, /aloptama \/ site/i);
});

test("pencarian gabungan menemukan nilai dari merek maupun tipe", async () => {
  const data = JSON.parse(await readFile(new URL("../app/data.generated.json", import.meta.url), "utf8"));
  const search = (query) => data.products.filter((product) =>
    `${product.brand} ${product.model}`.toLocaleLowerCase("id-ID").includes(query.toLocaleLowerCase("id-ID")),
  );
  assert.ok(search("Vaisala").some((product) => product.brand === "Vaisala"));
  assert.ok(search("Starlink").some((product) => /Starlink/i.test(product.model)));
});

test("aplikasi menyediakan ekspor CSV lengkap dengan BOM dan metadata", async () => {
  const [source, exportSource] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inventory-export.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /Unduh CSV/);
  assert.match(source, /download-options/);
  assert.match(exportSource, /\\uFEFF/);
  assert.match(exportSource, /"Stasiun"[\s\S]*"Azimuth Runway"[\s\S]*"Kategori Barang"[\s\S]*"Tipe Produk"[\s\S]*"Unit Ke"/);
  assert.match(exportSource, /items\.flatMap\(\(rawItem\)[\s\S]*getItemUnits\(item\)/);
});

test("kategori mounting memakai pilihan bahan dan tetap mendukung bahan lainnya", async () => {
  const [source, exportSource, inventoryLib, formOptions, barangCsv] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inventory-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inventory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/config/form-options.ts", import.meta.url), "utf8"),
    readFile(new URL("../../Barang.csv", import.meta.url), "utf8"),
  ]);
  const mountingCategories = parseCsv(barangCsv).filter((row) => /^mounting\b/i.test(row["Barang Terpasang"]));

  assert.ok(mountingCategories.length > 0);
  assert.match(inventoryLib, /function isMountingCategory[\s\S]*\^mounting\\b/i);
  assert.match(formOptions, /Besi galvanis[\s\S]*Stainless steel[\s\S]*Aluminium[\s\S]*Fiberglass/);
  assert.match(source, /Bahan lainnya/);
  assert.match(exportSource, /item\?\.itemKind === "material" \? item\.material/);
});

test("site AWOS kategori III membatasi subtipe berdasarkan keluarga pada nama site", async () => {
  const data = JSON.parse(await readFile(new URL("../app/data.generated.json", import.meta.url), "utf8"));
  const kat3Options = data.siteSubtypes.filter((row) => row.siteType === "AWOS Kategori III");
  const families = ["AllWeather", "Coastal", "Degreane", "Microstep", "Vaisala"];

  for (const family of families) {
    assert.equal(kat3Options.filter((row) => row.subtype.includes(` ${family} `)).length, 4);
  }

  const [source, subtypeLib] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/site-subtypes.ts", import.meta.url), "utf8"),
  ]);
  assert.match(subtypeLib, /function getAllowedSiteSubtypes/);
  assert.match(source, /getAllowedSiteSubtypes\(\{/);
});

test("azimuth runway hanya tersedia untuk TDZ dan End Point", async () => {
  const source = await readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8");
  assert.match(source, /acceptsRunwayAzimuth = \/\(\?:TDZ\|End Point\)\$\/i/);
  assert.match(source, /id="runway-azimuth"[\s\S]*maxLength=\{2\}/);
  assert.match(source, /runwayAzimuth: acceptsRunwayAzimuth \? runwayAzimuth : ""/);
});

test("jumlah produk membuat metadata terpisah untuk setiap unit", async () => {
  const [source, typeSource] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/types/inventory.ts", import.meta.url), "utf8"),
  ]);
  assert.match(typeSource, /type UnitDetail =/);
  assert.match(source, /function updateItemQuantity/);
  assert.match(source, /getItemUnits\(item\)\.map\(\(unit, unitIndex\)/);
  assert.match(source, />Unit \{unitIndex \+ 1\}</);
});

test("produk di luar daftar dapat ditambahkan dengan brand dan tipe", async () => {
  const source = await readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8");
  assert.match(source, /function addCustomProduct/);
  assert.match(source, />Brand<input[\s\S]*>Tipe<input/);
  assert.match(source, />Usulkan produk baru</);
});

test("metadata Aloptama tersimpan per site dan memakai nilai lokasi otomatis", async () => {
  const [source, metadataSource, metadataLib, formOptions, storageSource] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/SiteMetadataForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/site-metadata.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/config/form-options.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/draft-storage.ts", import.meta.url), "utf8"),
  ]);

  assert.match(source, /site-metadata::\$\{station\}::\$\{site\}/);
  assert.match(source, /stationName: station/);
  assert.match(source, /equipmentType: selectedSite\?\.siteType/);
  assert.match(source, /fieldDomain: resolveFieldDomain\(selectedSite\?\.siteType \?\? ""\)/);
  assert.match(source, /uptManager: station/);
  assert.match(source, /saveLocalDraft\([\s\S]*siteMetadataDrafts/);
  assert.match(storageSource, /localStorage\.setItem/);
  assert.match(metadataSource, /Nama Stasiun<input[^>]*value=\{automatic\.stationName\}[^>]*readOnly/);
  assert.match(metadataSource, /Equipment Type<input[^>]*value=\{automatic\.equipmentType\}[^>]*readOnly/);
  assert.match(metadataLib, /function resolveFieldDomain/);
  assert.match(formOptions, /FIELD_DOMAIN_SITE_TYPES[\s\S]*Meteorologi:[\s\S]*AWOS Kategori III[\s\S]*Radar Gematronik/);
  assert.match(formOptions, /Klimatologi:[\s\S]*AAWS[\s\S]*Digitalisasi Taman Alat Klimatologi/);
  assert.match(formOptions, /Geofisika:\s*\["Seismograph InaTEWS"\]/);
  assert.match(metadataLib, /FIELD_DOMAIN_SITE_TYPES\.Geofisika[\s\S]*return "Geofisika"/);
  assert.match(metadataLib, /FIELD_DOMAIN_SITE_TYPES\.Meteorologi[\s\S]*return "Meteorologi"[\s\S]*FIELD_DOMAIN_SITE_TYPES\.Klimatologi[\s\S]*return "Klimatologi"/);
  assert.equal(resolveFieldDomain("Seismograph InaTEWS"), "Geofisika");
  assert.equal(resolveFieldDomain("AWS Rekayasa"), "Meteorologi");
  assert.equal(resolveFieldDomain("AAWS"), "Klimatologi");
});

test("panduan ringkas tersedia untuk Station User dan Super Admin", async () => {
  const [stationApp, stationGuide, adminDashboard, adminGuide] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/panduan/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/panduan/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(stationApp, /href="\/panduan">Panduan</);
  assert.match(stationGuide, /Panduan ringkas pengisian Aloptama Collect/);
  assert.match(adminDashboard, /href="\/admin\/panduan">Panduan Super Admin</);
  assert.match(adminGuide, /createSupabaseServerClient/);
  assert.match(adminGuide, /super_admins/);
});

test("footer attribution memakai link eksternal yang aman pada layout utama", async () => {
  const [footer, stationApp, adminDashboard, login, accountProblem, styles] = await Promise.all([
    readFile(new URL("../app/components/FooterAttribution.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/LoginForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AccountProblem.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(footer, /Aplikasi ini dikembangkan oleh/);
  assert.match(footer, /href="https:\/\/azkahariz\.com\/"/);
  assert.match(footer, /target="_blank"/);
  assert.match(footer, /rel="noopener noreferrer"/);
  for (const source of [stationApp, adminDashboard, login, accountProblem]) assert.match(source, /FooterAttribution/);
  assert.match(styles, /\.auth-shell \{[^}]*display: flex;[^}]*justify-content: center/);
  assert.match(styles, /\.auth-shell > \.footer-attribution \{[^}]*margin-top: 14px/);
  assert.doesNotMatch(styles, /\.auth-shell \{[^}]*grid-template-rows/);
});

test("Vercel adalah deployment resmi dengan build Next.js native", async () => {
  const [packageText, readme, developerGuide, productionSop] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/PANDUAN-PENGEMBANG.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/SOP-PERUBAHAN-PRODUCTION.md", import.meta.url), "utf8"),
  ]);

  assert.match(packageText, /"dev": "next dev"/);
  assert.match(packageText, /"build": "next build"/);
  assert.match(packageText, /"start": "next start"/);
  assert.doesNotMatch(packageText, /legacy-sites|vinext|cloudflare|wrangler/i);
  for (const source of [readme, developerGuide, productionSop]) {
    assert.match(source, /https:\/\/aloptama-collect\.vercel\.app/);
  }
  assert.doesNotMatch(developerGuide, /legacy Sites compatibility/i);
});

test("form metadata menyediakan seluruh pilihan operasional dan komunikasi", async () => {
  const [source, formOptions] = await Promise.all([
    readFile(new URL("../app/SiteMetadataForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/config/form-options.ts", import.meta.url), "utf8"),
  ]);
  const expectedLabels = [
    "Sumber Anggaran Pemeliharaan", "Merk Pengadaan", "WIGOS ID", "AWS Center ID",
    "Status Kepemilikan", "Kode BMN (NUP)", "Tanggal Instalasi", "Status",
    "Alamat Detail", "Desa/Kelurahan", "Kecamatan", "Kab/Kota", "Nama Provinsi",
    "Nama Instansi Mitra", "Alamat Instansi", "Nama Penjaga", "No HP Penjaga",
    "Latitude", "Longitude", "Elevasi (meter)", "Metode Ukur", "Tanggal Ukur",
    "No SIM/GSM", "Metode Transport", "Zona Waktu", "Nama Teknisi", "No HP Teknisi",
    "Instansi Teknisi", "Mulai Interval", "Akhir Interval", "Interval Data (menit)",
  ];

  for (const label of expectedLabels) assert.match(source, new RegExp(label.replace(/[()]/g, "\\$&")));
  assert.match(formOptions, /OPERATIONAL[\s\S]*TRIAL[\s\S]*INACTIVE/);
  assert.match(formOptions, /OPERATIONAL[\s\S]*TRIAL[\s\S]*INACTIVE[\s\S]*RETIRED/);
  assert.match(formOptions, /SITE_CONDITION_OPTIONS[\s\S]*Baik[\s\S]*Rusak/);
  assert.match(formOptions, /WAREHOUSE_CONDITION_OPTIONS[\s\S]*\["Baik"\]/);
  assert.match(formOptions, /Survey Barometric[\s\S]*Lainnya/);
  assert.match(source, /Metode Ukur Lainnya/);
  assert.match(formOptions, /MQTT[\s\S]*HTTP POST[\s\S]*FTP[\s\S]*TCP\/IP Direct/);
  assert.match(formOptions, /WIB \(UTC\+7\)[\s\S]*WITA \(UTC\+8\)[\s\S]*WIT \(UTC\+9\)/);
  assert.match(formOptions, /value: "1", label: "1 Menit"[\s\S]*value: "60", label: "60 Menit"[\s\S]*Lainnya/);
  assert.match(source, /transportMethods\.includes\(method\)/);
  assert.match(source, /Gunakan titik sebagai pemisah desimal/);
});

test("Metode Ukur Lainnya diekspor sebagai nilai manual aktual", () => {
  const values = siteMetadataCsvValues({
    ...EMPTY_SITE_METADATA,
    measurementMethod: "Lainnya",
    measurementMethodOther: "Theodolite",
  }, {
    stationName: "Stasiun A",
    siteName: "Site A",
    equipmentType: "AWS",
    fieldDomain: "Klimatologi",
    uptManager: "Stasiun A",
  });
  assert.equal(values[26], "Theodolite");
});

test("metadata Aloptama ikut dalam ekspor JSON dan CSV", async () => {
  const [source, metadataSource, exportSource] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/site-metadata.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inventory-export.ts", import.meta.url), "utf8"),
  ]);

  assert.match(source, /buildInventoryJson/);
  assert.match(exportSource, /siteMetadata: context\.warehouseMode \? null : \{ \.\.\.automaticMetadata/);
  assert.match(exportSource, /\.\.\.SITE_METADATA_CSV_HEADERS/);
  assert.match(exportSource, /\.\.\.metadataCells/);
  assert.match(metadataSource, /export const SITE_METADATA_CSV_HEADERS/);
  assert.match(metadataSource, /value\.transportMethods\.join\("; "\)/);
});

test("wilayah administratif memakai wilayah.id secara bertingkat dan menyimpan kode wilayah", async () => {
  const [source, regionHook, metadataLib, routeSource] = await Promise.all([
    readFile(new URL("../app/SiteMetadataForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useRegionOptions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/site-metadata.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/regions/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(regionHook, /REGION_API_ROUTE = "\/api\/regions"/);
  assert.match(regionHook, /encodeURIComponent\(path\)/);
  assert.match(routeSource, /https:\/\/wilayah\.id\/api/);
  assert.match(routeSource, /ALLOWED_PATH/);
  assert.match(routeSource, /Cache-Control/);
  assert.match(source, /useRegionOptions\("\/provinces\.json"/);
  assert.match(source, /`\/regencies\/\$\{normalizedProvinceCode\}\.json`/);
  assert.match(source, /`\/districts\/\$\{normalizedCityCode\}\.json`/);
  assert.match(source, /`\/villages\/\$\{normalizedDistrictCode\}\.json`/);
  assert.match(regionHook, /function normalizeRegionCode/);
  assert.match(source, /provinceCode:[\s\S]*cityCode:[\s\S]*districtCode:[\s\S]*villageCode:/);
  assert.match(source, /cityCode: "", city: "", districtCode: "", district: "", villageCode: "", village: ""/);
  assert.match(source, /Data wilayah belum dapat dimuat/);
  assert.match(source, /Coba lagi/);
  assert.match(source, /Input manual/);
  assert.match(metadataLib, /"Kode Provinsi"[\s\S]*"Kode Kab\/Kota"[\s\S]*"Kode Kecamatan"[\s\S]*"Kode Desa\/Kelurahan"/);
});
