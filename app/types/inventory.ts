import type { SiteMetadata } from "./site-metadata";

export type StationSite = {
  station: string;
  site: string;
  siteType: string;
  stationId?: string;
  stationActive?: boolean;
  siteId?: string;
  siteActive?: boolean;
  siteTypeId?: string;
  siteTypeActive?: boolean;
};
export type SiteSubtype = {
  siteType: string;
  subtype: string;
  profile: string;
  siteTypeId?: string;
  siteTypeActive?: boolean;
  subtypeId?: string;
  subtypeActive?: boolean;
  profileId?: string;
};
export type Product = {
  brand: string;
  model: string;
  productId?: string;
  active?: boolean;
  sourceOrigin?: "SPREADSHEET" | "QC";
  spreadsheetSynced?: boolean;
};

export type ProductProposalStatus = "PENDING" | "APPROVED" | "MERGED" | "REJECTED" | "PENDING_LOCAL";

export type ProductProposal = {
  id: string;
  proposedBrand: string;
  proposedModel: string;
  status: Exclude<ProductProposalStatus, "PENDING_LOCAL">;
  resolvedProductId?: string;
  resolvedBrand?: string;
  resolvedModel?: string;
  reviewNote?: string;
};

export type MasterDataReferences = {
  profileItems: Array<{
    profile: string;
    item: string;
    profileId?: string;
    profileActive?: boolean;
    itemId?: string;
    itemActive?: boolean;
    mappingId?: string;
    mappingActive?: boolean;
  }>;
  productCategories: Array<{ name: string; categoryId?: string; active?: boolean }>;
};

export type DataSet = {
  stationSites: StationSite[];
  siteSubtypes: SiteSubtype[];
  barangByJenis: Record<string, string[]>;
  products: Product[];
  master?: MasterDataReferences;
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
  productProposalId?: string;
  proposalStatus?: ProductProposalStatus;
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
