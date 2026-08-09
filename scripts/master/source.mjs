import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SOURCE_FILES = {
  stations: "Nama Stasiun.csv",
  subtypes: "Jenis Site.csv",
  profileItems: "Barang.csv",
  productCategories: "product_categories.csv",
  products: "products.csv",
};

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function naturalText(value) {
  return normalizeText(value).toLocaleLowerCase("id-ID");
}

function entityKey(...parts) {
  return parts.map(naturalText).join("\u001f");
}

function optionalUuid(row, column, context) {
  const value = normalizeText(row[column]);
  if (!value) return undefined;
  if (!UUID_PATTERN.test(value)) throw new Error(`${context}: ${column} bukan UUID valid: ${value}`);
  return value.toLowerCase();
}

function optionalActive(row, column, context) {
  if (!Object.prototype.hasOwnProperty.call(row, column)) return undefined;
  const value = normalizeText(row[column]);
  if (!value) return undefined;
  if (["true", "1", "ya", "aktif"].includes(value.toLowerCase())) return true;
  if (["false", "0", "tidak", "nonaktif"].includes(value.toLowerCase())) return false;
  throw new Error(`${context}: ${column} harus TRUE atau FALSE.`);
}

function requireText(row, column, context) {
  const value = normalizeText(row[column]);
  if (!value) throw new Error(`${context}: kolom ${column} wajib diisi.`);
  return value;
}

function createRegistry(label) {
  return { label, rows: [], byKey: new Map(), bySourceId: new Map() };
}

function addEntity(registry, candidate, relationFields = []) {
  let entity = registry.byKey.get(candidate.key);
  if (!entity) {
    entity = { ...candidate, active: candidate.active ?? true, resolvedId: undefined };
    registry.byKey.set(candidate.key, entity);
    registry.rows.push(entity);
  } else {
    for (const field of relationFields) {
      if (candidate[field] && entity[field] !== candidate[field]) {
        throw new Error(`${registry.label}: relasi ${field} tidak konsisten untuk ${candidate.label}.`);
      }
    }
    if (candidate.sourceId && entity.sourceId && candidate.sourceId !== entity.sourceId) {
      throw new Error(`${registry.label}: UUID berbeda untuk natural key ${candidate.label}.`);
    }
    if (candidate.active !== undefined && entity.active !== candidate.active) {
      throw new Error(`${registry.label}: status aktif tidak konsisten untuk ${candidate.label}.`);
    }
    entity.sourceId ??= candidate.sourceId;
  }

  if (candidate.sourceId) {
    const sameId = registry.bySourceId.get(candidate.sourceId);
    if (sameId && sameId !== entity) {
      throw new Error(`${registry.label}: UUID ${candidate.sourceId} dipakai oleh lebih dari satu record.`);
    }
    registry.bySourceId.set(candidate.sourceId, entity);
  }
  return entity;
}

async function locateSourceFile(sourceRoot, suffix) {
  const names = await readdir(sourceRoot);
  const matches = names.filter((name) => name.endsWith(suffix));
  if (matches.length !== 1) {
    throw new Error(`Harus ada tepat satu CSV dengan akhiran ${suffix}; ditemukan ${matches.length}.`);
  }
  return path.join(sourceRoot, matches[0]);
}

async function readCsv(filePath) {
  const text = await readFile(filePath, "utf8");
  return parse(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: false,
  });
}

function requireCompleteSyncedColumns(rows, fileLabel, idColumns, requiredColumns) {
  const headers = new Set(Object.keys(rows[0] ?? {}));
  if (!idColumns.some((column) => headers.has(column))) return;
  const missing = requiredColumns.filter((column) => !headers.has(column));
  if (missing.length) {
    throw new Error(`${fileLabel}: kolom UUID sudah ada tetapi kolom hasil sync belum lengkap: ${missing.join(", ")}. Import kembali file .synced.csv secara utuh.`);
  }
}

function resolveProfileName(subtype, profiles) {
  if (profiles.byKey.has(entityKey(subtype))) return subtype;
  if (!subtype.startsWith("AWOS Kategori III")) return "";
  for (const suffix of ["End Point", "Station", "TDZ", "Mid"]) {
    if (subtype.endsWith(suffix)) return `AWOS ${suffix}`;
  }
  return "";
}

export async function loadMasterSource(sourceRoot) {
  const paths = Object.fromEntries(
    await Promise.all(Object.entries(SOURCE_FILES).map(async ([key, suffix]) => [key, await locateSourceFile(sourceRoot, suffix)])),
  );
  const csv = Object.fromEntries(
    await Promise.all(Object.entries(paths).map(async ([key, filePath]) => [key, await readCsv(filePath)])),
  );

  requireCompleteSyncedColumns(csv.stations, "Nama Stasiun.csv",
    ["station_id", "site_id", "site_type_id"],
    ["station_id", "station_active", "site_id", "site_active", "site_type_id", "site_type_active"]);
  requireCompleteSyncedColumns(csv.subtypes, "Jenis Site.csv",
    ["site_type_id", "site_subtype_id", "item_profile_id"],
    ["site_type_id", "site_type_active", "site_subtype_id", "site_subtype_active", "item_profile_id", "Profil Barang"]);
  requireCompleteSyncedColumns(csv.profileItems, "Barang.csv",
    ["item_profile_id", "item_id", "profile_item_id"],
    ["item_profile_id", "item_profile_active", "item_id", "item_active", "profile_item_id", "mapping_active"]);
  requireCompleteSyncedColumns(csv.productCategories, "product_categories.csv",
    ["product_category_id"], ["product_category_id", "active"]);
  requireCompleteSyncedColumns(csv.products, "products.csv",
    ["product_id"], ["product_id", "active"]);

  const registries = {
    stations: createRegistry("Stations"),
    siteTypes: createRegistry("Site types"),
    sites: createRegistry("Sites"),
    itemProfiles: createRegistry("Item profiles"),
    siteSubtypes: createRegistry("Site subtypes"),
    items: createRegistry("Items"),
    profileItems: createRegistry("Profile-item mappings"),
    productCategories: createRegistry("Product categories"),
    products: createRegistry("Products"),
  };

  const profileItemRows = csv.profileItems.map((raw, index) => {
    const context = `Barang.csv baris ${index + 2}`;
    const profileName = requireText(raw, "Jenis", context);
    const itemName = requireText(raw, "Barang Terpasang", context);
    const profile = addEntity(registries.itemProfiles, {
      key: entityKey(profileName), label: profileName, name: profileName,
      sourceId: optionalUuid(raw, "item_profile_id", context),
      active: optionalActive(raw, "item_profile_active", context),
    });
    const item = addEntity(registries.items, {
      key: entityKey(itemName), label: itemName, name: itemName,
      sourceId: optionalUuid(raw, "item_id", context),
      active: optionalActive(raw, "item_active", context),
    });
    const mapping = addEntity(registries.profileItems, {
      key: `${profile.key}\u001f${item.key}`, label: `${profileName} -> ${itemName}`,
      profile, item,
      sourceId: optionalUuid(raw, "profile_item_id", context),
      active: optionalActive(raw, "mapping_active", context),
    }, ["profile", "item"]);
    return { raw, profile, item, mapping };
  });

  const stationRows = csv.stations.map((raw, index) => {
    const context = `Nama Stasiun.csv baris ${index + 2}`;
    const stationName = requireText(raw, "Nama Stasiun", context);
    const siteName = requireText(raw, "Nama Site", context);
    const siteTypeName = requireText(raw, "Tipe Site", context);
    const station = addEntity(registries.stations, {
      key: entityKey(stationName), label: stationName, name: stationName,
      sourceId: optionalUuid(raw, "station_id", context),
      active: optionalActive(raw, "station_active", context),
    });
    const siteType = addEntity(registries.siteTypes, {
      key: entityKey(siteTypeName), label: siteTypeName, name: siteTypeName,
      sourceId: optionalUuid(raw, "site_type_id", context),
      active: optionalActive(raw, "site_type_active", context),
    });
    const site = addEntity(registries.sites, {
      key: `${station.key}\u001f${entityKey(siteName)}`, label: `${stationName} -> ${siteName}`,
      name: siteName, station, siteType,
      sourceId: optionalUuid(raw, "site_id", context),
      active: optionalActive(raw, "site_active", context),
    }, ["station", "siteType"]);
    return { raw, station, site, siteType };
  });

  const subtypeRows = csv.subtypes.map((raw, index) => {
    const context = `Jenis Site.csv baris ${index + 2}`;
    const siteTypeName = requireText(raw, "Tipe Site", context);
    const subtypeName = requireText(raw, "Sub Tipe Site", context);
    const siteType = addEntity(registries.siteTypes, {
      key: entityKey(siteTypeName), label: siteTypeName, name: siteTypeName,
      sourceId: optionalUuid(raw, "site_type_id", context),
      active: optionalActive(raw, "site_type_active", context),
    });
    const explicitProfile = normalizeText(raw["Profil Barang"]);
    const profileName = explicitProfile || resolveProfileName(subtypeName, registries.itemProfiles);
    let profile = null;
    if (profileName) {
      profile = registries.itemProfiles.byKey.get(entityKey(profileName));
      if (!profile) throw new Error(`${context}: profil Barang tidak ditemukan: ${profileName}`);
      const profileId = optionalUuid(raw, "item_profile_id", context);
      if (profileId) addEntity(registries.itemProfiles, { ...profile, sourceId: profileId });
    } else if (normalizeText(raw.item_profile_id)) {
      throw new Error(`${context}: item_profile_id ada tetapi Profil Barang kosong.`);
    }
    const subtype = addEntity(registries.siteSubtypes, {
      key: `${siteType.key}\u001f${entityKey(subtypeName)}`, label: `${siteTypeName} -> ${subtypeName}`,
      name: subtypeName, siteType, profile,
      sourceId: optionalUuid(raw, "site_subtype_id", context),
      active: optionalActive(raw, "site_subtype_active", context),
    }, ["siteType", "profile"]);
    return { raw, siteType, subtype, profile };
  });

  const productCategoryRows = csv.productCategories.map((raw, index) => {
    const context = `product_categories.csv baris ${index + 2}`;
    const name = requireText(raw, "product_categories", context);
    const category = addEntity(registries.productCategories, {
      key: entityKey(name), label: name, name,
      sourceId: optionalUuid(raw, "product_category_id", context),
      active: optionalActive(raw, "active", context),
    });
    return { raw, category };
  });

  const productRows = csv.products.map((raw, index) => {
    const context = `products.csv baris ${index + 2}`;
    const brand = requireText(raw, "Merk", context);
    const model = requireText(raw, "Tipe", context);
    const product = addEntity(registries.products, {
      key: entityKey(brand, model), label: `${brand} / ${model}`, brand, model,
      sourceId: optionalUuid(raw, "product_id", context),
      active: optionalActive(raw, "active", context),
    });
    return { raw, product };
  });

  return {
    sourceRoot,
    paths,
    registries,
    sourceRows: { stationRows, subtypeRows, profileItemRows, productCategoryRows, productRows },
  };
}

function requireResolved(entity, label) {
  if (!entity?.resolvedId) throw new Error(`UUID hasil sync belum tersedia untuk ${label}.`);
  return entity.resolvedId;
}

export async function writeSyncedCsv(model, outputRoot) {
  await mkdir(outputRoot, { recursive: true });
  const outputs = [
    {
      source: model.paths.stations,
      columns: ["station_id", "Nama Stasiun", "station_active", "site_id", "Nama Site", "site_active", "site_type_id", "Tipe Site", "site_type_active"],
      rows: model.sourceRows.stationRows.map(({ station, site, siteType }) => ({
        station_id: requireResolved(station, station.label), "Nama Stasiun": station.name, station_active: station.active,
        site_id: requireResolved(site, site.label), "Nama Site": site.name, site_active: site.active,
        site_type_id: requireResolved(siteType, siteType.label), "Tipe Site": siteType.name, site_type_active: siteType.active,
      })),
    },
    {
      source: model.paths.subtypes,
      columns: ["site_type_id", "Tipe Site", "site_type_active", "site_subtype_id", "Sub Tipe Site", "site_subtype_active", "item_profile_id", "Profil Barang"],
      rows: model.sourceRows.subtypeRows.map(({ siteType, subtype, profile }) => ({
        site_type_id: requireResolved(siteType, siteType.label), "Tipe Site": siteType.name, site_type_active: siteType.active,
        site_subtype_id: requireResolved(subtype, subtype.label), "Sub Tipe Site": subtype.name, site_subtype_active: subtype.active,
        item_profile_id: profile ? requireResolved(profile, profile.label) : "", "Profil Barang": profile?.name ?? "",
      })),
    },
    {
      source: model.paths.profileItems,
      columns: ["item_profile_id", "Jenis", "item_profile_active", "item_id", "Barang Terpasang", "item_active", "profile_item_id", "mapping_active"],
      rows: model.sourceRows.profileItemRows.map(({ profile, item, mapping }) => ({
        item_profile_id: requireResolved(profile, profile.label), Jenis: profile.name, item_profile_active: profile.active,
        item_id: requireResolved(item, item.label), "Barang Terpasang": item.name, item_active: item.active,
        profile_item_id: requireResolved(mapping, mapping.label), mapping_active: mapping.active,
      })),
    },
    {
      source: model.paths.productCategories,
      columns: ["product_category_id", "product_categories", "active"],
      rows: model.sourceRows.productCategoryRows.map(({ category }) => ({
        product_category_id: requireResolved(category, category.label), product_categories: category.name, active: category.active,
      })),
    },
    {
      source: model.paths.products,
      columns: ["product_id", "Merk", "Tipe", "active"],
      rows: model.sourceRows.productRows.map(({ product }) => ({
        product_id: requireResolved(product, product.label), Merk: product.brand, Tipe: product.model, active: product.active,
      })),
    },
  ];

  const written = [];
  for (const output of outputs) {
    const parsed = path.parse(output.source);
    const target = path.join(outputRoot, `${parsed.name}.synced.csv`);
    const csvText = stringify(output.rows, { header: true, columns: output.columns, record_delimiter: "windows" });
    await writeFile(target, `\uFEFF${csvText}`, "utf8");
    written.push(target);
  }
  return written;
}

export function sourceCounts(model) {
  return Object.fromEntries(Object.entries(model.registries).map(([key, registry]) => [key, registry.rows.length]));
}

export function assignTestIds(model) {
  let counter = 1;
  for (const registry of Object.values(model.registries)) {
    for (const entity of registry.rows) {
      entity.resolvedId = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
      counter += 1;
    }
  }
}
