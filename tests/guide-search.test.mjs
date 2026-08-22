import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  GUIDE_SEARCH_RESULT_LIMIT,
  normalizeGuideSearchText,
  rankGuideSearchItems,
} from "../app/lib/guide-search.ts";

const stationGuideUrl = new URL("../app/panduan/page.tsx", import.meta.url);
const adminGuideUrl = new URL("../app/admin/panduan/page.tsx", import.meta.url);

function plainText(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGuideItems(source) {
  const sections = [...source.matchAll(/<section id="([^"]+)"/g)];
  return sections.map((match, order) => {
    const start = match.index;
    const nextSection = sections[order + 1]?.index ?? Number.POSITIVE_INFINITY;
    const updates = source.indexOf("<GuideUpdatesSection", start);
    const end = Math.min(nextSection, updates >= 0 ? updates : Number.POSITIVE_INFINITY, source.length);
    const block = source.slice(start, end);
    const openingTag = block.slice(0, block.indexOf(">") + 1);
    const title = plainText(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    const category = plainText(block.match(/className="guide-section-label"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
    const subheadings = [...block.matchAll(/<(?:h4|dt)[^>]*>([\s\S]*?)<\/(?:h4|dt)>/g)].map((heading) => plainText(heading[1]));
    const keywordMatch = openingTag.match(/data-guide-keywords="([^"]*)"/);
    const taskMatch = source.match(new RegExp(`\\["([^"]+)", "#${match[1]}", "([^"]+)"\\]`));
    return {
      id: match[1],
      title,
      category,
      subheadings,
      body: plainText(block),
      keywords: keywordMatch?.[1] ?? "",
      taskText: taskMatch ? `${taskMatch[1]} ${taskMatch[2]}` : "",
      order,
    };
  });
}

function expectTopResult(items, query, expectedId) {
  const results = rankGuideSearchItems(items, query);
  assert.ok(results.length > 0, `Expected a result for ${query}`);
  assert.equal(results[0].id, expectedId, `Unexpected top result for ${query}`);
  return results;
}

test("Station Guide menemukan istilah pekerjaan dan bahasa umum", async () => {
  const items = extractGuideItems(await readFile(stationGuideUrl, "utf8"));
  expectTopResult(items, "serial", "kategori-dan-unit");
  expectTopResult(items, "gudang", "gudang");
  expectTopResult(items, "produk tidak ada", "produk");
  expectTopResult(items, "data sedang diedit", "penyimpanan");
  expectTopResult(items, "csv", "unduh-data");
  expectTopResult(items, "subtipe", "lokasi-pengisian");
  expectTopResult(items, "barang di gudang", "gudang");
});

test("Admin Guide menemukan tindakan Produk, Submission, dan sistem", async () => {
  const items = extractGuideItems(await readFile(adminGuideUrl, "utf8"));
  expectTopResult(items, "QC", "qc-produk");
  expectTopResult(items, "pindahkan", "pindahkan-referensi");
  expectTopResult(items, "produk sama", "menggabungkan-produk");
  expectTopResult(items, "hapus permanen", "produk-tidak-digunakan");
  expectTopResult(items, "alias", "alias-riwayat");
  expectTopResult(items, "audit", "audit-admin");
  expectTopResult(items, "lock", "lock");
  const zeroReferences = rankGuideSearchItems(items, "0 referensi");
  assert.ok(zeroReferences.some((result) => result.id === "penggunaan-produk"));
  assert.ok(zeroReferences.some((result) => result.id === "produk-tidak-digunakan"));
});

test("ranking memprioritaskan judul lalu keyword sebelum body", () => {
  const base = { category: "", subheadings: [], taskText: "" };
  const items = [
    { ...base, id: "body", title: "Topik lain", body: "Cara menghapus produk.", keywords: "", order: 0 },
    { ...base, id: "keyword", title: "Produk lama", body: "Penjelasan.", keywords: "hapus produk", order: 1 },
    { ...base, id: "title", title: "Hapus Produk", body: "Penjelasan.", keywords: "", order: 2 },
  ];
  assert.deepEqual(rankGuideSearchItems(items, "hapus produk").map((item) => item.id), ["title", "keyword", "body"]);
});

test("matching toleran kapital, tanda baca, dan query beberapa kata", () => {
  const items = [{
    id: "site-subtipe", title: "Site dan Subtipe", category: "", subheadings: [],
    body: "Periksa konfigurasi Site dan Subtipe.", keywords: "family AWOS", taskText: "", order: 0,
  }];
  assert.equal(normalizeGuideSearchText("  SITE / Subtipe!  "), "site subtipe");
  assert.equal(rankGuideSearchItems(items, "SiTe, SUBTIPE")[0]?.id, "site-subtipe");
  assert.equal(rankGuideSearchItems(items, "family awos")[0]?.id, "site-subtipe");
});

test("hasil dibatasi dan urutannya deterministic", () => {
  const items = Array.from({ length: 12 }, (_, order) => ({
    id: `item-${order}`, title: `Produk ${order}`, category: "", subheadings: [],
    body: "Panduan Produk", keywords: "", taskText: "", order,
  }));
  const results = rankGuideSearchItems(items, "produk");
  assert.equal(results.length, GUIDE_SEARCH_RESULT_LIMIT);
  assert.deepEqual(results.map((item) => item.id), Array.from({ length: GUIDE_SEARCH_RESULT_LIMIT }, (_, index) => `item-${index}`));
});

test("query tanpa kecocokan menghasilkan daftar kosong", async () => {
  const items = extractGuideItems(await readFile(stationGuideUrl, "utf8"));
  assert.deepEqual(rankGuideSearchItems(items, "xyzabc123"), []);
});

test("index Station dan Admin terisolasi serta seluruh target memiliki anchor", async () => {
  const stationItems = extractGuideItems(await readFile(stationGuideUrl, "utf8"));
  const adminItems = extractGuideItems(await readFile(adminGuideUrl, "utf8"));
  assert.equal(rankGuideSearchItems(stationItems, "hapus permanen produk").some((item) => item.id === "produk-tidak-digunakan"), false);
  assert.equal(rankGuideSearchItems(adminItems, "barang di gudang").some((item) => item.id === "gudang"), false);
  for (const items of [stationItems, adminItems]) {
    const anchors = new Set(items.map((item) => item.id));
    for (const query of ["produk", "site", "simpan", "audit", "lock"]) {
      for (const result of rankGuideSearchItems(items, query)) assert.ok(anchors.has(result.id));
    }
  }
});

test("GuideSearch memakai index DOM shared, link native, dan state aksesibel", async () => {
  const source = await readFile(new URL("../app/components/GuideSearch.tsx", import.meta.url), "utf8");
  assert.match(source, /querySelectorAll<HTMLElement>\("section\[id\]"\)/);
  assert.match(source, /dataset\.guideKeywords/);
  assert.match(source, /href={`#\$\{result\.id\}`}/);
  assert.match(source, /role="search"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-label="Hapus pencarian"/);
  assert.match(source, /Tidak menemukan panduan yang sesuai/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|fetch\(|\/api\//);
});
