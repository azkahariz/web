import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { stringify } from "csv-stringify/sync";
import { queryMaster, resolveDatabaseTarget } from "./export-master-csv.mjs";
import { loadMasterSource, sourceCounts } from "./master/source.mjs";

const SOURCE_COLUMNS = {
  stations: [
    "station_id", "Nama Stasiun", "station_active", "site_id", "Nama Site", "site_active",
    "site_type_id", "Tipe Site", "site_type_active", ...Array.from({ length: 21 }, (_, index) => `Column ${index + 1}`),
  ],
  subtypes: ["site_type_id", "Tipe Site", "site_type_active", "site_subtype_id", "Sub Tipe Site", "site_subtype_active", "item_profile_id", "Profil Barang"],
  profileItems: ["item_profile_id", "Jenis", "item_profile_active", "item_id", "Barang Terpasang", "item_active", "profile_item_id", "mapping_active"],
  productCategories: ["product_category_id", "product_categories", "active"],
  products: ["product_id", "Merk", "Tipe", "active"],
};

const SOURCE_FILES = [
  ["Nama Stasiun.csv", "stations"],
  ["Jenis Site.csv", "subtypes"],
  ["Barang.csv", "profileItems"],
  ["product_categories.csv", "productCategories"],
  ["products.csv", "products"],
];

function flag(value) {
  return value === null || value === undefined || value === "" ? "" : value ? "1" : "0";
}

function sortRows(rows, ...keys) {
  return [...rows].sort((left, right) => keys.map((key) => String(left[key] ?? "").localeCompare(String(right[key] ?? ""), "id-ID", { sensitivity: "base" })).find((result) => result !== 0) ?? 0);
}

function sourceRows(data) {
  const stations = sortRows(data.sites, "Nama Stasiun", "Nama Site", "site_id").map((site) => ({
    station_id: site.station_id,
    "Nama Stasiun": site["Nama Stasiun"],
    station_active: flag(site.station_active),
    site_id: site.site_id,
    "Nama Site": site["Nama Site"],
    site_active: flag(site.site_active),
    site_type_id: site.site_type_id,
    "Tipe Site": site["Tipe Site"],
    site_type_active: flag(site.site_type_active),
  }));
  const subtypes = sortRows(data.siteSubtypes, "Tipe Site", "Sub Tipe Site", "site_subtype_id").map((row) => ({
    site_type_id: row.site_type_id,
    "Tipe Site": row["Tipe Site"],
    site_type_active: flag(row.site_type_active),
    site_subtype_id: row.site_subtype_id,
    "Sub Tipe Site": row["Sub Tipe Site"],
    site_subtype_active: flag(row.site_subtype_active),
    item_profile_id: row.item_profile_id ?? "",
    "Profil Barang": row["Tipe Site"] === "Gudang" ? "Gudang" : row["Profil Barang"] ?? "",
  }));
  const profileItems = sortRows(data.profileItems, "Jenis", "Barang Terpasang", "profile_item_id").map((row) => ({
    item_profile_id: row.item_profile_id,
    Jenis: row.Jenis,
    item_profile_active: flag(row.item_profile_active),
    item_id: row.item_id,
    "Barang Terpasang": row["Barang Terpasang"],
    item_active: flag(row.item_active),
    profile_item_id: row.profile_item_id,
    mapping_active: flag(row.mapping_active),
  }));
  return {
    stations,
    subtypes,
    profileItems,
    productCategories: sortRows(data.productCategories, "product_categories", "product_category_id").map((row) => ({
      product_category_id: row.product_category_id,
      product_categories: row.product_categories,
      active: flag(row.active),
    })),
    products: sortRows(data.products, "Merk", "Tipe", "product_id").map((row) => ({
      product_id: row.product_id,
      Merk: row.Merk,
      Tipe: row.Tipe,
      active: flag(row.active),
    })),
  };
}

async function writeSourceCsv(rows, outputRoot) {
  await mkdir(outputRoot, { recursive: true });
  for (const [filename, key] of SOURCE_FILES) {
    const text = stringify(rows[key], { header: true, columns: SOURCE_COLUMNS[key], record_delimiter: "windows" });
    await writeFile(path.join(outputRoot, filename), text, "utf8");
  }
}

function assertRoundTrip(generated, counts) {
  const actual = {
    stations: generated.stationSites?.reduce((set, row) => set.add(row.stationId), new Set()).size,
    sites: generated.stationSites?.length,
    siteTypes: new Set((generated.siteSubtypes ?? []).map((row) => row.siteTypeId ?? row.siteType)).size,
    siteSubtypes: generated.siteSubtypes?.length,
    itemProfiles: Object.keys(generated.barangByJenis ?? {}).length,
    items: new Set(Object.values(generated.barangByJenis ?? {}).flat()).size,
    profileItems: generated.master?.profileItems?.length,
    productCategories: generated.master?.productCategories?.length,
    products: generated.products?.length,
  };
  for (const [key, expected] of Object.entries(counts)) {
    if (actual[key] !== expected) throw new Error(`Round-trip ${key} berbeda: source=${expected}, generated=${actual[key]}.`);
  }
}

async function validateRoundTrip(outputRoot, counts) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "aloptama-source-export-"));
  try {
    await Promise.all(SOURCE_FILES.map(([filename]) => cp(path.join(outputRoot, filename), path.join(tempRoot, filename))));
    const generatedPath = path.join(tempRoot, "data.generated.json");
    const result = spawnSync("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.resolve("scripts/generate-data.ps1"),
      "-InputRoot", tempRoot, "-GeneratedOutput", generatedPath,
    ], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || "generator gagal.");
    const generated = JSON.parse(await readFile(generatedPath, "utf8"));
    assertRoundTrip(generated, counts);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const { label, url } = resolveDatabaseTarget("remote");
  if (label !== "REMOTE") throw new Error("Source export hanya boleh memakai database REMOTE.");
  const outputRoot = path.resolve("exports/source");
  const parsedUrl = new URL(url);
  const sql = postgres(url, { max: 1, prepare: false, ssl: ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) ? false : "require", connect_timeout: 15 });
  try {
    console.log("Exporting SOURCE-FORMAT master from REMOTE Supabase (read-only)...");
    const data = await sql.begin(async (tx) => {
      await tx`set transaction read only`;
      return queryMaster(tx);
    });
    const rows = sourceRows(data);
    await writeSourceCsv(rows, outputRoot);
    const model = await loadMasterSource(outputRoot);
    await validateRoundTrip(outputRoot, sourceCounts(model));
    for (const [filename, key] of SOURCE_FILES) console.log(`${filename.padEnd(28)} ${String(rows[key].length).padStart(5)} rows`);
    console.log(`Output: ${path.relative(process.cwd(), outputRoot)}\nRound-trip validation: PASS`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export { SOURCE_COLUMNS, SOURCE_FILES, assertRoundTrip, sourceRows, writeSourceCsv };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nSOURCE EXPORT FAILED\n${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
