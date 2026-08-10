import type { DraftPayload } from "./server-draft.ts";
import { csvCell } from "./download.ts";
import { getItemUnits } from "./inventory.ts";
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
  "Kondisi", "Tahun Pasang", "Catatan",
] as const;

export type InventoryExportContext = {
  stationName: string;
  siteName: string;
  siteTypeName: string;
  subtypeName: string;
  profile: string;
  categories: string[];
  payload: DraftPayload;
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
    const items = context.payload.inventory[category] ?? [];
    const itemUnits = items.length
      ? items.flatMap((rawItem) => {
        const item = exportItem(rawItem, context.resolveItem);
        return getItemUnits(item).map((unit, index) => ({ item, unit, unitNumber: index + 1 }));
      })
      : [{ item: null, unit: null, unitNumber: null }];
    return itemUnits.map(({ item, unit, unitNumber }) => [
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
    ]);
  });
  return `\uFEFF${[INVENTORY_CSV_HEADERS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
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
    source: "site" as const,
    station: context.stationName,
    site: context.siteName,
    siteType: context.siteTypeName,
    subtype: context.subtypeName,
    runwayAzimuth: acceptsRunwayAzimuth ? context.payload.runwayAzimuth : null,
    siteMetadata: { ...automaticMetadata, ...EMPTY_SITE_METADATA, ...context.payload.siteMetadata },
    profile: context.profile,
    items: context.categories.map((category) => ({
      category,
      products: (context.payload.inventory[category] ?? []).map((item) => exportItem(item, context.resolveItem)),
    })),
  };
}
