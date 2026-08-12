import type { DataSet, SiteSubtype, StationSite } from "../types/inventory.ts";

export const WAREHOUSE_SITE_TYPE = "Gudang";
export const WAREHOUSE_SUBTYPE = "Gudang";
export const WAREHOUSE_PROFILE = "Gudang";
export const WAREHOUSE_SITE_TYPE_ID = "da5d00b1-cd15-4b1d-8087-1057eb31c7d8";
export const WAREHOUSE_SUBTYPE_ID = "346cfc56-437c-4c5d-9c6b-c9f75926a31c";
export const WAREHOUSE_PROFILE_ID = "78b3c5db-2606-43fb-bd5e-ab6e379b9e6e";

export function warehouseDefinition() {
  return {
    siteTypeId: WAREHOUSE_SITE_TYPE_ID,
    subtypeId: WAREHOUSE_SUBTYPE_ID,
    profileId: WAREHOUSE_PROFILE_ID,
  };
}

export function isWarehouseContext(
  data: DataSet,
  site: StationSite | undefined,
  subtype: SiteSubtype | undefined,
) {
  void data;
  const canonical = warehouseDefinition();
  return Boolean(canonical
    && site?.siteTypeId === canonical.siteTypeId
    && subtype?.subtypeId === canonical.subtypeId
    && subtype.profileId === canonical.profileId);
}
