import type { StationSite } from "../types/inventory.ts";
import { WAREHOUSE_SITE_TYPE } from "./warehouse.ts";

export function sortStationSites(sites: StationSite[]) {
  return [...sites].sort((left, right) => {
    const leftWarehouse = left.siteType === WAREHOUSE_SITE_TYPE;
    const rightWarehouse = right.siteType === WAREHOUSE_SITE_TYPE;
    if (leftWarehouse !== rightWarehouse) return leftWarehouse ? 1 : -1;
    return left.site.localeCompare(right.site, "id", { sensitivity: "base" });
  });
}
