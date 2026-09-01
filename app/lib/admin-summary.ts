export type SummarySite = { id: string; site_type_id: string };
export type SummarySiteType = { id: string; name: string };
export type SiteTypeSummary = { id: string; name: string; count: number };

export type SiteTypeCompletionSummary = {
  site_type_id: string;
  site_type_name: string;
  site_count: number;
  expected_category_count: number;
  filled_category_count: number;
  category_progress: number | null;
  is_warehouse: boolean;
  warehouse_station_count: number | null;
  warehouse_submitted_station_count: number | null;
  warehouse_progress_percent: number | null;
};

export type MonitoringStationSummary = {
  station_status: "PERLU_PERHATIAN" | "BELUM_DIMULAI" | "TERISI_SEBAGIAN" | "LENGKAP" | "TIDAK_DINILAI";
  category_progress: number | null;
  expected_category_count: number;
  filled_category_count: number;
  pending_qc_count: number;
  station_name: string;
};

export function summarizeStationMonitoring(rows: MonitoringStationSummary[]) {
  const counts = {
    notStarted: 0,
    partialUnder50: 0,
    partial50to99: 0,
    complete: 0,
    notAssessed: 0,
    attention: 0,
  };
  for (const row of rows) {
    if (row.station_status === "BELUM_DIMULAI") counts.notStarted += 1;
    else if (row.station_status === "TERISI_SEBAGIAN") {
      if (row.category_progress !== null && row.category_progress < 50) counts.partialUnder50 += 1;
      else if (row.category_progress !== null && row.category_progress < 100) counts.partial50to99 += 1;
    } else if (row.station_status === "LENGKAP") counts.complete += 1;
    else if (row.station_status === "TIDAK_DINILAI") counts.notAssessed += 1;
    else if (row.station_status === "PERLU_PERHATIAN") counts.attention += 1;
  }
  const expected = rows.reduce((total, row) => total + row.expected_category_count, 0);
  const filled = rows.reduce((total, row) => total + row.filled_category_count, 0);
  return {
    ...counts,
    total: rows.length,
    expectedCategoryCount: expected,
    filledCategoryCount: filled,
    globalProgress: expected === 0 ? null : Math.round((filled * 100) / expected),
  };
}

export function summarizeQc(rows: Pick<MonitoringStationSummary, "station_name" | "pending_qc_count">[]) {
  const withPending = rows.filter((row) => row.pending_qc_count > 0);
  const top = [...withPending].sort((left, right) => right.pending_qc_count - left.pending_qc_count
    || left.station_name.localeCompare(right.station_name, "id-ID", { sensitivity: "base" }))[0] ?? null;
  return {
    stationCount: withPending.length,
    totalPending: rows.reduce((total, row) => total + row.pending_qc_count, 0),
    topStation: top ? { name: top.station_name, count: top.pending_qc_count } : null,
  };
}

export function summarizeSiteTypeProgress(rows: SiteTypeCompletionSummary[]) {
  return rows.map((row) => ({
    ...row,
    category_progress: row.is_warehouse || row.expected_category_count === 0
      ? null
      : Math.round((row.filled_category_count * 100) / row.expected_category_count),
    warehouse_progress_percent: row.is_warehouse
      ? warehouseSubmissionProgressPercent(row.warehouse_submitted_station_count, row.warehouse_station_count)
      : null,
  }));
}

export function warehouseSubmissionProgressPercent(submitted: number | null, total: number | null) {
  if (submitted === null || total === null || total <= 0 || submitted < 0 || submitted > total) return null;
  return Math.round((submitted * 100) / total);
}

export function siteTypeCompletionRows(value: unknown): SiteTypeCompletionSummary[] {
  if (!value || typeof value !== "object" || !("rows" in value)) return [];
  const rows = (value as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Partial<SiteTypeCompletionSummary>;
    const valid = typeof item.site_type_id === "string"
      && typeof item.site_type_name === "string"
      && Number.isFinite(item.site_count)
      && Number.isFinite(item.expected_category_count)
      && Number.isFinite(item.filled_category_count)
      && (item.category_progress === null || Number.isFinite(item.category_progress))
      && typeof item.is_warehouse === "boolean"
      && (item.warehouse_station_count === undefined || item.warehouse_station_count === null || Number.isFinite(item.warehouse_station_count))
      && (item.warehouse_submitted_station_count === undefined || item.warehouse_submitted_station_count === null || Number.isFinite(item.warehouse_submitted_station_count))
      && (item.warehouse_progress_percent === undefined || item.warehouse_progress_percent === null || Number.isFinite(item.warehouse_progress_percent));
    if (!valid) return [];
    return [{
      ...item,
      warehouse_station_count: item.warehouse_station_count ?? null,
      warehouse_submitted_station_count: item.warehouse_submitted_station_count ?? null,
      warehouse_progress_percent: item.warehouse_progress_percent ?? null,
    } as SiteTypeCompletionSummary];
  });
}

export function parseSiteTypeCompletionRows(value: unknown): SiteTypeCompletionSummary[] | null {
  if (!value || typeof value !== "object" || !("rows" in value)) return null;
  const rows = (value as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return null;
  const parsed = siteTypeCompletionRows(value);
  return parsed.length === rows.length ? parsed : null;
}

export function summarizeSitesByType(
  sites: SummarySite[],
  siteTypes: SummarySiteType[],
) {
  const counts = new Map<string, number>();
  const seenSites = new Set<string>();
  for (const site of sites) {
    if (seenSites.has(site.id)) continue;
    seenSites.add(site.id);
    counts.set(site.site_type_id, (counts.get(site.site_type_id) ?? 0) + 1);
  }

  const result = siteTypes
    .map((siteType) => ({
      id: siteType.id,
      name: siteType.name,
      count: counts.get(siteType.id) ?? 0,
    }))
    .filter((siteType) => siteType.count > 0);
  const mappedCount = result.reduce((total, siteType) => total + siteType.count, 0);
  const untypedCount = seenSites.size - mappedCount;
  if (untypedCount > 0) result.push({ id: "unmapped", name: "Belum terpetakan", count: untypedCount });
  return { totalCount: seenSites.size, byType: result };
}
