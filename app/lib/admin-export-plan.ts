import type { AdminSite, AdminSiteType, AdminStation, AdminSubtype } from "./admin-view.ts";
import { buildAloptamaFilename, sanitizeFilenamePart } from "./download.ts";

export type AdminExportScope = {
  stationId: string;
  siteId?: string;
  siteSubtypeId?: string;
};

type ExportRow<TSubmission> = {
  site: AdminSite;
  siteType: AdminSiteType | null;
  subtype: AdminSubtype | null;
  submission: TSubmission | null;
};

function uniqueFilename(filename: string, used: Set<string>) {
  if (!used.has(filename)) {
    used.add(filename);
    return filename;
  }
  const extensionIndex = filename.lastIndexOf(".");
  const base = extensionIndex >= 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex) : "";
  let suffix = 2;
  while (used.has(`${base}-${suffix}${extension}`)) suffix += 1;
  const result = `${base}-${suffix}${extension}`;
  used.add(result);
  return result;
}

export function buildAdminExportPlan<TSubmission>(station: AdminStation, rows: Array<ExportRow<TSubmission>>, scope: AdminExportScope) {
  const selectedRows = rows.filter((row) => row.subtype
    && (!scope.siteId || row.site.id === scope.siteId)
    && (!scope.siteSubtypeId || row.subtype.id === scope.siteSubtypeId));
  if (!selectedRows.length) throw new Error("Tidak ada kombinasi Site/Subtipe valid untuk diunduh.");
  const used = new Set<string>();
  const entries = selectedRows.map((row) => ({
    ...row,
    filename: uniqueFilename(buildAloptamaFilename(station.name, row.site.name, row.subtype!.name, "csv"), used),
  }));
  if (scope.siteId && scope.siteSubtypeId && entries.length === 1) {
    return { kind: "csv" as const, filename: entries[0].filename, entries };
  }
  const stationPart = sanitizeFilenamePart(station.name) || "aloptama";
  const sitePart = scope.siteId ? sanitizeFilenamePart(entries[0].site.name) : "";
  return {
    kind: "zip" as const,
    filename: sitePart ? `${stationPart}_${sitePart}.zip` : `${stationPart}.zip`,
    entries,
  };
}
