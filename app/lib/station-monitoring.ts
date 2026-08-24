import type { StationCompletionStatus, StationCompletionSummary } from "./station-completion";

export type StationConditionFilter = "all" | "not-started" | "lt50" | "50to99" | "complete" | "attention" | "not-assessed";
export type StationQcFilter = "all" | "pending" | "none";
export type StationMonitoringSort = "priority" | "progress-asc" | "progress-desc" | "qc-desc" | "qc-asc" | "name-asc" | "name-desc";

export type StationMonitoringFilters = {
  condition: StationConditionFilter;
  qc: StationQcFilter;
  sort: StationMonitoringSort;
};

export type StationFollowUpKey = "attention" | "not-started" | "partial-under-50" | "partial-50-99";

export const DEFAULT_STATION_MONITORING_FILTERS: StationMonitoringFilters = {
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
    attention: rows.filter((row) => row.station_status === "PERLU_PERHATIAN").length,
    notStarted: rows.filter((row) => row.station_status === "BELUM_DIMULAI").length,
    partialUnder50: rows.filter((row) => row.station_status === "TERISI_SEBAGIAN"
      && row.category_progress !== null && row.category_progress < 50).length,
    partial50to99: rows.filter((row) => row.station_status === "TERISI_SEBAGIAN"
      && row.category_progress !== null && row.category_progress >= 50 && row.category_progress < 100).length,
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
  const base = { ...DEFAULT_STATION_MONITORING_FILTERS, sort: current.sort };
  if (key === "attention") return { ...base, condition: "attention" as const };
  if (key === "not-started") return { ...base, condition: "not-started" as const };
  if (key === "partial-under-50") return { ...base, condition: "lt50" as const };
  return { ...base, condition: "50to99" as const };
}

export function hasStationMonitoringFilters(filters: StationMonitoringFilters) {
  return filters.condition !== DEFAULT_STATION_MONITORING_FILTERS.condition
    || filters.qc !== DEFAULT_STATION_MONITORING_FILTERS.qc
    || filters.sort !== DEFAULT_STATION_MONITORING_FILTERS.sort;
}
