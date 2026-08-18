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
  brandFamilyCoverage: number;
  confidence: "Sangat mirip" | "Mirip" | "Kemungkinan";
  kind: "recommended" | "nearest";
};

export type ProductSearchRank = {
  product: MergeRecommendationProduct;
  score: number;
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

function productSearchTokens(value: string) {
  return value.toLocaleLowerCase("id-ID").split(/[^a-z0-9+]+/).filter((token) => token.length >= 2);
}

function searchVariantScore(query: string, tokens: string[], brand: string, model: string) {
  const normalizedBrand = normalizeRecommendationText(brand);
  const normalizedModel = normalizeRecommendationText(model);
  const combined = `${normalizedBrand}${normalizedModel}`;
  const matchedTokens = tokens.filter((token) => normalizedBrand.includes(token) || normalizedModel.includes(token));
  const tokenCoverage = tokens.length ? matchedTokens.length / tokens.length : 0;
  const exactBrand = query === normalizedBrand;
  const exactModel = query === normalizedModel;
  const exactCombined = query === combined;
  const contains = combined.includes(query) || query.includes(normalizedBrand) || query.includes(normalizedModel);
  const fuzzy = Math.max(similarity(query, normalizedBrand), similarity(query, normalizedModel), similarity(query, combined));
  const plausible = exactBrand || exactModel || exactCombined || contains || tokenCoverage >= 0.5 || (query.length >= 4 && fuzzy >= 0.78);
  if (!plausible) return 0;

  const brandTokenMatch = tokens.some((token) => normalizedBrand === token || normalizedBrand.includes(token));
  return (exactBrand ? 1.2 : 0)
    + (exactModel ? 1.1 : 0)
    + (exactCombined ? 1.3 : 0)
    + (brandTokenMatch ? 0.55 : 0)
    + tokenCoverage * 0.7
    + (contains ? 0.35 : 0)
    + fuzzy * 0.2;
}

export function rankProductSearch(
  queryValue: string,
  products: MergeRecommendationProduct[],
  aliases: ProductAlias[] = [],
) {
  const query = normalizeRecommendationText(queryValue);
  const tokens = productSearchTokens(queryValue);
  if (query.length < 2) return [];
  const aliasesByProduct = new Map<string, ProductAlias[]>();
  for (const alias of aliases) {
    const current = aliasesByProduct.get(alias.productId) ?? [];
    current.push(alias);
    aliasesByProduct.set(alias.productId, current);
  }
  return products.filter((product) => product.active).map((product) => {
    const variants = [{ brand: product.brand, model: product.model }, ...(aliasesByProduct.get(product.id) ?? [])];
    return { product, score: Math.max(...variants.map((variant) => searchVariantScore(query, tokens, variant.brand, variant.model))) };
  }).filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score
      || left.product.brand.localeCompare(right.product.brand, "id-ID")
      || left.product.model.localeCompare(right.product.model, "id-ID")
      || left.product.id.localeCompare(right.product.id));
}

const BRAND_FAMILY_THRESHOLD = 0.72;
const PARTIAL_BRAND_THRESHOLD = 0.52;
const MODEL_FAMILY_THRESHOLD = 0.42;

function recommendationConfidence(score: number, coverage: number, brandFamilyCoverage: number): MergeRecommendationRank["confidence"] {
  if (score >= 0.86 && coverage >= 0.8 && brandFamilyCoverage >= 0.8) return "Sangat mirip";
  if (score >= 0.64 && coverage >= 0.5) return "Mirip";
  return "Kemungkinan";
}

function recommendationMatchScore(brandSimilarity: number, modelSimilarity: number) {
  if (brandSimilarity >= BRAND_FAMILY_THRESHOLD) {
    return Math.min(1, brandSimilarity * 0.74 + modelSimilarity * 0.26 + 0.08);
  }
  if (brandSimilarity >= PARTIAL_BRAND_THRESHOLD) {
    return brandSimilarity * 0.7 + modelSimilarity * 0.2;
  }
  // Exact model may remain a last-resort fallback, but cannot outrank a plausible brand family.
  return Math.max(0, brandSimilarity * 0.25 + modelSimilarity * 0.35 - 0.15);
}

export function hasMixedMergeProposalFamilies(proposals: MergeRecommendationProposal[]) {
  if (proposals.length < 2) return false;
  let comparisons = 0;
  let mismatches = 0;
  for (let left = 0; left < proposals.length; left += 1) {
    for (let right = left + 1; right < proposals.length; right += 1) {
      comparisons += 1;
      const brandSimilarity = similarity(normalizeRecommendationText(proposals[left].proposedBrand), normalizeRecommendationText(proposals[right].proposedBrand));
      const modelSimilarity = similarity(normalizeRecommendationText(proposals[left].proposedModel), normalizeRecommendationText(proposals[right].proposedModel));
      if (brandSimilarity < PARTIAL_BRAND_THRESHOLD || modelSimilarity < MODEL_FAMILY_THRESHOLD) mismatches += 1;
    }
  }
  return mismatches / comparisons >= 0.5;
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
        return { brandSimilarity, modelSimilarity, combinedScore: recommendationMatchScore(brandSimilarity, modelSimilarity) };
      }).sort((left, right) => right.combinedScore - left.combinedScore)[0]!;
    });
    const brandSimilarity = matches.reduce((total, match) => total + match.brandSimilarity, 0) / matches.length;
    const modelSimilarity = matches.reduce((total, match) => total + match.modelSimilarity, 0) / matches.length;
    const combinedScore = matches.reduce((total, match) => total + match.combinedScore, 0) / matches.length;
    const strongest = Math.max(...matches.map((match) => match.combinedScore));
    const coverage = matches.filter((match) => match.combinedScore >= 0.58).length / matches.length;
    const brandFamilyCoverage = matches.filter((match) => match.brandSimilarity >= BRAND_FAMILY_THRESHOLD).length / matches.length;
    const modelExactCoverage = matches.filter((match) => match.modelSimilarity === 1).length / matches.length;
    const exactCoverage = matches.filter((match) => match.brandSimilarity === 1 && match.modelSimilarity === 1).length / matches.length;
    const finalScore = Math.min(1, combinedScore * 0.6 + strongest * 0.15 + coverage * 0.1 + brandFamilyCoverage * 0.12 + exactCoverage * 0.03);
    return { product, brandSimilarity, modelSimilarity, combinedScore, coverage, brandFamilyCoverage, modelExactCoverage, finalScore, strongest };
  }).sort((left, right) => right.finalScore - left.finalScore
    || right.coverage - left.coverage
    || right.combinedScore - left.combinedScore
    || left.product.brand.localeCompare(right.product.brand, "id-ID")
    || left.product.model.localeCompare(right.product.model, "id-ID")
    || left.product.id.localeCompare(right.product.id));

  const enoughCoverage = proposals.length === 1 ? 1 : 0.6;
  const recommended = ranked.filter((candidate) => candidate.finalScore >= 0.64
    && candidate.coverage >= enoughCoverage
    && candidate.brandFamilyCoverage >= enoughCoverage);
  const visible = recommended.length ? recommended : ranked.filter((candidate) => candidate.finalScore >= 0.42
    && candidate.strongest >= 0.58
    && (candidate.brandFamilyCoverage > 0 || candidate.modelExactCoverage >= enoughCoverage));
  const kind: MergeRecommendationRank["kind"] = recommended.length ? "recommended" : "nearest";
  return visible.slice(0, 5).map((candidate) => ({
    product: candidate.product,
    brandSimilarity: candidate.brandSimilarity,
    modelSimilarity: candidate.modelSimilarity,
    combinedScore: candidate.combinedScore,
    coverage: candidate.coverage,
    brandFamilyCoverage: candidate.brandFamilyCoverage,
    finalScore: candidate.finalScore,
    kind,
    confidence: recommendationConfidence(candidate.finalScore, candidate.coverage, candidate.brandFamilyCoverage),
  }));
}

export function recommendStationProducts(
  brand: string,
  model: string,
  products: MergeRecommendationProduct[],
  aliases: ProductAlias[] = [],
) {
  if (normalizeRecommendationText(brand).length < 2 && normalizeRecommendationText(model).length < 3) return [];
  return rankMergeProducts([{ proposedBrand: brand, proposedModel: model }], products, aliases);
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
