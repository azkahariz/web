import { getAllowedSiteSubtypes } from "./site-subtypes.ts";
import { isWarehouseContext } from "./warehouse.ts";
import type { SiteSubtype, StationRuntimeMaster, StationSite } from "../types/inventory.ts";

export type StationSubmissionProgress = {
  siteId: string;
  siteSubtypeId: string;
  filledCount: number;
  totalCount: number;
  progressKind: "EXPECTED" | "WAREHOUSE";
  warehouseCategoryCount: number;
  warehouseUnitCount: number;
};

export type StationSiteProgress = {
  siteId: string;
  siteName: string;
  siteType: string;
  warehouseMode: boolean;
  filledCount: number;
  totalCount: number;
  progressPercent: number;
  warehouseCategoryCount: number;
  warehouseUnitCount: number;
};

function siteKey(site: StationSite) {
  return site.siteId ?? `${site.siteType}::${site.site}`;
}

function subtypeKey(siteId: string | undefined, subtype: SiteSubtype) {
  return `${siteId ?? ""}::${subtype.subtypeId ?? subtype.subtype}`;
}

export function buildStationSiteProgress(
  master: Pick<StationRuntimeMaster, "siteSubtypes" | "barangByJenis">,
  sites: StationSite[],
  submissions: StationSubmissionProgress[],
): StationSiteProgress[] {
  const summariesBySubtype = new Map(submissions.map((summary) => [
    `${summary.siteId}::${summary.siteSubtypeId}`,
    summary,
  ]));

  return Array.from(new Map(sites.map((site) => [siteKey(site), site])).values()).map((site) => {
    const allSubtypes = master.siteSubtypes.filter((subtype) => subtype.siteTypeId === site.siteTypeId);
    const allowedSubtypes = getAllowedSiteSubtypes({
      siteName: site.site,
      siteTypeName: site.siteType,
      siteSubtypes: allSubtypes,
      getSubtypeName: (subtype) => subtype.subtype,
    });
    const isWarehouse = allowedSubtypes.some((subtype) => isWarehouseContext(site, subtype));

    if (isWarehouse) {
      const summary = allowedSubtypes
        .map((subtype) => summariesBySubtype.get(subtypeKey(site.siteId, subtype)))
        .find((item) => item?.progressKind === "WAREHOUSE");
      const categoryCount = summary?.warehouseCategoryCount ?? 0;
      const unitCount = summary?.warehouseUnitCount ?? 0;
      return {
        siteId: site.siteId ?? siteKey(site),
        siteName: site.site,
        siteType: site.siteType,
        warehouseMode: true,
        filledCount: 0,
        totalCount: 0,
        progressPercent: 0,
        warehouseCategoryCount: categoryCount,
        warehouseUnitCount: unitCount,
      };
    }

    const subtypeProgress = allowedSubtypes.map((subtype) => {
      const summary = summariesBySubtype.get(subtypeKey(site.siteId, subtype));
      return {
        filledCount: summary?.filledCount ?? 0,
        totalCount: summary?.totalCount ?? (master.barangByJenis[subtype.profile] ?? []).length,
      };
    });
    const filledCount = subtypeProgress.reduce((total, summary) => total + summary.filledCount, 0);
    const totalCount = subtypeProgress.reduce((total, summary) => total + summary.totalCount, 0);
    return {
      siteId: site.siteId ?? siteKey(site),
      siteName: site.site,
      siteType: site.siteType,
      warehouseMode: false,
      filledCount,
      totalCount,
      progressPercent: totalCount ? Math.round((filledCount / totalCount) * 100) : 0,
      warehouseCategoryCount: 0,
      warehouseUnitCount: 0,
    };
  });
}
