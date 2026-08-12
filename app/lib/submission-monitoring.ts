import type { InstalledItem, Inventory } from "../types/inventory.ts";

export const SUBMISSION_PAGE_SIZE = 50;

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
