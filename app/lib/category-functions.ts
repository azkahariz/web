import { getItemUnits } from "./inventory.ts";
import type { InstalledItem, Inventory, MasterDataReferences } from "../types/inventory.ts";

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
  const categories = item.functionCategories?.filter(Boolean) ?? [];
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
  return Object.entries(inventory).flatMap(([storageCategory, items]) => items
    .filter((item) => getItemFunctionCategories(item, storageCategory).includes(category))
    .map((item) => ({ storageCategory, item })));
}

export function inventoryCategoryNames(inventory: Inventory) {
  const result = new Set(Object.keys(inventory));
  for (const [storageCategory, items] of Object.entries(inventory)) {
    for (const item of items) {
      for (const category of getItemFunctionCategories(item, storageCategory)) result.add(category);
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
  return Object.values(inventory).reduce((total, items) => total + items.reduce(
    (itemTotal, item) => itemTotal + (isRecognizableInventoryItem(item) ? getItemUnits(item).length : 0),
    0,
  ), 0);
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
      if (!currentFunctions.includes(category)) {
        const destination = storageCategory === category ? currentFunctions[0] : storageCategory;
        next[destination] = [...(next[destination] ?? []), item];
        continue;
      }
      const remainingFunctions = currentFunctions.filter((name) => name !== category);
      if (!remainingFunctions.length) continue;
      const destination = storageCategory === category ? remainingFunctions[0] : storageCategory;
      next[destination] = [
        ...(next[destination] ?? []),
        withItemFunctionCategories(item, remainingFunctions, categoryIds),
      ];
    }
  }
  delete next[category];
  return next;
}
