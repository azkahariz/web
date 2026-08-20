import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { rankProductMergeTargets } from "../app/lib/product-merge-recommendations.ts";
import { rankMergeProducts } from "../app/lib/product-qc.ts";

const products = [
  { id: "cr6-source", brand: "Campbell Scientific", model: "Datalogger CR6", active: true },
  { id: "cr6", brand: "Campbell Scientific", model: "CR6", active: true },
  { id: "cr1000x", brand: "Campbell Scientific", model: "CR1000X", active: true },
  { id: "young-source", brand: "R. M. Young", model: "Sensor Arah dan Kecepatan Angin 5106", active: true },
  { id: "young-target", brand: "R. M. Young", model: "Marine Wind Monitor 05106", active: true },
  { id: "inactive-exact", brand: "Campbell Scientific", model: "Datalogger CR6", active: false },
  { id: "merged-exact", brand: "Campbell Scientific", model: "Datalogger CR6", active: true, mergedIntoProductId: "cr6" },
  { id: "vaisala", brand: "Vaisala", model: "HMP155", active: true },
];

test("Product Merge memakai ranking core QC yang sama setelah eligibility filter", () => {
  const source = products[0];
  const eligible = products.filter((candidate) => candidate.id !== source.id && candidate.active && !candidate.mergedIntoProductId);
  const qcCore = rankMergeProducts([{ proposedBrand: source.brand, proposedModel: source.model }], eligible);
  const mergeRanks = rankProductMergeTargets(source, products);
  assert.deepEqual(mergeRanks, qcCore);
  assert.equal(mergeRanks[0]?.product.id, "cr6");
  assert.equal(mergeRanks[0]?.confidence, "Sangat mirip");
  assert.ok(!mergeRanks.some((candidate) => candidate.product.id === source.id));
  assert.ok(!mergeRanks.some((candidate) => candidate.product.id === "inactive-exact"));
  assert.ok(!mergeRanks.some((candidate) => candidate.product.id === "merged-exact"));
});

test("fixture CR6 dan R. M. Young mengikuti hasil metode existing tanpa hard-code scoring", () => {
  const cr6 = rankProductMergeTargets(products[0], products);
  assert.equal(cr6[0]?.product.id, "cr6");
  assert.equal(cr6[0]?.confidence, "Sangat mirip");
  const young = rankProductMergeTargets(products[3], products);
  assert.equal(young[0]?.product.id, "young-target");
  assert.equal(young[0]?.confidence, "Sangat mirip");
});

test("alias existing ikut ranking dan kategori tidak menjadi input identity", () => {
  const source = { id: "legacy-source", brand: "Vaisalla", model: "HMP 155", active: true, functionCategories: ["Sensor Angin"] };
  const aliases = [{ productId: "vaisala", brand: "Vaisalla", model: "HMP 155" }];
  const withCategory = rankProductMergeTargets(source, products, aliases);
  const withoutCategory = rankProductMergeTargets({ id: source.id, brand: source.brand, model: source.model }, products, aliases);
  assert.deepEqual(withCategory, withoutCategory);
  assert.equal(withCategory[0]?.product.id, "vaisala");
});

test("endpoint dan dialog recommendation tetap opsional serta tidak mengubah mutation Phase 3", async () => {
  const [route, dialog, helper, migration] = await Promise.all([
    readFile(new URL("../app/api/admin/products/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/ProductMergeDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/product-merge-recommendations.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260824120000_product_merge.sql", import.meta.url), "utf8"),
  ]);
  assert.match(route, /rankProductMergeTargets/);
  assert.match(route, /recommendationSourceId/);
  assert.match(route, /product_aliases/);
  assert.match(route, /\.eq\("active", true\)/);
  assert.match(route, /\.slice\(0, 3\)/);
  assert.match(helper, /rankMergeProducts/);
  assert.doesNotMatch(helper, /functionCategories|category|site|submission/i);
  assert.match(dialog, /Rekomendasi Produk Tujuan/);
  assert.match(dialog, /Cari Produk lain/);
  assert.match(dialog, /Rekomendasi tidak dapat dimuat\. Cari Produk tujuan secara manual\./);
  assert.match(dialog, /Mencari Produk yang mirip/);
  assert.match(dialog, /aria-pressed/);
  assert.match(dialog, /recommendationIds/);
  assert.doesNotMatch(dialog, /localStorage|sessionStorage/);
  assert.match(migration, /p_preflight_token <> v_plan ->> 'preflightToken'/);
});
