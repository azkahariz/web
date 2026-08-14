import { getAllowedSiteSubtypes } from "./site-subtypes.ts";
import { isWarehouseContext } from "./warehouse.ts";
import type { DataSet, SiteSubtype, StationSite } from "../types/inventory.ts";

export type StationSubmissionProgress = {
  siteId: string;
  siteSubtypeId: string;
  filledCount: number;
  totalCount: number;
  progressKind: "EXPECTED" | "WAREHOUSE";
  warehouseCategoryCount: number;
  warehouseUnitCount: number;
};

export type StationSiteProgressStatus = "Belum mulai" | "Terisi sebagian" | "Lengkap";

export type StationSiteProgress = {
  siteId: string;
  siteName: string;
  siteType: string;
  status: StationSiteProgressStatus;
  detail: string;
  warehouseMode: boolean;
};

function siteKey(site: StationSite) {
  return site.siteId ?? `${site.siteType}::${site.site}`;
}

function subtypeKey(siteId: string | undefined, subtype: SiteSubtype) {
  return `${siteId ?? ""}::${subtype.subtypeId ?? subtype.subtype}`;
}

export function buildStationSiteProgress(
  data: DataSet,
  sites: StationSite[],
  submissions: StationSubmissionProgress[],
): StationSiteProgress[] {
  const summariesBySubtype = new Map(submissions.map((summary) => [
    `${summary.siteId}::${summary.siteSubtypeId}`,
    summary,
  ]));

  return Array.from(new Map(sites.map((site) => [siteKey(site), site])).values()).map((site) => {
    const allSubtypes = data.siteSubtypes.filter((subtype) => subtype.siteType === site.siteType);
    const allowedSubtypes = getAllowedSiteSubtypes({
      siteName: site.site,
      siteTypeName: site.siteType,
      siteSubtypes: allSubtypes,
      getSubtypeName: (subtype) => subtype.subtype,
    });
    const isWarehouse = allowedSubtypes.some((subtype) => isWarehouseContext(data, site, subtype));

    if (isWarehouse) {
      const summary = allowedSubtypes
        .map((subtype) => summariesBySubtype.get(subtypeKey(site.siteId, subtype)))
        .find((item) => item?.progressKind === "WAREHOUSE");
      const categoryCount = summary?.warehouseCategoryCount ?? 0;
      const unitCount = summary?.warehouseUnitCount ?? 0;
      const hasRecordedInventory = categoryCount > 0 || unitCount > 0;
      return {
        siteId: site.siteId ?? siteKey(site),
        siteName: site.site,
        siteType: site.siteType,
        status: hasRecordedInventory ? "Terisi sebagian" : "Belum mulai",
        detail: hasRecordedInventory
          ? `${categoryCount} kategori · ${unitCount} unit`
          : "Belum ada kategori atau unit",
        warehouseMode: true,
      };
    }

    const subtypeProgress = allowedSubtypes.map((subtype) => {
      const summary = summariesBySubtype.get(subtypeKey(site.siteId, subtype));
      return {
        filledCount: summary?.filledCount ?? 0,
        totalCount: summary?.totalCount ?? 0,
      };
    });
    const filledSubtypeCount = subtypeProgress.filter((summary) => summary.filledCount > 0).length;
    const isComplete = subtypeProgress.length > 0 && subtypeProgress.every((summary) => (
      summary.totalCount > 0 && summary.filledCount === summary.totalCount
    ));
    const status: StationSiteProgressStatus = isComplete
      ? "Lengkap"
      : filledSubtypeCount > 0
        ? "Terisi sebagian"
        : "Belum mulai";

    if (allowedSubtypes.length > 1) {
      return {
        siteId: site.siteId ?? siteKey(site),
        siteName: site.site,
        siteType: site.siteType,
        status,
        detail: `${filledSubtypeCount}/${allowedSubtypes.length} subtipe sudah diisi`,
        warehouseMode: false,
      };
    }

    const summary = subtypeProgress[0] ?? { filledCount: 0, totalCount: 0 };
    return {
      siteId: site.siteId ?? siteKey(site),
      siteName: site.site,
      siteType: site.siteType,
      status,
      detail: summary.totalCount > 0
        ? `${summary.filledCount}/${summary.totalCount} kategori`
        : "Profil barang belum tersedia",
      warehouseMode: false,
    };
  });
}

export function summarizeStationSiteProgress(rows: StationSiteProgress[]) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    if (row.status === "Belum mulai") summary.notStarted += 1;
    else if (row.status === "Terisi sebagian") summary.partial += 1;
    else summary.complete += 1;
    return summary;
  }, { total: 0, notStarted: 0, partial: 0, complete: 0 });
}
