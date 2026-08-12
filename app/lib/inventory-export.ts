import type { DraftPayload } from "./server-draft.ts";
import { csvCell } from "./download.ts";
import { getItemUnits } from "./inventory.ts";
import { getItemFunctionCategories, inventoryCategoryEntries } from "./category-functions.ts";
import {
  EMPTY_SITE_METADATA,
  SITE_METADATA_CSV_HEADERS,
  resolveFieldDomain,
  siteMetadataCsvValues,
} from "./site-metadata.ts";
import type { InstalledItem } from "../types/inventory.ts";

export const INVENTORY_CSV_HEADERS = [
  "Stasiun", "Site", "Tipe Site", "Subtipe Site", "Azimuth Runway", ...SITE_METADATA_CSV_HEADERS, "Profil Barang",
  "Kategori Barang", "Bahan Mounting", "Merk", "Tipe Produk", "Unit Ke", "Nomor Seri", "Jumlah",
  "Kondisi", "Tahun Pasang", "Catatan", "ID Unit Fisik", "Fungsi Sensor",
] as const;

export const WAREHOUSE_CSV_HEADERS = [
  "Stasiun/Balai", "Site", "Tipe Site", "Subtipe Site", "Profil Barang", "Kategori Barang",
  "Fungsi Sensor", "Merk", "Tipe Produk", "ID Unit Fisik", "Nomor Seri", "Jumlah", "Kondisi",
  "Tahun Pengadaan", "Nama Kegiatan Pengadaan", "Catatan",
] as const;

export type InventoryExportContext = {
  stationName: string;
  siteName: string;
  siteTypeName: string;
  subtypeName: string;
  profile: string;
  categories: string[];
  payload: DraftPayload;
  warehouseMode?: boolean;
  resolveItem?: (item: InstalledItem) => InstalledItem;
};

export function createDefaultDraftPayload(stationId: string, siteId: string, siteSubtypeId: string): DraftPayload {
  return {
    schemaVersion: 1,
    stationId,
    siteId,
    siteSubtypeId,
    inventory: {},
    runwayAzimuth: "",
    siteMetadata: { ...EMPTY_SITE_METADATA },
  };
}

function exportItem(item: InstalledItem, resolveItem?: InventoryExportContext["resolveItem"]) {
  return resolveItem ? resolveItem(item) : item;
}

export function buildInventoryCsv(context: InventoryExportContext) {
  if (context.warehouseMode) return buildWarehouseCsv(context);
  const metadata = { ...EMPTY_SITE_METADATA, ...context.payload.siteMetadata };
  const automaticMetadata = {
    stationName: context.stationName,
    siteName: context.siteName,
    equipmentType: context.siteTypeName,
    fieldDomain: resolveFieldDomain(context.siteTypeName),
    uptManager: context.stationName,
  };
  const metadataCells = siteMetadataCsvValues(metadata, automaticMetadata);
  const acceptsRunwayAzimuth = /(?:TDZ|End Point)$/i.test(context.subtypeName);
  const rows = context.categories.flatMap((category) => {
    const entries = inventoryCategoryEntries(context.payload.inventory, category);
    const itemUnits = entries.length
      ? entries.flatMap(({ storageCategory, item: rawItem }) => {
        const item = exportItem(rawItem, context.resolveItem);
        return getItemUnits(item).map((unit, index) => ({
          item,
          unit,
          unitNumber: index + 1,
          functions: getItemFunctionCategories(item, storageCategory),
        }));
      })
      : [{ item: null, unit: null, unitNumber: null, functions: [] }];
    return itemUnits.map(({ item, unit, unitNumber, functions }) => [
      context.stationName,
      context.siteName,
      context.siteTypeName,
      context.subtypeName,
      acceptsRunwayAzimuth ? context.payload.runwayAzimuth : "",
      ...metadataCells,
      context.profile,
      category,
      item?.itemKind === "material" ? item.material ?? "" : "",
      item?.itemKind === "material" ? "" : item?.brand ?? "",
      item?.itemKind === "material" ? "" : item?.model ?? "",
      unitNumber ?? "",
      item?.itemKind === "material" ? "" : unit?.serialNumber ?? "",
      unit ? 1 : "",
      unit?.condition ?? "",
      unit?.installedYear ?? "",
      unit?.notes ?? "",
      unit?.id ?? "",
      functions.join("; "),
    ]);
  });
  return `\uFEFF${[INVENTORY_CSV_HEADERS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

function buildWarehouseCsv(context: InventoryExportContext) {
  const rows = context.categories.flatMap((category) => {
    const entries = inventoryCategoryEntries(context.payload.inventory, category);
    const itemUnits = entries.length ? entries.flatMap(({ storageCategory, item: rawItem }) => {
      const item = exportItem(rawItem, context.resolveItem);
      return getItemUnits(item).map((unit) => ({
        item,
        unit,
        functions: getItemFunctionCategories(item, storageCategory),
      }));
    }) : [{ item: null, unit: null, functions: [] }];
    return itemUnits.map(({ item, unit, functions }) => [
      context.stationName,
      context.siteName,
      context.siteTypeName,
      context.subtypeName,
      context.profile,
      category,
      functions.join("; "),
      item?.itemKind === "material" ? "" : item?.brand ?? "",
      item?.itemKind === "material" ? item?.material ?? "" : item?.model ?? "",
      unit?.id ?? "",
      item?.itemKind === "material" ? "" : unit?.serialNumber ?? "",
      unit ? 1 : "",
      unit?.condition ?? "",
      unit?.procurementYear ?? "",
      unit?.procurementActivity ?? "",
      unit?.notes ?? "",
    ]);
  });
  return `\uFEFF${[WAREHOUSE_CSV_HEADERS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function buildInventoryJson(context: InventoryExportContext, exportedAt = new Date().toISOString()) {
  const acceptsRunwayAzimuth = /(?:TDZ|End Point)$/i.test(context.subtypeName);
  const automaticMetadata = {
    stationName: context.stationName,
    siteName: context.siteName,
    equipmentType: context.siteTypeName,
    fieldDomain: resolveFieldDomain(context.siteTypeName),
    uptManager: context.stationName,
  };
  return {
    exportedAt,
    source: context.warehouseMode ? "warehouse" as const : "site" as const,
    station: context.stationName,
    site: context.siteName,
    siteType: context.siteTypeName,
    subtype: context.subtypeName,
    runwayAzimuth: acceptsRunwayAzimuth ? context.payload.runwayAzimuth : null,
    siteMetadata: context.warehouseMode ? null : { ...automaticMetadata, ...EMPTY_SITE_METADATA, ...context.payload.siteMetadata },
    profile: context.profile,
    items: context.categories.map((category) => ({
      category,
      products: (context.payload.inventory[category] ?? []).map((item) => exportItem(item, context.resolveItem)),
    })),
    physicalUnits: Object.entries(context.payload.inventory).flatMap(([storageCategory, items]) => items.flatMap((rawItem) => {
      const item = exportItem(rawItem, context.resolveItem);
      return getItemUnits(item).map((unit) => ({
        physicalUnitId: unit.id,
        functionCategories: getItemFunctionCategories(item, storageCategory),
        brand: item.itemKind === "material" ? null : item.brand,
        model: item.itemKind === "material" ? null : item.model,
        material: item.itemKind === "material" ? item.material ?? null : null,
        serialNumber: item.itemKind === "material" ? null : unit.serialNumber,
        condition: unit.condition,
        installedYear: context.warehouseMode ? null : unit.installedYear,
        procurementYear: context.warehouseMode ? unit.procurementYear ?? "" : null,
        procurementActivity: context.warehouseMode ? unit.procurementActivity ?? "" : null,
        notes: unit.notes,
      }));
    })),
  };
}
