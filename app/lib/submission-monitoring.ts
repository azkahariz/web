import type { InstalledItem, Inventory } from "../types/inventory.ts";

export const SUBMISSION_PAGE_SIZE = 50;
export const SUBMISSION_PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 1000] as const;
export const SUBMISSION_PAGE_SIZE_MIN = 10;
export const SUBMISSION_PAGE_SIZE_MAX = 1000;

export type SubmissionSortField =
  | "station"
  | "site"
  | "siteType"
  | "subtype"
  | "progress"
  | "version"
  | "operator"
  | "updated";
export type SubmissionSortDirection = "asc" | "desc";

export type SubmissionProgressStatus =
  | "Kosong"
  | "Terisi Sebagian"
  | "Lengkap"
  | "Belum terpetakan";

export type SubmissionArchiveFilter = "ACTIVE" | "ARCHIVED";

export type SubmissionSummary = {
  id: string;
  station_id: string;
  station_name: string;
  site_id: string;
  site_name: string;
  site_type_id: string;
  site_type_name: string;
  site_subtype_id: string;
  subtype_name: string;
  version: number;
  operator_name: string | null;
  updated_at: string;
  last_saved_at: string | null;
  filled_count: number;
  total_count: number;
  progress_percent: number;
  progress_status: SubmissionProgressStatus;
  archived_at: string | null;
  archive_reason: string | null;
};

export type SubmissionDetail = SubmissionSummary & {
  payload: Record<string, unknown>;
  expected_items: Array<{ name: string; filled: boolean }>;
  qc_pending_count: number;
};

export type SubmissionItemDisplay = {
  name: string;
  filled: boolean;
  entries: Array<{ kind: "product" | "material"; primary: string; secondary?: string }>;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * A category is filled only after it contains a recognizable installed item.
 * Optional unit fields and Aloptama metadata never affect this decision.
 */
export function isFilledInventoryItem(item: unknown): item is InstalledItem {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const candidate = item as Partial<InstalledItem>;
  if (candidate.itemKind === "material") return hasText(candidate.material);
  return hasText(candidate.brand) && hasText(candidate.model);
}

export function summarizeSubmissionProgress(expectedItems: string[], inventory: Inventory | null | undefined) {
  const totalCount = expectedItems.length;
  const filledCount = expectedItems.filter((itemName) => (
    Array.isArray(inventory?.[itemName]) && inventory[itemName].some(isFilledInventoryItem)
  )).length;
  const progressPercent = totalCount ? Math.round((filledCount / totalCount) * 100) : 0;
  const progressStatus: SubmissionProgressStatus = totalCount === 0
    ? "Belum terpetakan"
    : filledCount === 0
      ? "Kosong"
      : filledCount === totalCount
        ? "Lengkap"
        : "Terisi Sebagian";
  return { filledCount, totalCount, progressPercent, progressStatus };
}

export function submissionPageOffset(page: number, pageSize = SUBMISSION_PAGE_SIZE) {
  return Math.max(0, Math.floor(page) - 1) * pageSize;
}

export function normalizeSubmissionPageSize(value: unknown, fallback = SUBMISSION_PAGE_SIZE) {
  const parsed = typeof value === "number" ? value : Number(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(SUBMISSION_PAGE_SIZE_MAX, Math.max(SUBMISSION_PAGE_SIZE_MIN, Math.floor(parsed)));
}

export function submissionItemDisplays(detail: Pick<SubmissionDetail, "payload" | "expected_items">): SubmissionItemDisplay[] {
  const payloadInventory = detail.payload?.inventory;
  const inventory = payloadInventory && typeof payloadInventory === "object" && !Array.isArray(payloadInventory)
    ? payloadInventory as Record<string, unknown>
    : {};
  return detail.expected_items.map((expected) => {
    const candidateRows = inventory[expected.name];
    const rows: unknown[] = Array.isArray(candidateRows) ? candidateRows : [];
    const entries: SubmissionItemDisplay["entries"] = rows.flatMap((row): SubmissionItemDisplay["entries"] => {
      if (!isFilledInventoryItem(row)) return [];
      if (row.itemKind === "material") {
        return [{ kind: "material" as const, primary: row.material!.trim() }];
      }
      return [{ kind: "product" as const, primary: row.brand.trim(), secondary: row.model.trim() }];
    });
    return { name: expected.name, filled: entries.length > 0, entries };
  });
}
