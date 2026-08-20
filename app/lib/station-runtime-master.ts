import type { MasterDataReferences, SiteSubtype, StationRuntimeMaster, StationSite } from "../types/inventory";

export type StationRuntimeMasterPayload = {
  station?: { id?: string; name?: string };
  sites?: Array<{ id?: string; stationId?: string; name?: string; siteTypeId?: string; siteTypeName?: string }>;
  siteSubtypes?: Array<{ id?: string; siteTypeId?: string; siteTypeName?: string; name?: string; profileId?: string; profileName?: string }>;
  itemProfiles?: Array<{ id?: string; name?: string }>;
  profileItems?: Array<{ id?: string; profileId?: string; profileName?: string; itemId?: string; itemName?: string }>;
  legacySubmissionSubtypeIdsBySite?: Record<string, string[]>;
};

function required(value: string | undefined, label: string) {
  if (!value?.trim()) throw new Error(`Master runtime tidak memiliki ${label}.`);
  return value;
}

export function parseStationRuntimeMaster(payload: unknown): StationRuntimeMaster {
  const source = payload as StationRuntimeMasterPayload | null;
  const station = source?.station;
  const stationId = required(station?.id, "ID stasiun");
  const stationName = required(station?.name, "nama stasiun");
  const stationSites: StationSite[] = (source?.sites ?? []).map((site) => ({
    station: stationName,
    stationId,
    site: required(site.name, "nama site"),
    siteId: required(site.id, "ID site"),
    siteType: required(site.siteTypeName, "nama tipe site"),
    siteTypeId: required(site.siteTypeId, "ID tipe site"),
    stationActive: true,
    siteActive: true,
    siteTypeActive: true,
  }));
  const siteSubtypes: SiteSubtype[] = (source?.siteSubtypes ?? []).map((subtype) => ({
    siteType: required(subtype.siteTypeName, "nama tipe site subtype"),
    siteTypeId: required(subtype.siteTypeId, "ID tipe site subtype"),
    subtype: required(subtype.name, "nama subtype"),
    subtypeId: required(subtype.id, "ID subtype"),
    profile: required(subtype.profileName, "nama profil subtype"),
    profileId: required(subtype.profileId, "ID profil subtype"),
    siteTypeActive: true,
    subtypeActive: true,
  }));
  const profileItems: MasterDataReferences["profileItems"] = (source?.profileItems ?? []).map((mapping) => ({
    mappingId: required(mapping.id, "ID mapping profil barang"),
    mappingActive: true,
    profile: required(mapping.profileName, "nama profil barang"),
    profileId: required(mapping.profileId, "ID profil barang"),
    profileActive: true,
    item: required(mapping.itemName, "nama kategori barang"),
    itemId: required(mapping.itemId, "ID kategori barang"),
    itemActive: true,
  }));
  const barangByJenis = Object.fromEntries((source?.itemProfiles ?? []).map((profile) => {
    const profileName = required(profile.name, "nama profil barang");
    return [profileName, profileItems.filter((mapping) => mapping.profileId === profile.id).map((mapping) => mapping.item)];
  }));
  return {
    station: { id: stationId, name: stationName },
    stationSites,
    siteSubtypes,
    barangByJenis,
    master: { profileItems, productCategories: [] },
    legacySubmissionSubtypeIdsBySite: source?.legacySubmissionSubtypeIdsBySite ?? {},
  };
}

export function tryParseStationRuntimeMaster(payload: unknown) {
  try {
    return parseStationRuntimeMaster(payload);
  } catch {
    return null;
  }
}
