import type { SiteMetadata } from "./site-metadata";

export type StationSite = { station: string; site: string; siteType: string };
export type SiteSubtype = { siteType: string; subtype: string; profile: string };
export type Product = { brand: string; model: string };

export type DataSet = {
  stationSites: StationSite[];
  siteSubtypes: SiteSubtype[];
  barangByJenis: Record<string, string[]>;
  products: Product[];
};

export type Condition = "Baik" | "Rusak ringan" | "Rusak" | "Tidak beroperasi";

export type UnitDetail = {
  id: string;
  serialNumber: string;
  condition: Condition;
  installedYear: string;
  notes: string;
};

export type InstalledItem = Product & {
  id: string;
  itemKind?: "product" | "custom-product" | "material";
  material?: string;
  quantity: number;
  units?: UnitDetail[];
  // Kolom lama dipertahankan agar draf browser versi sebelumnya tetap terbaca.
  serialNumber?: string;
  condition?: Condition;
  installedYear?: string;
  notes?: string;
};

export type Inventory = Record<string, InstalledItem[]>;
export type Drafts = Record<string, Inventory>;
export type DraftContexts = Record<string, { runwayAzimuth?: string }>;
export type SiteMetadataDrafts = Record<string, SiteMetadata>;
export type SourceMode = "site" | "template";
