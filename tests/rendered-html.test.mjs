import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
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
    readFile(new URL("../../List Barang Terpasang - Nama Stasiun.csv", import.meta.url), "utf8"),
    readFile(new URL("../../List Barang Terpasang - Jenis Site.csv", import.meta.url), "utf8"),
    readFile(new URL("../../List Barang Terpasang - Barang.csv", import.meta.url), "utf8"),
    readFile(new URL("../../List Barang Terpasang - products.csv", import.meta.url), "utf8"),
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
  const expectedWaterLevel = [
    "Adaptor", "Arrester", "Boks Panel", "Data Akuisisi", "Kabel Data",
    "Mounting Sensor Pasut", "Pengolah Data", "Penyimpanan", "Regulator",
    "Sensor Tekanan Udara", "Sensor Pasut", "Modem Komunikasi",
    "SIstem Catu Daya Tidak Terputus", "Solar Panel", "Mounting Sensor Hujan",
    "Proteksi Petir", "Sensor Hujan",
  ];

  const expectedStationSites = stationRows.map((row) => ({
    station: row["Nama Stasiun"].trim(),
    site: row["Nama Site"].trim(),
    siteType: row["Tipe Site"].trim(),
  }));
  const expectedSiteSubtypes = siteSubtypeRows.map((row) => {
    const subtype = row["Sub Tipe Site"].trim();
    return {
      siteType: row["Tipe Site"].trim(),
      subtype,
      profile: profileForSubtype(subtype, data.barangByJenis),
    };
  });

  assert.deepEqual(data.stationSites.map(({ station, site, siteType }) => ({ station, site, siteType })), expectedStationSites);
  assert.deepEqual(data.siteSubtypes.map(({ siteType, subtype, profile }) => ({ siteType, subtype, profile })), expectedSiteSubtypes);
  assert.equal(
    new Set(data.stationSites.map((row) => row.station)).size,
    new Set(expectedStationSites.map((row) => row.station)).size,
  );
  assert.equal(data.products.length, expectedProductCount);
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
  const source = await readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8");
  assert.match(source, /Unduh CSV/);
  assert.match(source, /download-options/);
  assert.match(source, /\\uFEFF/);
  assert.match(source, /"Stasiun"[\s\S]*"Azimuth Runway"[\s\S]*"Kategori Barang"[\s\S]*"Tipe Produk"[\s\S]*"Unit Ke"/);
  assert.match(source, /items\.flatMap\(\(rawItem\)[\s\S]*getItemUnits\(item\)/);
});

test("kategori mounting memakai pilihan bahan dan tetap mendukung bahan lainnya", async () => {
  const [source, inventoryLib, formOptions, barangCsv] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inventory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/config/form-options.ts", import.meta.url), "utf8"),
    readFile(new URL("../../List Barang Terpasang - Barang.csv", import.meta.url), "utf8"),
  ]);
  const mountingCategories = parseCsv(barangCsv).filter((row) => /^mounting\b/i.test(row["Barang Terpasang"]));

  assert.ok(mountingCategories.length > 0);
  assert.match(inventoryLib, /function isMountingCategory[\s\S]*\^mounting\\b/i);
  assert.match(formOptions, /Besi galvanis[\s\S]*Stainless steel[\s\S]*Aluminium[\s\S]*Fiberglass/);
  assert.match(source, /Bahan lainnya/);
  assert.match(source, /item\?\.itemKind === "material" \? item\.material/);
});

test("site AWOS kategori III membatasi subtipe berdasarkan keluarga pada nama site", async () => {
  const data = JSON.parse(await readFile(new URL("../app/data.generated.json", import.meta.url), "utf8"));
  const kat3Options = data.siteSubtypes.filter((row) => row.siteType === "AWOS Kategori III");
  const families = ["AllWeather", "Coastal", "Degreane", "Microstep"];

  for (const family of families) {
    assert.equal(kat3Options.filter((row) => row.subtype.includes(` ${family} `)).length, 4);
  }

  const [source, inventoryLib] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inventory.ts", import.meta.url), "utf8"),
  ]);
  assert.match(inventoryLib, /function inferKat3Family/);
  assert.match(source, /allSubtypeOptions\.filter\(\(row\) => row\.subtype\.includes\(` \$\{kat3Family\} `\)\)/);
});

test("azimuth runway hanya tersedia untuk TDZ dan End Point", async () => {
  const source = await readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8");
  assert.match(source, /acceptsRunwayAzimuth = \/\(\?:TDZ\|End Point\)\$\/i/);
  assert.match(source, /id="runway-azimuth"[\s\S]*maxLength=\{2\}/);
  assert.match(source, /runwayAzimuth: mode === "site" && acceptsRunwayAzimuth/);
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
  assert.match(metadataSource, /Nama Stasiun<input value=\{automatic\.stationName\} readOnly/);
  assert.match(metadataSource, /Equipment Type<input value=\{automatic\.equipmentType\} readOnly/);
  assert.match(metadataLib, /function resolveFieldDomain/);
  assert.match(formOptions, /FIELD_DOMAIN_SITE_TYPES[\s\S]*Meteorologi:[\s\S]*AWOS Kategori III[\s\S]*Radar Gematronik/);
  assert.match(formOptions, /Klimatologi:[\s\S]*AAWS[\s\S]*Digitalisasi Taman Alat Klimatologi/);
});

test("form metadata menyediakan seluruh pilihan operasional dan komunikasi", async () => {
  const [source, formOptions] = await Promise.all([
    readFile(new URL("../app/SiteMetadataForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/config/form-options.ts", import.meta.url), "utf8"),
  ]);
  const expectedLabels = [
    "Sumber Anggaran Pemeliharaan", "Merk Pengadaan", "WIGOS ID", "AWS Center ID",
    "Status Kepemilikan", "Kode BMN (NUP)", "Tanggal Instalasi", "Status Operasional",
    "Alamat Detail", "Desa/Kelurahan", "Kecamatan", "Kab/Kota", "Nama Provinsi",
    "Nama Instansi Mitra", "Alamat Instansi", "Nama Penjaga", "No HP Penjaga",
    "Latitude", "Longitude", "Elevasi (meter)", "Metode Ukur", "Tanggal Ukur",
    "No SIM/GSM", "Metode Transport", "Zona Waktu", "Nama Teknisi", "No HP Teknisi",
    "Instansi Teknisi", "Mulai Interval", "Akhir Interval", "Interval Data (menit)",
  ];

  for (const label of expectedLabels) assert.match(source, new RegExp(label.replace(/[()]/g, "\\$&")));
  assert.match(formOptions, /OPERATIONAL[\s\S]*TRIAL[\s\S]*INACTIVE[\s\S]*RETIRED/);
  assert.match(formOptions, /MQTT[\s\S]*HTTP POST[\s\S]*FTP[\s\S]*TCP\/IP Direct/);
  assert.match(formOptions, /WIB \(UTC\+7\)[\s\S]*WITA \(UTC\+8\)[\s\S]*WIT \(UTC\+9\)/);
  assert.match(formOptions, /value: "1", label: "1 Menit"[\s\S]*value: "60", label: "60 Menit"[\s\S]*Lainnya/);
  assert.match(source, /transportMethods\.includes\(method\)/);
  assert.match(source, /Gunakan titik sebagai pemisah desimal/);
});

test("metadata Aloptama ikut dalam ekspor JSON dan CSV", async () => {
  const [source, metadataSource] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/site-metadata.ts", import.meta.url), "utf8"),
  ]);

  assert.match(source, /siteMetadata: mode === "site"/);
  assert.match(source, /\.\.\.SITE_METADATA_CSV_HEADERS/);
  assert.match(source, /\.\.\.siteMetadataCells/);
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
