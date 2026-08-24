import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CANONICAL_POWER_CATEGORY,
  LEGACY_POWER_CATEGORY,
  LEGACY_POWER_CATEGORY_ITEM_ID,
  canonicalCategoryName,
  categoryNamesEquivalent,
  normalizeInventoryCategoryKeys,
} from "../app/lib/category-identity.ts";
import { inventoryCategoryEntries, inventoryCategoryNames } from "../app/lib/category-functions.ts";

const product = (id) => ({ id, brand: "Vaisala", model: id, quantity: 1 });

test("alias kategori tetap terikat pada UUID dan nama master canonical", () => {
  assert.equal(LEGACY_POWER_CATEGORY_ITEM_ID, "58c2e908-fa5d-4b08-830b-746ecd65b612");
  assert.equal(canonicalCategoryName(LEGACY_POWER_CATEGORY), CANONICAL_POWER_CATEGORY);
  assert.equal(categoryNamesEquivalent(LEGACY_POWER_CATEGORY, CANONICAL_POWER_CATEGORY), true);
  assert.equal(canonicalCategoryName("Sensor Suhu Udara"), "Sensor Suhu Udara");
});

test("payload legacy, canonical, dan gabungan dibaca tanpa kehilangan item atau double-count", () => {
  const legacy = { [LEGACY_POWER_CATEGORY]: [product("legacy")] };
  const canonical = { [CANONICAL_POWER_CATEGORY]: [product("canonical")] };
  const both = {
    [LEGACY_POWER_CATEGORY]: [product("same"), product("legacy-only")],
    [CANONICAL_POWER_CATEGORY]: [product("same"), product("canonical-only")],
  };

  assert.deepEqual(inventoryCategoryNames(legacy), [CANONICAL_POWER_CATEGORY]);
  assert.deepEqual(inventoryCategoryNames(canonical), [CANONICAL_POWER_CATEGORY]);
  assert.equal(inventoryCategoryEntries(legacy, CANONICAL_POWER_CATEGORY).length, 1);
  assert.equal(inventoryCategoryEntries(canonical, CANONICAL_POWER_CATEGORY).length, 1);

  const normalized = normalizeInventoryCategoryKeys(both);
  assert.deepEqual(Object.keys(normalized), [CANONICAL_POWER_CATEGORY]);
  assert.deepEqual(normalized[CANONICAL_POWER_CATEGORY].map((item) => item.id), ["same", "legacy-only", "canonical-only"]);
  assert.equal(inventoryCategoryEntries(normalized, CANONICAL_POWER_CATEGORY).length, 3);
});

test("SQL completion menormalkan alias sempit sebelum coverage dan tetap tanpa mutation", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260829120000_legacy_category_alias_compatibility.sql", import.meta.url), "utf8");
  assert.match(migration, /58c2e908-fa5d-4b08-830b-746ecd65b612/);
  assert.match(migration, /SIstem Catu Daya Tidak Terputus/);
  assert.match(migration, /Sistem Catu Daya Tidak Terputus/);
  assert.match(migration, /submission_category_canonical_label\(function_category\.name\)/);
  assert.match(migration, /submission_category_canonical_label\(p_item_name\)/);
  assert.doesNotMatch(migration, /\b(insert|update|delete)\b/i);
});
