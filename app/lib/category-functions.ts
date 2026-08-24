import type { InstalledItem, Inventory, MasterDataReferences } from "../types/inventory.ts";
import { canonicalCategoryName, categoryNamesEquivalent } from "./category-identity.ts";

export const SENSOR_FUNCTION_GROUPS = [
  {
    key: "temperature-humidity",
    categories: ["Sensor Suhu Udara", "Sensor Kelembaban Udara"],
    labels: ["Suhu", "Kelembaban", "Suhu + Kelembaban"],
  },
  {
    key: "wind-speed-direction",
    categories: ["Sensor Kecepatan Angin", "Sensor Arah Angin"],
    labels: ["Kecepatan", "Arah", "Kecepatan + Arah"],
  },
] as const;

export type InventoryCategoryEntry = {
  storageCategory: string;
  item: InstalledItem;
};

export function itemIdByName(master?: MasterDataReferences) {
  const result = new Map<string, string>();
  for (const row of master?.profileItems ?? []) {
    if (row.itemId && row.itemActive !== false && !result.has(row.item)) result.set(row.item, row.itemId);
  }
  return result;
}

export function sensorFunctionGroup(category: string) {
  return SENSOR_FUNCTION_GROUPS.find((group) => group.categories.some((name) => name === category)) ?? null;
}

export function getItemFunctionCategories(item: InstalledItem, storageCategory: string) {
  const categories = item.functionCategories?.filter(Boolean).map(canonicalCategoryName) ?? [];
  return categories.length ? Array.from(new Set(categories)) : [storageCategory];
}

export function withItemFunctionCategories(
  item: InstalledItem,
  categories: string[],
  categoryIds: Map<string, string>,
): InstalledItem {
  const unique = Array.from(new Set(categories.filter(Boolean)));
  return {
    ...item,
    functionCategories: unique,
    functionCategoryIds: unique.map((name) => categoryIds.get(name)).filter((id): id is string => Boolean(id)),
  };
}

export function inventoryCategoryEntries(inventory: Inventory, category: string): InventoryCategoryEntry[] {
  const seenIds = new Set<string>();
  return Object.entries(inventory).flatMap(([storageCategory, items]) => items
    .filter((item) => getItemFunctionCategories(item, storageCategory).some((name) => categoryNamesEquivalent(name, category)))
    .filter((item) => {
      if (!item.id || seenIds.has(item.id)) return !item.id;
      seenIds.add(item.id);
      return true;
    })
    .map((item) => ({ storageCategory: canonicalCategoryName(storageCategory), item })));
}

export function inventoryCategoryNames(inventory: Inventory) {
  const result = new Set(Object.keys(inventory).map(canonicalCategoryName));
  for (const [storageCategory, items] of Object.entries(inventory)) {
    for (const item of items) {
      for (const category of getItemFunctionCategories(item, storageCategory)) result.add(canonicalCategoryName(category));
    }
  }
  return Array.from(result);
}

export function isRecognizableInventoryItem(item: InstalledItem) {
  return item.itemKind === "material"
    ? Boolean(item.material?.trim())
    : Boolean(item.brand?.trim() && item.model?.trim());
}

export function inventoryCategoryIsFilled(inventory: Inventory, category: string) {
  return inventoryCategoryEntries(inventory, category).some(({ item }) => isRecognizableInventoryItem(item));
}

export function physicalUnitCount(inventory: Inventory) {
  const ids = new Set<string>();
  let anonymousCount = 0;
  for (const items of Object.values(inventory)) {
    for (const item of items) {
      if (!isRecognizableInventoryItem(item)) continue;
      const units = Array.isArray(item.units) && item.units.length > 0 ? item.units : null;
      if (units) {
        for (const unit of units) {
          const id = typeof unit?.id === "string" ? unit.id.trim() : "";
          if (id) ids.add(id);
          else anonymousCount += 1;
        }
        continue;
      }
      const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
      anonymousCount += quantity;
    }
  }
  return ids.size + anonymousCount;
}

export function recordedCategoryCount(inventory: Inventory) {
  return inventoryCategoryNames(inventory).filter((category) => inventoryCategoryIsFilled(inventory, category)).length;
}

export function removeInventoryCategory(
  inventory: Inventory,
  category: string,
  categoryIds: Map<string, string>,
) {
  const next: Inventory = {};
  for (const [storageCategory, items] of Object.entries(inventory)) {
    for (const item of items) {
      const currentFunctions = getItemFunctionCategories(item, storageCategory);
      if (!currentFunctions.some((name) => categoryNamesEquivalent(name, category))) {
        const destination = categoryNamesEquivalent(storageCategory, category) ? currentFunctions[0] : canonicalCategoryName(storageCategory);
        next[destination] = [...(next[destination] ?? []), item];
        continue;
      }
      const remainingFunctions = currentFunctions.filter((name) => !categoryNamesEquivalent(name, category));
      if (!remainingFunctions.length) continue;
      const destination = categoryNamesEquivalent(storageCategory, category) ? remainingFunctions[0] : canonicalCategoryName(storageCategory);
      next[destination] = [
        ...(next[destination] ?? []),
        withItemFunctionCategories(item, remainingFunctions, categoryIds),
      ];
    }
  }
  delete next[category];
  return next;
}
