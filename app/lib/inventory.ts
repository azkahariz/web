import type { InstalledItem, Inventory, UnitDetail } from "../types/inventory";

export function isMountingCategory(category: string | null): boolean {
  return Boolean(category && /^mounting\b/i.test(category));
}

export function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("id-ID").trim();
}

export function createUnitDetail(): UnitDetail {
  return {
    id: makeId(),
    serialNumber: "",
    condition: "Baik",
    installedYear: "",
    procurementYear: "",
    procurementActivity: "",
    notes: "",
  };
}

export function getItemUnits(item: InstalledItem): UnitDetail[] {
  if (item.units?.length) return item.units;
  return Array.from({ length: Math.max(1, item.quantity || 1) }, (_, index) => ({
    id: `${item.id}-unit-${index + 1}`,
    serialNumber: index === 0 ? item.serialNumber ?? "" : "",
    condition: index === 0 ? item.condition ?? "Baik" : "Baik",
    installedYear: index === 0 ? item.installedYear ?? "" : "",
    procurementYear: "",
    procurementActivity: "",
    notes: index === 0 ? item.notes ?? "" : "",
  }));
}

export function normalizeWarehouseConditions(inventory: Inventory): Inventory {
  return Object.fromEntries(Object.entries(inventory).map(([category, items]) => [
    category,
    items.map((item) => ({
      ...item,
      condition: "Baik" as const,
      units: item.units?.map((unit) => ({ ...unit, condition: "Baik" as const })),
    })),
  ]));
}
