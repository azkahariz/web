import type { StationCompletionStatus, StationCompletionSummary } from "./station-completion";

export type StationConditionFilter = "all" | "not-started" | "lt50" | "50to99" | "complete" | "attention" | "not-assessed";
export type StationQcFilter = "all" | "pending" | "none";
export type StationMonitoringSort = "priority" | "progress-asc" | "progress-desc" | "qc-desc" | "qc-asc" | "name-asc" | "name-desc";
export type StationCategoryFilter = "all" | string;
export type SiteTypeFilter = "all" | string;
export type StationCategoryOption = { id: string; code: string; name: string };

export const STATION_CATEGORIES: StationCategoryOption[] = [
  { id: "11111111-1111-4111-8111-111111111111", code: "METEOROLOGI", name: "Meteorologi" },
  { id: "22222222-2222-4222-8222-222222222222", code: "KLIMATOLOGI", name: "Klimatologi" },
  { id: "33333333-3333-4333-8333-333333333333", code: "GEOFISIKA", name: "Geofisika" },
  { id: "44444444-4444-4444-8444-444444444444", code: "BALAI", name: "Balai" },
  { id: "55555555-5555-4555-8555-555555555555", code: "PUSAT", name: "Pusat" },
];

export function stationCategoryName(id: string | null | undefined) {
  return STATION_CATEGORIES.find((category) => category.id === id)?.name ?? null;
}

export type StationMonitoringFilters = {
  stationCategoryId: StationCategoryFilter;
  siteTypeId: SiteTypeFilter;
  condition: StationConditionFilter;
  qc: StationQcFilter;
  sort: StationMonitoringSort;
};

export type StationFollowUpKey = "not-started" | "partial-under-50" | "partial-50-99" | "complete";

export const DEFAULT_STATION_MONITORING_FILTERS: StationMonitoringFilters = {
  stationCategoryId: "all",
  siteTypeId: "all",
  condition: "all",
  qc: "all",
  sort: "priority",
};

const PRIORITY_RANK: Record<StationCompletionStatus, number> = {
  PERLU_PERHATIAN: 0,
  BELUM_DIMULAI: 1,
  TERISI_SEBAGIAN: 2,
  LENGKAP: 3,
  TIDAK_DINILAI: 4,
};

function compareName(left: StationCompletionSummary, right: StationCompletionSummary) {
  return left.station_name.localeCompare(right.station_name, "id-ID", { sensitivity: "base" });
}

function matchesCondition(summary: StationCompletionSummary, filter: StationConditionFilter) {
  if (filter === "all") return true;
  if (filter === "not-started") return summary.station_status === "BELUM_DIMULAI";
  if (filter === "lt50") return summary.station_status === "TERISI_SEBAGIAN" && (summary.category_progress ?? 100) < 50;
  if (filter === "50to99") return summary.station_status === "TERISI_SEBAGIAN"
    && (summary.category_progress ?? -1) >= 50 && (summary.category_progress ?? -1) < 100;
  if (filter === "complete") return summary.station_status === "LENGKAP";
  if (filter === "attention") return summary.station_status === "PERLU_PERHATIAN";
  return summary.station_status === "TIDAK_DINILAI";
}

function matchesQc(summary: StationCompletionSummary, filter: StationQcFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return summary.pending_qc_count > 0;
  return summary.pending_qc_count === 0;
}

export function filterStationCompletionSummaries(
  rows: StationCompletionSummary[],
  filters: Pick<StationMonitoringFilters, "condition" | "qc">,
) {
  return rows.filter((summary) => matchesCondition(summary, filters.condition) && matchesQc(summary, filters.qc));
}

function compareProgress(left: StationCompletionSummary, right: StationCompletionSummary, descending = false) {
  const leftProgress = left.category_progress;
  const rightProgress = right.category_progress;
  if (leftProgress === null && rightProgress !== null) return 1;
  if (leftProgress !== null && rightProgress === null) return -1;
  if (leftProgress !== null && rightProgress !== null && leftProgress !== rightProgress) {
    return descending ? rightProgress - leftProgress : leftProgress - rightProgress;
  }
  return compareName(left, right);
}

export function sortStationCompletionSummaries(rows: StationCompletionSummary[], sort: StationMonitoringSort) {
  return [...rows].sort((left, right) => {
    if (sort === "name-asc") return compareName(left, right);
    if (sort === "name-desc") return compareName(right, left);
    if (sort === "progress-asc") return compareProgress(left, right);
    if (sort === "progress-desc") return compareProgress(left, right, true);
    if (sort === "qc-desc" || sort === "qc-asc") {
      const difference = sort === "qc-desc"
        ? right.pending_qc_count - left.pending_qc_count
        : left.pending_qc_count - right.pending_qc_count;
      return difference || compareName(left, right);
    }

    const statusDifference = PRIORITY_RANK[left.station_status] - PRIORITY_RANK[right.station_status];
    if (statusDifference) return statusDifference;
    if (left.station_status === "TERISI_SEBAGIAN") {
      const progressDifference = (left.category_progress ?? Number.POSITIVE_INFINITY) - (right.category_progress ?? Number.POSITIVE_INFINITY);
      if (progressDifference) return progressDifference;
    }
    return compareName(left, right);
  });
}

export function applyStationMonitoring(
  rows: StationCompletionSummary[],
  filters: StationMonitoringFilters,
) {
  return sortStationCompletionSummaries(filterStationCompletionSummaries(rows, filters), filters.sort);
}

export function getStationFollowUpCounts(rows: StationCompletionSummary[]) {
  return {
    notStarted: rows.filter((row) => row.station_status === "BELUM_DIMULAI").length,
    partialUnder50: rows.filter((row) => row.station_status === "TERISI_SEBAGIAN"
      && row.category_progress !== null && row.category_progress < 50).length,
    partial50to99: rows.filter((row) => row.station_status === "TERISI_SEBAGIAN"
      && row.category_progress !== null && row.category_progress >= 50 && row.category_progress < 100).length,
    complete: rows.filter((row) => row.station_status === "LENGKAP").length,
  };
}

export function getStationQcSummary(rows: StationCompletionSummary[]) {
  return {
    stationCount: rows.filter((row) => row.pending_qc_count > 0).length,
    totalPending: rows.reduce((total, row) => total + row.pending_qc_count, 0),
    maxPending: rows.reduce((maximum, row) => Math.max(maximum, row.pending_qc_count), 0),
  };
}

export function applyStationFollowUpPreset(current: StationMonitoringFilters, key: StationFollowUpKey) {
  const base = {
    ...DEFAULT_STATION_MONITORING_FILTERS,
    stationCategoryId: current.stationCategoryId,
    siteTypeId: current.siteTypeId,
    sort: current.sort,
  };
  if (key === "not-started") return { ...base, condition: "not-started" as const };
  if (key === "partial-under-50") return { ...base, condition: "lt50" as const };
  if (key === "partial-50-99") return { ...base, condition: "50to99" as const };
  return { ...base, condition: "complete" as const };
}

export function hasStationMonitoringFilters(filters: StationMonitoringFilters) {
  return filters.stationCategoryId !== DEFAULT_STATION_MONITORING_FILTERS.stationCategoryId
    || filters.siteTypeId !== DEFAULT_STATION_MONITORING_FILTERS.siteTypeId
    || filters.condition !== DEFAULT_STATION_MONITORING_FILTERS.condition
    || filters.qc !== DEFAULT_STATION_MONITORING_FILTERS.qc
    || filters.sort !== DEFAULT_STATION_MONITORING_FILTERS.sort;
}

export function stationIdsForScope(
  stations: Array<{ id: string; station_category_id?: string | null }>,
  sites: Array<{ station_id: string; site_type_id: string }>,
  filters: Pick<StationMonitoringFilters, "stationCategoryId" | "siteTypeId">,
) {
  const siteTypesByStation = new Map<string, Set<string>>();
  for (const site of sites) {
    const types = siteTypesByStation.get(site.station_id) ?? new Set<string>();
    types.add(site.site_type_id);
    siteTypesByStation.set(site.station_id, types);
  }
  return new Set(stations.filter((station) =>
    (filters.stationCategoryId === "all" || station.station_category_id === filters.stationCategoryId)
    && (filters.siteTypeId === "all" || siteTypesByStation.get(station.id)?.has(filters.siteTypeId) === true),
  ).map((station) => station.id));
}
