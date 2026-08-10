export const AWOS_KAT3_SITE_TYPE = "AWOS Kategori III";

export const AWOS_KAT3_FAMILIES = ["AllWeather", "Coastal", "Degreane", "Microstep"] as const;
export type AwosKat3Family = (typeof AWOS_KAT3_FAMILIES)[number];

const AWOS_KAT3_SUFFIXES = ["End Point", "Mid", "Station", "TDZ"] as const;

function compact(value: string) {
  return value.toLocaleLowerCase("id-ID").replace(/[^a-z0-9]/g, "");
}

export function getAwosKat3Family(siteName: string): AwosKat3Family | null {
  const normalized = compact(siteName);
  return AWOS_KAT3_FAMILIES.find((family) => normalized.includes(compact(family))) ?? null;
}

export function getAllowedSiteSubtypes<T>({
  siteName,
  siteTypeName,
  siteSubtypes,
  getSubtypeName,
}: {
  siteName: string;
  siteTypeName: string;
  siteSubtypes: T[];
  getSubtypeName: (subtype: T) => string;
}) {
  if (siteTypeName !== AWOS_KAT3_SITE_TYPE) return siteSubtypes;
  const family = getAwosKat3Family(siteName);
  if (!family) return [];
  const order = new Map(AWOS_KAT3_SUFFIXES.map((suffix, index) => [suffix, index]));
  const prefix = `${AWOS_KAT3_SITE_TYPE} ${family} `;
  return siteSubtypes
    .filter((subtype) => {
      const name = getSubtypeName(subtype);
      return name.startsWith(prefix) && AWOS_KAT3_SUFFIXES.some((suffix) => name === `${prefix}${suffix}`);
    })
    .sort((left, right) => {
      const leftSuffix = getSubtypeName(left).slice(prefix.length) as (typeof AWOS_KAT3_SUFFIXES)[number];
      const rightSuffix = getSubtypeName(right).slice(prefix.length) as (typeof AWOS_KAT3_SUFFIXES)[number];
      return (order.get(leftSuffix) ?? 99) - (order.get(rightSuffix) ?? 99);
    });
}
