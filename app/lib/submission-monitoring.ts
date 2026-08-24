import { getItemUnits } from "./inventory.ts";
import {
  getItemFunctionCategories,
  inventoryCategoryEntries,
  inventoryCategoryIsFilled,
  physicalUnitCount,
  recordedCategoryCount,
} from "./category-functions.ts";
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
  | "Gudang"
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
  progress_kind: "EXPECTED" | "WAREHOUSE";
  warehouse_category_count: number;
  warehouse_unit_count: number;
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
  hasPendingQc: boolean;
  entries: Array<{ kind: "product" | "material"; primary: string; secondary?: string; unitCount: number; functions: string[]; pendingQc: boolean }>;
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
  const normalizedInventory = inventory ?? {};
  const filledCount = expectedItems.filter((itemName) => inventoryCategoryIsFilled(normalizedInventory, itemName)).length;
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

export function summarizeWarehouseInventory(inventory: Inventory | null | undefined) {
  return {
    categoryCount: recordedCategoryCount(inventory ?? {}),
    unitCount: physicalUnitCount(inventory ?? {}),
  };
}

export function submissionPageOffset(page: number, pageSize = SUBMISSION_PAGE_SIZE) {
  return Math.max(0, Math.floor(page) - 1) * pageSize;
}

export function normalizeSubmissionPageSize(value: unknown, fallback = SUBMISSION_PAGE_SIZE) {
  const parsed = typeof value === "number" ? value : Number(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(SUBMISSION_PAGE_SIZE_MAX, Math.max(SUBMISSION_PAGE_SIZE_MIN, Math.floor(parsed)));
}

export function submissionItemDisplays(
  detail: Pick<SubmissionDetail, "payload" | "expected_items">,
  pendingProposalIds: ReadonlySet<string> = new Set(),
): SubmissionItemDisplay[] {
  const payloadInventory = detail.payload?.inventory;
  const inventory = payloadInventory && typeof payloadInventory === "object" && !Array.isArray(payloadInventory)
    ? payloadInventory as Record<string, unknown>
    : {};
  return detail.expected_items.map((expected) => {
    const entries: SubmissionItemDisplay["entries"] = inventoryCategoryEntries(inventory as Inventory, expected.name).flatMap(({ storageCategory, item: row }): SubmissionItemDisplay["entries"] => {
      if (!isFilledInventoryItem(row)) return [];
      const pendingQc = typeof row.productProposalId === "string" && pendingProposalIds.has(row.productProposalId);
      if (row.itemKind === "material") {
        return [{ kind: "material" as const, primary: row.material!.trim(), unitCount: getItemUnits(row).length, functions: getItemFunctionCategories(row, storageCategory), pendingQc }];
      }
      return [{ kind: "product" as const, primary: row.brand.trim(), secondary: row.model.trim(), unitCount: getItemUnits(row).length, functions: getItemFunctionCategories(row, storageCategory), pendingQc }];
    });
    return { name: expected.name, filled: entries.length > 0, hasPendingQc: entries.some((entry) => entry.pendingQc), entries };
  });
}
