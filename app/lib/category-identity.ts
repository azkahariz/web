import type { Inventory, InstalledItem } from "../types/inventory";

export const LEGACY_POWER_CATEGORY_ITEM_ID = "58c2e908-fa5d-4b08-830b-746ecd65b612";
export const CANONICAL_POWER_CATEGORY = "Sistem Catu Daya Tidak Terputus";
export const LEGACY_POWER_CATEGORY = "SIstem Catu Daya Tidak Terputus";

const CATEGORY_ALIASES = new Map<string, string>([
  [LEGACY_POWER_CATEGORY, CANONICAL_POWER_CATEGORY],
]);

export function canonicalCategoryName(name: string) {
  return CATEGORY_ALIASES.get(name) ?? name;
}

export function categoryNamesEquivalent(left: string, right: string) {
  return canonicalCategoryName(left) === canonicalCategoryName(right);
}

function normalizeItem(item: InstalledItem) {
  const functionCategories = item.functionCategories?.map(canonicalCategoryName);
  return functionCategories?.length
    ? { ...item, functionCategories: Array.from(new Set(functionCategories)) }
    : item;
}

/**
 * Reads legacy category keys into the canonical in-memory shape. Items from
 * both spellings are retained; only the same physical item id is deduplicated.
 */
export function normalizeInventoryCategoryKeys(inventory: Inventory): Inventory {
  const next: Inventory = {};
  const idsByCategory = new Map<string, Set<string>>();
  for (const [storageCategory, items] of Object.entries(inventory)) {
    const category = canonicalCategoryName(storageCategory);
    const seenIds = idsByCategory.get(category) ?? new Set<string>();
    idsByCategory.set(category, seenIds);
    for (const rawItem of items) {
      const item = normalizeItem(rawItem);
      if (item.id && seenIds.has(item.id)) continue;
      if (item.id) seenIds.add(item.id);
      next[category] = [...(next[category] ?? []), item];
    }
  }
  return next;
}
