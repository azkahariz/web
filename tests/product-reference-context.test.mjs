import assert from "node:assert/strict";
import test from "node:test";
import { formatReferenceContext, referenceCategorySummary } from "../app/lib/product-reference-context.ts";

test("format context referensi menyatukan Site, tipe, subtype, dan kategori tanpa separator kosong", () => {
  assert.equal(formatReferenceContext({
    siteName: "AAWS Sumbawa",
    siteTypeName: "AAWS",
    siteSubtypeName: "AAWS",
    categories: ["Sensor Suhu Udara"],
  }), "AAWS Sumbawa \u00b7 AAWS \u00b7 AAWS \u00b7 Sensor Suhu Udara");
  assert.equal(formatReferenceContext({ siteName: "AAWS Sumbawa", siteTypeName: "AAWS", siteSubtypeName: "AAWS", categories: [] }), "AAWS Sumbawa \u00b7 AAWS \u00b7 AAWS");
});

test("ringkasan kategori referensi dideduplikasi dan dipadatkan", () => {
  assert.equal(referenceCategorySummary(["Sensor Suhu", "Sensor Angin", "Sensor Suhu"]), "Sensor Suhu, Sensor Angin");
  assert.equal(referenceCategorySummary(["A", "B", "C", "D"]), "A, B, C +1 lainnya");
});
