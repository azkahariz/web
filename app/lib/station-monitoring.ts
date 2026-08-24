import type { StationCompletionStatus, StationCompletionSummary } from "./station-completion";

export type StationStatusFilter = "all" | "incomplete" | StationCompletionStatus;
export type StationProgressFilter = "all" | "lt25" | "lt50" | "50to99" | "100";
export type StationActivityFilter = "all" | "never" | "stale7" | "stale14";
export type StationMonitoringSort = "priority" | "progress-asc" | "progress-desc" | "oldest" | "newest" | "name-asc" | "name-desc";

export type StationMonitoringFilters = {
  status: StationStatusFilter;
  progress: StationProgressFilter;
  activity: StationActivityFilter;
  sort: StationMonitoringSort;
};

export type StationFollowUpKey = "attention" | "not-started" | "partial-under-50" | "stale-7";

export const DEFAULT_STATION_MONITORING_FILTERS: StationMonitoringFilters = {
  status: "all",
  progress: "all",
  activity: "all",
  sort: "priority",
};

const INCOMPLETE_STATUSES = new Set<StationCompletionStatus>([
  "PERLU_PERHATIAN",
  "BELUM_DIMULAI",
  "TERISI_SEBAGIAN",
]);

const STALE_ACTIONABLE_STATUSES = new Set<StationCompletionStatus>([
  "PERLU_PERHATIAN",
  "TERISI_SEBAGIAN",
]);

const PRIORITY_RANK: Record<StationCompletionStatus, number> = {
  PERLU_PERHATIAN: 0,
  BELUM_DIMULAI: 1,
  TERISI_SEBAGIAN: 2,
  LENGKAP: 3,
  TIDAK_DINILAI: 4,
};

function timestampValue(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareName(left: StationCompletionSummary, right: StationCompletionSummary) {
  return left.station_name.localeCompare(right.station_name, "id-ID", { sensitivity: "base" });
}

function compareOldestActivity(left: StationCompletionSummary, right: StationCompletionSummary) {
  const leftTime = timestampValue(left.content_last_updated);
  const rightTime = timestampValue(right.content_last_updated);
  if (leftTime === null && rightTime !== null) return -1;
  if (leftTime !== null && rightTime === null) return 1;
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return leftTime - rightTime;
  return compareName(left, right);
}

export function isOlderThanDays(timestamp: string | null, now: number, days: number) {
  const value = timestampValue(timestamp);
  return value !== null && now - value > days * 24 * 60 * 60 * 1000;
}

export function isActionableStale(summary: StationCompletionSummary, now: number, days: number) {
  return STALE_ACTIONABLE_STATUSES.has(summary.station_status)
    && isOlderThanDays(summary.content_last_updated, now, days);
}

function matchesStatus(summary: StationCompletionSummary, filter: StationStatusFilter) {
  if (filter === "all") return true;
  if (filter === "incomplete") return INCOMPLETE_STATUSES.has(summary.station_status);
  return summary.station_status === filter;
}

function matchesProgress(summary: StationCompletionSummary, filter: StationProgressFilter) {
  if (filter === "all") return true;
  const progress = summary.category_progress;
  if (progress === null) return false;
  if (filter === "lt25") return progress < 25;
  if (filter === "lt50") return progress < 50;
  if (filter === "50to99") return progress >= 50 && progress < 100;
  return progress === 100;
}

function matchesActivity(summary: StationCompletionSummary, filter: StationActivityFilter, now: number) {
  if (filter === "all") return true;
  if (filter === "never") return summary.station_status !== "TIDAK_DINILAI" && summary.content_last_updated === null;
  return isActionableStale(summary, now, filter === "stale14" ? 14 : 7);
}

export function filterStationCompletionSummaries(
  rows: StationCompletionSummary[],
  filters: Pick<StationMonitoringFilters, "status" | "progress" | "activity">,
  now: number,
) {
  return rows.filter((summary) => matchesStatus(summary, filters.status)
    && matchesProgress(summary, filters.progress)
    && matchesActivity(summary, filters.activity, now));
}

export function sortStationCompletionSummaries(rows: StationCompletionSummary[], sort: StationMonitoringSort) {
  return [...rows].sort((left, right) => {
    if (sort === "name-asc") return compareName(left, right);
    if (sort === "name-desc") return compareName(right, left);

    if (sort === "priority") {
      const statusDifference = PRIORITY_RANK[left.station_status] - PRIORITY_RANK[right.station_status];
      if (statusDifference) return statusDifference;
      if (left.station_status === "TERISI_SEBAGIAN") {
        const leftProgress = left.category_progress ?? Number.POSITIVE_INFINITY;
        const rightProgress = right.category_progress ?? Number.POSITIVE_INFINITY;
        if (leftProgress !== rightProgress) return leftProgress - rightProgress;
      }
      return compareOldestActivity(left, right);
    }

    if (sort === "progress-asc" || sort === "progress-desc") {
      const leftProgress = left.category_progress;
      const rightProgress = right.category_progress;
      if (leftProgress === null && rightProgress !== null) return 1;
      if (leftProgress !== null && rightProgress === null) return -1;
      if (leftProgress !== null && rightProgress !== null && leftProgress !== rightProgress) {
        return sort === "progress-asc" ? leftProgress - rightProgress : rightProgress - leftProgress;
      }
      return compareName(left, right);
    }

    if (left.station_status === "TIDAK_DINILAI" && right.station_status !== "TIDAK_DINILAI") return 1;
    if (left.station_status !== "TIDAK_DINILAI" && right.station_status === "TIDAK_DINILAI") return -1;
    const leftTime = timestampValue(left.content_last_updated);
    const rightTime = timestampValue(right.content_last_updated);
    if (sort === "oldest") return compareOldestActivity(left, right);
    if (leftTime === null && rightTime !== null) return 1;
    if (leftTime !== null && rightTime === null) return -1;
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return rightTime - leftTime;
    return compareName(left, right);
  });
}

export function applyStationMonitoring(
  rows: StationCompletionSummary[],
  filters: StationMonitoringFilters,
  now: number,
) {
  return sortStationCompletionSummaries(filterStationCompletionSummaries(rows, filters, now), filters.sort);
}

export function getStationFollowUpCounts(rows: StationCompletionSummary[], now: number) {
  return {
    attention: rows.filter((row) => row.station_status === "PERLU_PERHATIAN").length,
    notStarted: rows.filter((row) => row.station_status === "BELUM_DIMULAI").length,
    partialUnder50: rows.filter((row) => row.station_status === "TERISI_SEBAGIAN"
      && row.category_progress !== null && row.category_progress < 50).length,
    stale7: rows.filter((row) => isActionableStale(row, now, 7)).length,
  };
}

export function applyStationFollowUpPreset(current: StationMonitoringFilters, key: StationFollowUpKey) {
  const base = { ...DEFAULT_STATION_MONITORING_FILTERS, sort: current.sort };
  if (key === "attention") return { ...base, status: "PERLU_PERHATIAN" as const };
  if (key === "not-started") return { ...base, status: "BELUM_DIMULAI" as const };
  if (key === "partial-under-50") return { ...base, status: "TERISI_SEBAGIAN" as const, progress: "lt50" as const };
  return { ...base, status: "incomplete" as const, activity: "stale7" as const };
}

export function hasStationMonitoringFilters(filters: StationMonitoringFilters) {
  return filters.status !== DEFAULT_STATION_MONITORING_FILTERS.status
    || filters.progress !== DEFAULT_STATION_MONITORING_FILTERS.progress
    || filters.activity !== DEFAULT_STATION_MONITORING_FILTERS.activity
    || filters.sort !== DEFAULT_STATION_MONITORING_FILTERS.sort;
}
