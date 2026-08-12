import type { DataSet, SiteSubtype, StationSite } from "../types/inventory.ts";

export const WAREHOUSE_SITE_TYPE = "Gudang";
export const WAREHOUSE_SUBTYPE = "Gudang";
export const WAREHOUSE_PROFILE = "Profil Barang Gudang";

export function warehouseDefinition(data: DataSet) {
  const subtype = data.siteSubtypes.find((row) => (
    row.siteType === WAREHOUSE_SITE_TYPE
    && row.subtype === WAREHOUSE_SUBTYPE
    && row.profile === WAREHOUSE_PROFILE
  ));
  return subtype?.siteTypeId && subtype.subtypeId && subtype.profileId ? {
    siteTypeId: subtype.siteTypeId,
    subtypeId: subtype.subtypeId,
    profileId: subtype.profileId,
  } : null;
}

export function isWarehouseContext(
  data: DataSet,
  site: StationSite | undefined,
  subtype: SiteSubtype | undefined,
) {
  const canonical = warehouseDefinition(data);
  return Boolean(canonical
    && site?.siteTypeId === canonical.siteTypeId
    && subtype?.subtypeId === canonical.subtypeId
    && subtype.profileId === canonical.profileId);
}
