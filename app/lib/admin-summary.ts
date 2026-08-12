export type SummarySite = { id: string; site_type_id: string };
export type SummarySiteType = { id: string; name: string };
export type SiteTypeSummary = { id: string; name: string; count: number };

export function summarizeSitesByType(
  sites: SummarySite[],
  siteTypes: SummarySiteType[],
) {
  const counts = new Map<string, number>();
  const seenSites = new Set<string>();
  for (const site of sites) {
    if (seenSites.has(site.id)) continue;
    seenSites.add(site.id);
    counts.set(site.site_type_id, (counts.get(site.site_type_id) ?? 0) + 1);
  }

  const result = siteTypes
    .map((siteType) => ({
      id: siteType.id,
      name: siteType.name,
      count: counts.get(siteType.id) ?? 0,
    }))
    .filter((siteType) => siteType.count > 0);
  const mappedCount = result.reduce((total, siteType) => total + siteType.count, 0);
  const untypedCount = seenSites.size - mappedCount;
  if (untypedCount > 0) result.push({ id: "unmapped", name: "Belum terpetakan", count: untypedCount });
  return { totalCount: seenSites.size, byType: result };
}
