import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { stringify } from "csv-stringify/sync";

const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const TABLE_SPECS = [
  ["stations", "stations", "station_id"],
  ["sites", "sites", "site_id"],
  ["site_types", "siteTypes", "site_type_id"],
  ["site_subtypes", "siteSubtypes", "site_subtype_id"],
  ["item_profiles", "itemProfiles", "item_profile_id"],
  ["items", "items", "item_id"],
  ["profile_items", "profileItems", "profile_item_id"],
  ["product_categories", "productCategories", "product_category_id"],
  ["products", "products", "product_id"],
];

const EXPORT_DEFINITIONS = [
  ["stations.csv", "stations", ["station_id", "Nama Stasiun", "station_active"]],
  ["sites.csv", "sites", ["site_id", "Nama Site", "station_id", "Nama Stasiun", "site_type_id", "Tipe Site", "site_active", "station_active", "site_type_active"]],
  ["site_types.csv", "siteTypes", ["site_type_id", "Tipe Site", "active"]],
  ["site_subtypes.csv", "siteSubtypes", ["site_subtype_id", "Sub Tipe Site", "site_type_id", "Tipe Site", "item_profile_id", "Profil Barang", "site_subtype_active", "site_type_active", "item_profile_active"]],
  ["item_profiles.csv", "itemProfiles", ["item_profile_id", "Profil Barang", "active"]],
  ["items.csv", "items", ["item_id", "Barang Terpasang", "active"]],
  ["profile_items.csv", "profileItems", ["profile_item_id", "item_profile_id", "Jenis", "Profil Barang", "item_id", "Barang Terpasang", "mapping_active", "item_profile_active", "item_active"]],
  ["product_categories.csv", "productCategories", ["product_category_id", "product_categories", "active"]],
  ["products.csv", "products", ["product_id", "Merk", "Tipe", "active", "source_origin", "spreadsheet_synced"]],
  ["nama-stasiun.csv", null, ["station_id", "Nama Stasiun", "station_active", "site_id", "Nama Site", "site_active", "site_type_id", "Tipe Site", "site_type_active", "site_subtype_id", "Sub Tipe Site", "site_subtype_active", "item_profile_id", "Profil Barang"]],
];

function parseArgs(argv) {
  const targetIndex = argv.indexOf("--target");
  const target = targetIndex === -1 ? "local" : argv[targetIndex + 1];
  if (!["local", "remote"].includes(target)) throw new Error("--target harus local atau remote.");
  const outputIndex = argv.indexOf("--output");
  if (outputIndex === -1) return { target, output: "exports/master" };
  const output = argv[outputIndex + 1];
  if (!output || output.startsWith("--")) throw new Error("--output membutuhkan folder tujuan.");
  return { target, output };
}

function resolveDatabaseTarget(target, environment = process.env) {
  if (target === "local") {
    return { label: "LOCAL", url: DEFAULT_DATABASE_URL };
  }
  const url = environment.SUPABASE_DB_POOLER_URL?.trim() || environment.SUPABASE_DB_URL?.trim();
  if (!url) throw new Error("SUPABASE_DB_URL remote tidak tersedia. Tambahkan ke .env.local atau set environment variable secara eksplisit.");
  const parsed = new URL(url);
  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("SUPABASE_DB_URL remote harus menunjuk database remote, bukan Supabase lokal.");
  }
  return { label: "REMOTE", url };
}

function assertUnique(rows, idColumn, label) {
  const ids = new Set(rows.map((row) => row[idColumn]));
  if (ids.size !== rows.length) throw new Error(`${label}: duplicate ${idColumn} ditemukan.`);
}

function assertForeignKeys(rows, idColumn, referencedIds, label) {
  for (const row of rows) {
    if (row[idColumn] !== null && !referencedIds.has(row[idColumn])) {
      throw new Error(`${label}: FK ${idColumn} ${row[idColumn]} tidak ditemukan.`);
    }
  }
}

function csv(rows, columns) {
  return `\uFEFF${stringify(rows, { header: true, columns, record_delimiter: "windows" })}`;
}

async function queryMaster(tx) {
  const [stations, siteTypes, sites, siteSubtypes, itemProfiles, items, profileItems, productCategories, products] = await Promise.all([
    tx`select id as station_id, name as "Nama Stasiun", active as station_active
       from public.stations order by lower(name), id`,
    tx`select id as site_type_id, name as "Tipe Site", active
       from public.site_types order by lower(name), id`,
    tx`select site.id as site_id, site.name as "Nama Site", site.station_id,
              station.name as "Nama Stasiun", site.site_type_id, site_type.name as "Tipe Site",
              site.active as site_active, station.active as station_active,
              site_type.active as site_type_active
       from public.sites as site
       join public.stations as station on station.id = site.station_id
       join public.site_types as site_type on site_type.id = site.site_type_id
       order by lower(station.name), lower(site.name), site.id`,
    tx`select subtype.id as site_subtype_id, subtype.name as "Sub Tipe Site", subtype.site_type_id,
              site_type.name as "Tipe Site", subtype.item_profile_id, profile.name as "Profil Barang",
              subtype.active as site_subtype_active, site_type.active as site_type_active,
              profile.active as item_profile_active
       from public.site_subtypes as subtype
       join public.site_types as site_type on site_type.id = subtype.site_type_id
       left join public.item_profiles as profile on profile.id = subtype.item_profile_id
       order by lower(site_type.name), lower(subtype.name), subtype.id`,
    tx`select id as item_profile_id, name as "Profil Barang", active
       from public.item_profiles order by lower(name), id`,
    tx`select id as item_id, name as "Barang Terpasang", active
       from public.items order by lower(name), id`,
    tx`select mapping.id as profile_item_id, mapping.item_profile_id, profile.name as "Profil Barang",
              mapping.item_id, item.name as "Barang Terpasang", mapping.active as mapping_active,
              profile.name as "Jenis",
              profile.active as item_profile_active, item.active as item_active
       from public.profile_items as mapping
       join public.item_profiles as profile on profile.id = mapping.item_profile_id
       join public.items as item on item.id = mapping.item_id
       order by lower(profile.name), lower(item.name), mapping.id`,
    tx`select id as product_category_id, name as product_categories, active
       from public.product_categories order by lower(name), id`,
    tx`select id as product_id, brand as "Merk", model as "Tipe", active,
              source_origin, spreadsheet_synced
       from public.products order by lower(brand), lower(model), id`,
  ]);
  return { stations, siteTypes, sites, siteSubtypes, itemProfiles, items, profileItems, productCategories, products };
}

function validateMaster(data) {
  const ids = Object.fromEntries(TABLE_SPECS.map(([table, key, idColumn]) => {
    const rows = data[key];
    if (!rows) throw new Error(`${table}: hasil query tidak tersedia.`);
    assertUnique(rows, idColumn, table);
    return [table, new Set(rows.map((row) => row[idColumn]))];
  }));
  assertForeignKeys(data.sites, "station_id", ids.stations, "sites");
  assertForeignKeys(data.sites, "site_type_id", ids.site_types, "sites");
  assertForeignKeys(data.siteSubtypes, "site_type_id", ids.site_types, "site_subtypes");
  assertForeignKeys(data.siteSubtypes, "item_profile_id", ids.item_profiles, "site_subtypes");
  assertForeignKeys(data.profileItems, "item_profile_id", ids.item_profiles, "profile_items");
  assertForeignKeys(data.profileItems, "item_id", ids.items, "profile_items");
}

function combinedRows(data) {
  const siteSubtypes = new Map(data.siteSubtypes.map((row) => [row.site_type_id, []]));
  for (const row of data.siteSubtypes) siteSubtypes.get(row.site_type_id)?.push(row);
  return data.sites.flatMap((site) => (siteSubtypes.get(site.site_type_id)?.length ? siteSubtypes.get(site.site_type_id) : [null]).map((subtype) => ({
    station_id: site.station_id,
    "Nama Stasiun": site["Nama Stasiun"],
    station_active: site.station_active,
    site_id: site.site_id,
    "Nama Site": site["Nama Site"],
    site_active: site.site_active,
    site_type_id: site.site_type_id,
    "Tipe Site": site["Tipe Site"],
    site_type_active: site.site_type_active,
    site_subtype_id: subtype?.site_subtype_id ?? "",
    "Sub Tipe Site": subtype?.["Sub Tipe Site"] ?? "",
    site_subtype_active: subtype?.site_subtype_active ?? "",
    item_profile_id: subtype?.item_profile_id ?? "",
    "Profil Barang": subtype?.["Profil Barang"] ?? "",
  })));
}

async function main() {
  const { target, output } = parseArgs(process.argv.slice(2));
  const outputRoot = path.resolve(process.cwd(), output);
  const { label, url: databaseUrl } = resolveDatabaseTarget(target);
  const parsedUrl = new URL(databaseUrl);
  const isLocal = ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
  const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: isLocal ? false : "require", connect_timeout: 15 });

  try {
    console.log(`Exporting master from ${label} Supabase (read-only)...`);
    const data = await sql.begin(async (tx) => {
      await tx`set transaction read only`;
      return queryMaster(tx);
    });
    validateMaster(data);
    const outputs = EXPORT_DEFINITIONS.map(([filename, key, columns]) => [
      filename,
      key ? data[key] : combinedRows(data),
      columns,
    ]);
    await mkdir(outputRoot, { recursive: true });
    for (const [filename, rows, columns] of outputs) {
      const target = path.join(outputRoot, filename);
      await writeFile(target, csv(rows, columns), "utf8");
      console.log(`${filename.padEnd(22)} ${String(rows.length).padStart(5)}`);
    }
    console.log(`\nOutput: ${path.relative(process.cwd(), outputRoot) || "."}\n\nPASS`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export { DEFAULT_DATABASE_URL, EXPORT_DEFINITIONS, combinedRows, csv, parseArgs, queryMaster, resolveDatabaseTarget, validateMaster };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nMASTER EXPORT FAILED\n${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
