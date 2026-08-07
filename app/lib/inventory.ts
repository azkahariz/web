import type { InstalledItem, SiteSubtype, UnitDetail } from "../types/inventory";

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
    notes: index === 0 ? item.notes ?? "" : "",
  }));
}

export function inferKat3Family(siteName: string, options: SiteSubtype[]): string {
  const normalizedSite = normalizeSearch(siteName).replace(/[^a-z0-9]/g, "");
  const families = options.flatMap((option) => {
    const match = option.subtype.match(/^AWOS Kategori III (.+?) (?:TDZ|Mid|End Point|Station)$/i);
    return match ? [match[1]] : [];
  });
  return families.find((family) => normalizedSite.includes(normalizeSearch(family).replace(/[^a-z0-9]/g, ""))) ?? "";
}
