export const QC_MERGE_TARGET_PAGE_SIZE = 50;
export const QC_MERGE_TARGET_MAX_PAGE_SIZE = 100;
export const QC_MERGE_TARGET_MAX_PROPOSALS = 50;

export type QcMergeTargetProduct = {
  id: string;
  brand: string;
  model: string;
  active: boolean;
  exactMatch?: boolean;
};

export type QcMergeTargetProposal = {
  id: string;
  proposedBrand: string;
  proposedModel: string;
};

export function normalizeQcMergeTargetPage(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

export function normalizeQcMergeTargetPageSize(value: unknown) {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(Math.max(value, 10), QC_MERGE_TARGET_MAX_PAGE_SIZE)
    : QC_MERGE_TARGET_PAGE_SIZE;
}

export function qcMergeTargetSearchTerms(value: unknown) {
  if (typeof value !== "string") return [];
  return value.trim().replace(/[(),.%_*/]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8);
}

export function isExactQcMergeTarget(proposals: QcMergeTargetProposal[], product: Pick<QcMergeTargetProduct, "brand" | "model">) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase("id-ID").replace(/[^a-z0-9]+/g, "");
  const brand = normalize(product.brand);
  const model = normalize(product.model);
  return proposals.some((proposal) => normalize(proposal.proposedBrand) === brand
    && normalize(proposal.proposedModel) === model);
}
