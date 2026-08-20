import rawData from "../data.generated.json";
import type { DataSet, StationRuntimeMaster } from "../types/inventory";

const generated = rawData as DataSet;

/** Admin inventory editing is intentionally outside the Station User runtime path. */
export function adminInventoryMaster(stationId: string, stationName: string): StationRuntimeMaster {
  return {
    station: { id: stationId, name: stationName },
    stationSites: generated.stationSites,
    siteSubtypes: generated.siteSubtypes,
    barangByJenis: generated.barangByJenis,
    master: generated.master ?? { profileItems: [], productCategories: [] },
    legacySubmissionSubtypeIdsBySite: {},
  };
}
