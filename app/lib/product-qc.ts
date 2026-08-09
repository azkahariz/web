import type { InstalledItem, Product, ProductProposal } from "../types/inventory";

export type ProductAlias = {
  productId: string;
  brand: string;
  model: string;
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
