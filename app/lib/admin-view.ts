export type AdminStation = { id: string; name: string };
export type AdminSite = { id: string; station_id: string; site_type_id: string; name: string };
export type AdminSiteType = { id: string; name: string };
export type AdminSubtype = { site_type_id: string; name: string };
export type AdminAccount = { station_id: string; username: string };

function searchable(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID");
}

export function countDistinctStationSites(stationId: string, sites: Array<Pick<AdminSite, "id" | "station_id">>) {
  return distinctStationSites(stationId, sites).length;
}

export function distinctStationSites<T extends Pick<AdminSite, "id" | "station_id">>(stationId: string, sites: T[]) {
  const uniqueSites = new Map<string, T>();
  for (const site of sites) {
    if (site.station_id === stationId && !uniqueSites.has(site.id)) uniqueSites.set(site.id, site);
  }
  return [...uniqueSites.values()];
}

export function buildStationSiteRows<
  TSite extends Pick<AdminSite, "id" | "station_id">,
  TSubmission extends { id: string; station_id: string; site_id: string },
>(stationId: string, sites: TSite[], submissions: TSubmission[]) {
  const stationSubmissions = submissions.filter((submission) => submission.station_id === stationId);
  const rows: Array<{
    stationSite: TSite;
    submission: TSubmission | null;
    firstSiteRow: boolean;
    siteRowSpan: number;
  }> = [];
  for (const stationSite of distinctStationSites(stationId, sites)) {
    const siteSubmissions = stationSubmissions.filter((submission) => submission.site_id === stationSite.id);
    if (!siteSubmissions.length) {
      rows.push({ stationSite, submission: null, firstSiteRow: true, siteRowSpan: 1 });
      continue;
    }
    siteSubmissions.forEach((submission, index) => rows.push({
      stationSite,
      submission,
      firstSiteRow: index === 0,
      siteRowSpan: siteSubmissions.length,
    }));
  }
  return rows;
}

export function stationMatchesAdminSearch(
  station: AdminStation,
  query: string,
  sites: AdminSite[],
  siteTypes: AdminSiteType[],
  subtypes: AdminSubtype[],
) {
  const normalizedQuery = searchable(query);
  if (!normalizedQuery) return true;
  const stationSites = sites.filter((site) => site.station_id === station.id);
  const siteTypeIds = new Set(stationSites.map((site) => site.site_type_id));
  const values = [
    station.name,
    ...stationSites.map((site) => site.name),
    ...siteTypes.filter((siteType) => siteTypeIds.has(siteType.id)).map((siteType) => siteType.name),
    ...subtypes.filter((subtype) => siteTypeIds.has(subtype.site_type_id)).map((subtype) => subtype.name),
  ];
  return values.some((value) => searchable(value).includes(normalizedQuery));
}

export function accountMatchesAdminSearch(
  account: AdminAccount,
  query: string,
  stationById: Map<string, AdminStation>,
) {
  const normalizedQuery = searchable(query);
  if (!normalizedQuery) return true;
  return searchable(`${stationById.get(account.station_id)?.name ?? ""} ${account.username}`).includes(normalizedQuery);
}

export function adminSearchPlaceholder(tab: "stations" | "accounts" | "qc") {
  if (tab === "stations") return "Cari stasiun, nama alat, tipe, atau subtipe alat...";
  if (tab === "accounts") return "Cari nama stasiun atau username...";
  return "Cari brand, tipe produk, atau stasiun...";
}

export function siteDisplayName(siteId: string, siteById: Map<string, Pick<AdminSite, "name">>) {
  return siteById.get(siteId)?.name ?? "Site tidak ditemukan";
}
