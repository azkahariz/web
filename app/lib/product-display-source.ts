import type { SupabaseClient } from "@supabase/supabase-js";
import type { InstalledItem, Product, ProductProposal } from "../types/inventory.ts";
import { resolveInstalledProduct } from "./product-qc.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_RESOLUTION_BATCH_SIZE = 100;

type CanonicalResolutionRow = {
  product_id: string;
  canonical_product_id: string;
  brand: string;
  model: string;
};

type ProposalResolutionRow = {
  id: string;
  proposed_brand: string;
  proposed_model: string;
  status: ProductProposal["status"];
  resolved_product_id: string | null;
  review_note: string | null;
};

export type ProductDisplayIdentity = { brand: string; model: string };
export type ProductDisplayByItemId = Record<string, ProductDisplayIdentity>;

function uniqueUuids(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && UUID_PATTERN.test(value))))];
}

export function inventoryProductItems(payloads: unknown[]): InstalledItem[] {
  return payloads.flatMap((payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
    const inventory = (payload as { inventory?: unknown }).inventory;
    if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) return [];
    return Object.values(inventory).flatMap((rows) => Array.isArray(rows)
      ? rows.filter((row): row is InstalledItem => Boolean(row && typeof row === "object" && !Array.isArray(row)))
      : []);
  });
}

export async function loadCanonicalProductMap(client: SupabaseClient, productIds: string[]) {
  const ids = uniqueUuids(productIds);
  const rows: CanonicalResolutionRow[] = [];
  for (let offset = 0; offset < ids.length; offset += PRODUCT_RESOLUTION_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + PRODUCT_RESOLUTION_BATCH_SIZE);
    const result = await client.rpc("resolve_canonical_products", { p_product_ids: batch });
    if (result.error) throw new Error("Identitas Product canonical gagal dimuat.");
    rows.push(...(result.data ?? []) as CanonicalResolutionRow[]);
  }
  return new Map(rows.map((row) => [row.product_id, {
    productId: row.canonical_product_id,
    brand: row.brand,
    model: row.model,
  } satisfies Product]));
}

function proposalMap(rows: ProposalResolutionRow[], canonicalProducts: Map<string, Product>) {
  return new Map(rows.map((row) => {
    const canonical = row.resolved_product_id ? canonicalProducts.get(row.resolved_product_id) : undefined;
    return [row.id, {
      id: row.id,
      proposedBrand: row.proposed_brand,
      proposedModel: row.proposed_model,
      status: row.status,
      resolvedProductId: canonical?.productId ?? row.resolved_product_id ?? undefined,
      resolvedBrand: canonical?.brand,
      resolvedModel: canonical?.model,
      reviewNote: row.review_note ?? undefined,
    } satisfies ProductProposal];
  }));
}

export async function resolveSubmissionProductDisplays(client: SupabaseClient, payload: unknown): Promise<ProductDisplayByItemId> {
  const items = inventoryProductItems([payload]);
  const proposalIds = uniqueUuids(items.map((item) => item.productProposalId));
  const proposalRows: ProposalResolutionRow[] = [];
  for (let offset = 0; offset < proposalIds.length; offset += PRODUCT_RESOLUTION_BATCH_SIZE) {
    const batch = proposalIds.slice(offset, offset + PRODUCT_RESOLUTION_BATCH_SIZE);
    const result = await client.from("product_proposals")
      .select("id, proposed_brand, proposed_model, status, resolved_product_id, review_note")
      .in("id", batch);
    if (result.error) throw new Error("Proposal Product gagal dimuat.");
    proposalRows.push(...(result.data ?? []) as ProposalResolutionRow[]);
  }

  const canonicalProducts = await loadCanonicalProductMap(client, [
    ...items.map((item) => item.productProposalId ? undefined : item.productId),
    ...proposalRows.map((row) => row.status === "APPROVED" || row.status === "MERGED" ? row.resolved_product_id ?? undefined : undefined),
  ].filter((id): id is string => Boolean(id)));
  const proposals = proposalMap(proposalRows, canonicalProducts);

  return Object.fromEntries(items.flatMap((item) => {
    const hasCanonicalReference = item.productProposalId
      ? Boolean(proposals.get(item.productProposalId)?.resolvedProductId)
      : Boolean(item.productId && canonicalProducts.has(item.productId));
    if (!hasCanonicalReference || !item.id) return [];
    const resolved = resolveInstalledProduct(item, proposals, canonicalProducts);
    return [[item.id, { brand: resolved.brand, model: resolved.model }]];
  }));
}
