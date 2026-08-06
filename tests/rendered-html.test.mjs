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
  const productCsv = await readFile(
    new URL("../../List Barang Terpasang_Group By Stamet - products.csv", import.meta.url),
    "utf8",
  );
  const expectedProductCount = new Set(
    productCsv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => {
        const [brand, model] = parseCsvLine(line);
        return `${brand.trim()}\u001f${model.trim()}`.toLocaleLowerCase("id-ID");
      })
      .filter((key) => !key.startsWith("\u001f") && !key.endsWith("\u001f")),
  ).size;
  const expectedWaterLevel = [
    "Adaptor", "Arrester", "Boks Panel", "Data Akuisisi", "Kabel Data",
    "Mounting Sensor Pasut", "Pengolah Data", "Penyimpanan", "Regulator",
    "Sensor Tekanan Udara", "Sensor Pasut", "Modem Komunikasi",
    "SIstem Catu Daya Tidak Terputus", "Solar Panel", "Mounting Sensor Hujan",
    "Proteksi Petir", "Sensor Hujan",
  ];

  assert.equal(new Set(data.stationSites.map((row) => row.station)).size, 116);
  assert.equal(data.stationSites.length, 277);
  assert.equal(data.products.length, expectedProductCount);
  assert.deepEqual(data.barangByJenis["Water Level"], expectedWaterLevel);
  assert.ok(data.products.every((product) => product.brand.trim() && product.model.trim()));
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
  assert.match(source, /"Stasiun"[\s\S]*"Kategori Barang"[\s\S]*"Tipe Produk"/);
  assert.match(source, /inventory\[category\]\?\.length[\s\S]*:\s*\[null\]/);
});
