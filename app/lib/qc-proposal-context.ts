import { stationCategoryName } from "./station-monitoring.ts";

export type QcProposalContext = {
  state: "resolved" | "orphaned" | "missing-submission" | "unavailable";
  siteName: string | null;
  subtypeName: string | null;
  categories: string[];
  stationCategoryId?: string | null;
  siteTypeId?: string | null;
  stationCategoryName?: string | null;
  siteTypeName?: string | null;
  qcContext?: "pengisian" | "gudang" | "tidak-digunakan-saat-ini" | null;
};

type ProposalSource = { id: string; station_id: string; submission_id: string | null };
type SubmissionSource = { id: string; site_id: string; site_subtype_id: string; payload: unknown; archived_at?: string | null };
type NamedSource = { id: string; name: string; site_type_id?: string };
type StationSource = { id: string; station_category_id?: string | null };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function proposalCategoriesById(payload: unknown) {
  const categoriesByProposal = new Map<string, Set<string>>();
  const inventory = record(record(payload)?.inventory);
  if (!inventory) return categoriesByProposal;

  for (const [storageCategory, entries] of Object.entries(inventory)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const item = record(entry);
      if (!item) continue;
      const proposalId = typeof item?.productProposalId === "string" ? item.productProposalId.trim() : "";
      if (!proposalId) continue;
      const functionCategories = Array.isArray(item.functionCategories)
        ? item.functionCategories.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())
        : [];
      const categories = functionCategories.length ? functionCategories : [storageCategory];
      const current = categoriesByProposal.get(proposalId) ?? new Set<string>();
      for (const category of categories) current.add(category);
      categoriesByProposal.set(proposalId, current);
    }
  }
  return categoriesByProposal;
}

export function buildQcProposalContexts(
  proposals: ProposalSource[],
  submissions: SubmissionSource[],
  sites: NamedSource[],
  subtypes: NamedSource[],
  stations: StationSource[] = [],
  siteTypes: NamedSource[] = [],
) {
  const submissionsById = new Map(submissions.map((submission) => [submission.id, submission]));
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const subtypesById = new Map(subtypes.map((subtype) => [subtype.id, subtype.name]));
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const siteTypesById = new Map(siteTypes.map((siteType) => [siteType.id, siteType.name]));
  const enriched = stations.length > 0 || siteTypes.length > 0;
  const categoriesBySubmission = new Map(submissions.map((submission) => [submission.id, proposalCategoriesById(submission.payload)]));

  const contexts = new Map<string, QcProposalContext>();
  for (const proposal of proposals) {
    const submission = proposal.submission_id ? submissionsById.get(proposal.submission_id) : null;
    if (!submission) {
      contexts.set(proposal.id, { state: "missing-submission", siteName: null, subtypeName: null, categories: [], ...(enriched ? { stationCategoryId: null, siteTypeId: null, stationCategoryName: null, siteTypeName: null, qcContext: null } : {}) });
      continue;
    }
    const categories = Array.from(categoriesBySubmission.get(submission.id)?.get(proposal.id) ?? []).sort((left, right) => left.localeCompare(right, "id-ID"));
    const site = sitesById.get(submission.site_id);
    const siteTypeName = site?.site_type_id ? siteTypesById.get(site.site_type_id) ?? null : null;
    const stationCategoryId = stationsById.get(proposal.station_id)?.station_category_id ?? null;
    const siteTypeId = site?.site_type_id ?? null;
    contexts.set(proposal.id, {
      state: categories.length ? "resolved" : "orphaned",
      siteName: site?.name ?? null,
      subtypeName: subtypesById.get(submission.site_subtype_id) ?? null,
      categories,
      ...(enriched ? {
        stationCategoryId,
        siteTypeId,
        stationCategoryName: stationCategoryName(stationCategoryId),
        siteTypeName,
        qcContext: submission.archived_at ? "tidak-digunakan-saat-ini" as const : siteTypeName === "Gudang" ? "gudang" as const : categories.length ? "pengisian" as const : "tidak-digunakan-saat-ini" as const,
      } : {}),
    });
  }
  return contexts;
}
