import type { InstalledItem, Product, ProductProposal } from "../types/inventory";

export type ProductAlias = {
  productId: string;
  brand: string;
  model: string;
};

export type MergeRecommendationProduct = {
  id: string;
  brand: string;
  model: string;
  active: boolean;
};

export type MergeRecommendationProposal = {
  proposedBrand: string;
  proposedModel: string;
};

export type MergeRecommendationRank = {
  product: MergeRecommendationProduct;
  brandSimilarity: number;
  modelSimilarity: number;
  combinedScore: number;
  coverage: number;
  finalScore: number;
  confidence: "Sangat mirip" | "Mirip" | "Kemungkinan";
  kind: "recommended" | "nearest";
};

export function normalizeProductText(value: string) {
  return value.trim().toLocaleLowerCase("id-ID").replace(/[^a-z0-9]+/g, "");
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.82;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function normalizeRecommendationText(value: string) {
  return value.trim().toLocaleLowerCase("id-ID").replace(/[^a-z0-9+]+/g, "");
}

function recommendationConfidence(score: number): MergeRecommendationRank["confidence"] {
  if (score >= 0.86) return "Sangat mirip";
  if (score >= 0.68) return "Mirip";
  return "Kemungkinan";
}

export function rankMergeProducts(
  proposals: MergeRecommendationProposal[],
  products: MergeRecommendationProduct[],
  aliases: ProductAlias[] = [],
) {
  if (!proposals.length) return [];

  const activeProducts = products.filter((product) => product.active);
  const aliasesByProduct = new Map<string, ProductAlias[]>();
  for (const alias of aliases) {
    const current = aliasesByProduct.get(alias.productId) ?? [];
    current.push(alias);
    aliasesByProduct.set(alias.productId, current);
  }

  const ranked = activeProducts.map((product) => {
    const names = [{ brand: product.brand, model: product.model }, ...(aliasesByProduct.get(product.id) ?? [])];
    const matches = proposals.map((proposal) => {
      const normalizedBrand = normalizeRecommendationText(proposal.proposedBrand);
      const normalizedModel = normalizeRecommendationText(proposal.proposedModel);
      return names.map((name) => {
        const brandSimilarity = similarity(normalizedBrand, normalizeRecommendationText(name.brand));
        const modelSimilarity = similarity(normalizedModel, normalizeRecommendationText(name.model));
        return { brandSimilarity, modelSimilarity, combinedScore: brandSimilarity * 0.55 + modelSimilarity * 0.45 };
      }).sort((left, right) => right.combinedScore - left.combinedScore)[0]!;
    });
    const brandSimilarity = matches.reduce((total, match) => total + match.brandSimilarity, 0) / matches.length;
    const modelSimilarity = matches.reduce((total, match) => total + match.modelSimilarity, 0) / matches.length;
    const combinedScore = matches.reduce((total, match) => total + match.combinedScore, 0) / matches.length;
    const strongest = Math.max(...matches.map((match) => match.combinedScore));
    const coverage = matches.filter((match) => match.combinedScore >= 0.52).length / matches.length;
    const exactCoverage = matches.filter((match) => match.brandSimilarity === 1 && match.modelSimilarity === 1).length / matches.length;
    const finalScore = Math.min(1, combinedScore * 0.7 + strongest * 0.2 + coverage * 0.07 + exactCoverage * 0.03);
    return { product, brandSimilarity, modelSimilarity, combinedScore, coverage, finalScore, strongest };
  }).sort((left, right) => right.finalScore - left.finalScore
    || right.coverage - left.coverage
    || right.combinedScore - left.combinedScore
    || left.product.brand.localeCompare(right.product.brand, "id-ID")
    || left.product.model.localeCompare(right.product.model, "id-ID")
    || left.product.id.localeCompare(right.product.id));

  const enoughCoverage = proposals.length === 1 ? 1 : 0.6;
  const recommended = ranked.filter((candidate) => candidate.finalScore >= 0.62 && candidate.coverage >= enoughCoverage);
  const visible = recommended.length ? recommended : ranked.filter((candidate) => candidate.strongest >= 0.62 && candidate.finalScore >= 0.46);
  const kind: MergeRecommendationRank["kind"] = recommended.length ? "recommended" : "nearest";
  return visible.slice(0, 5).map((candidate) => ({
    product: candidate.product,
    brandSimilarity: candidate.brandSimilarity,
    modelSimilarity: candidate.modelSimilarity,
    combinedScore: candidate.combinedScore,
    coverage: candidate.coverage,
    finalScore: candidate.finalScore,
    kind,
    confidence: recommendationConfidence(candidate.finalScore),
  }));
}

export function recommendMergeProducts(
  proposals: MergeRecommendationProposal[],
  products: MergeRecommendationProduct[],
  aliases: ProductAlias[] = [],
) {
  return rankMergeProducts(proposals, products, aliases).map(({ product }) => product);
}

export function suggestProducts(
  brand: string,
  model: string,
  products: Product[],
  aliases: ProductAlias[] = [],
) {
  const normalizedBrand = normalizeProductText(brand);
  const normalizedModel = normalizeProductText(model);
  if (!normalizedBrand || !normalizedModel) return [];

  const byId = new Map(products.filter((product) => product.productId).map((product) => [product.productId!, product]));
  const candidates = [
    ...products.map((product) => ({ product, brand: product.brand, model: product.model })),
    ...aliases.flatMap((alias) => {
      const product = byId.get(alias.productId);
      return product ? [{ product, brand: alias.brand, model: alias.model }] : [];
    }),
  ];
  const scored = candidates.map(({ product, brand: candidateBrand, model: candidateModel }) => ({
    product,
    score: similarity(normalizedBrand, normalizeProductText(candidateBrand)) * 0.4
      + similarity(normalizedModel, normalizeProductText(candidateModel)) * 0.6,
  })).filter((candidate) => candidate.score >= 0.66);

  const bestByProduct = new Map<string, (typeof scored)[number]>();
  for (const candidate of scored) {
    const key = candidate.product.productId ?? `${candidate.product.brand}\u001f${candidate.product.model}`;
    const previous = bestByProduct.get(key);
    if (!previous || candidate.score > previous.score) bestByProduct.set(key, candidate);
  }
  return [...bestByProduct.values()].sort((left, right) => right.score - left.score).slice(0, 5).map(({ product }) => product);
}

export function resolveInstalledProduct(item: InstalledItem, proposals: Map<string, ProductProposal>) {
  if (!item.productProposalId) return { brand: item.brand, model: item.model, status: item.proposalStatus };
  const proposal = proposals.get(item.productProposalId);
  if (!proposal) return { brand: item.brand, model: item.model, status: item.proposalStatus ?? "PENDING" };
  if ((proposal.status === "APPROVED" || proposal.status === "MERGED") && proposal.resolvedBrand && proposal.resolvedModel) {
    return { brand: proposal.resolvedBrand, model: proposal.resolvedModel, status: proposal.status };
  }
  return { brand: item.brand, model: item.model, status: proposal.status, reviewNote: proposal.reviewNote };
}
