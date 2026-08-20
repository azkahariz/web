import { rankMergeProducts, type MergeRecommendationProduct, type ProductAlias } from "./product-qc.ts";

export type ProductMergeCandidate = MergeRecommendationProduct & {
  mergedIntoProductId?: string | null;
};

export function productMergeRecommendationReason(candidate: ReturnType<typeof rankMergeProducts>[number]) {
  const signals: string[] = [];
  if (candidate.brandSimilarity === 1) signals.push("Merek sama");
  else if (candidate.brandFamilyCoverage > 0) signals.push("Merek serupa");
  if (candidate.modelSimilarity === 1) signals.push("Tipe sama");
  if (!signals.length) signals.push(candidate.kind === "nearest" ? "Kandidat terdekat" : "Merk dan Tipe serupa");
  signals.push(candidate.confidence);
  return signals.join(" · ");
}

export function rankProductMergeTargets(
  source: Pick<MergeRecommendationProduct, "id" | "brand" | "model">,
  candidates: ProductMergeCandidate[],
  aliases: ProductAlias[] = [],
) {
  const eligibleCandidates = candidates.filter((candidate) => candidate.id !== source.id
    && candidate.active
    && !candidate.mergedIntoProductId);
  return rankMergeProducts(
    [{ proposedBrand: source.brand, proposedModel: source.model }],
    eligibleCandidates,
    aliases,
  );
}
