export type AdminStation = { id: string; name: string };
export type AdminSite = { id: string; station_id: string; site_type_id: string; name: string };
export type AdminSiteType = { id: string; name: string };
export type AdminSubtype = { id: string; site_type_id: string; name: string };
export type AdminAccount = { station_id: string; username: string };
export type AdminSubmission = { id: string; station_id: string; site_id: string; site_subtype_id: string };

export const ADMIN_PAGE_SIZE = 1000;

export async function loadAllAdminRows<T, TError>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: TError | null }>,
  pageSize = ADMIN_PAGE_SIZE,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await loadPage(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

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

export function buildStationFillingView<
  TSite extends AdminSite,
  TSiteType extends AdminSiteType,
  TSubtype extends AdminSubtype,
  TSubmission extends AdminSubmission,
>(
  stationId: string,
  sites: TSite[],
  siteTypes: TSiteType[],
  subtypes: TSubtype[],
  submissions: TSubmission[],
) {
  const stationSites = distinctStationSites(stationId, sites);
  const stationSubmissions = submissions.filter((submission) => submission.station_id === stationId);
  const siteTypeById = new Map(siteTypes.map((siteType) => [siteType.id, siteType]));
  const rows: Array<{
    site: TSite;
    siteType: TSiteType | null;
    subtype: TSubtype | null;
    submission: TSubmission | null;
  }> = [];

  for (const site of stationSites) {
    const siteType = siteTypeById.get(site.site_type_id) ?? null;
    const validSubtypes = siteType
      ? subtypes.filter((subtype) => subtype.site_type_id === site.site_type_id)
      : [];
    if (!validSubtypes.length) {
      rows.push({ site, siteType, subtype: null, submission: null });
      continue;
    }
    for (const subtype of validSubtypes) {
      const submission = stationSubmissions.find((candidate) => (
        candidate.site_id === site.id && candidate.site_subtype_id === subtype.id
      )) ?? null;
      rows.push({ site, siteType, subtype, submission });
    }
  }

  return {
    siteCount: stationSites.length,
    submissionCount: stationSubmissions.length,
    rows,
  };
}

export function filterStationFillingRows<
  TRow extends { site: { name: string }; siteType: { name: string } | null; subtype: { name: string } | null },
>(stationName: string, rows: TRow[], query: string) {
  const normalizedQuery = searchable(query);
  if (!normalizedQuery || searchable(stationName).includes(normalizedQuery)) return rows;
  return rows.filter((row) => [row.site.name, row.siteType?.name, row.subtype?.name]
    .some((value) => searchable(value).includes(normalizedQuery)));
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
