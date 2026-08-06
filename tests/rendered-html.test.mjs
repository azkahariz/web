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

test("server merender aplikasi inventaris lokal", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /IRM Collect/);
  assert.match(html, /Inventaris Barang Terpasang/i);
  assert.match(html, /Berdasarkan site/);
  assert.match(html, /Coba jenis langsung/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("data hasil CSV lengkap dan Water Level memiliki 17 kategori", async () => {
  const data = JSON.parse(await readFile(new URL("../app/data.generated.json", import.meta.url), "utf8"));
  const [stationCsv, siteSubtypeCsv, barangCsv, productCsv] = await Promise.all([
    readFile(new URL("../../List Barang Terpasang_Group By Stamet - Nama Stasiun.csv", import.meta.url), "utf8"),
    readFile(new URL("../../List Barang Terpasang_Group By Stamet - Jenis Site.csv", import.meta.url), "utf8"),
    readFile(new URL("../../List Barang Terpasang_Group By Stamet - Barang.csv", import.meta.url), "utf8"),
    readFile(new URL("../../List Barang Terpasang_Group By Stamet - products.csv", import.meta.url), "utf8"),
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

  assert.deepEqual(data.stationSites, expectedStationSites);
  assert.deepEqual(data.siteSubtypes, expectedSiteSubtypes);
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

test("pemilih stasiun tidak membatasi daftar hanya pada hasil awal", async () => {
  const source = await readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /stationSuggestions[\s\S]{0,400}\.slice\(/);
  assert.match(source, /stationSuggestions\.length\}\s*stasiun ditemukan/);
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
  assert.match(source, /Unduh hasil CSV/);
  assert.match(source, /\\uFEFF/);
  assert.match(source, /"Stasiun"[\s\S]*"Kategori Barang"[\s\S]*"Bahan Mounting"[\s\S]*"Tipe Produk"/);
  assert.match(source, /inventory\[category\]\?\.length[\s\S]*:\s*\[null\]/);
});

test("kategori mounting memakai pilihan bahan dan tetap mendukung bahan lainnya", async () => {
  const [source, barangCsv] = await Promise.all([
    readFile(new URL("../app/InventoryApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../List Barang Terpasang_Group By Stamet - Barang.csv", import.meta.url), "utf8"),
  ]);
  const mountingCategories = parseCsv(barangCsv).filter((row) => /^mounting\b/i.test(row["Barang Terpasang"]));

  assert.ok(mountingCategories.length > 0);
  assert.match(source, /function isMountingCategory[\s\S]*\^mounting\\b/i);
  assert.match(source, /Besi galvanis[\s\S]*Stainless steel[\s\S]*Aluminium[\s\S]*Fiberglass/);
  assert.match(source, /Bahan lainnya/);
  assert.match(source, /item\?\.itemKind === "material" \? item\.material/);
});
