"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import type { Product, ProductProposal } from "../types/inventory";
import type { ProductAlias } from "../lib/product-qc";

type ProposalRow = {
  id: string;
  proposed_brand: string;
  proposed_model: string;
  status: ProductProposal["status"];
  resolved_product_id: string | null;
  review_note: string | null;
  resolved_product: { brand: string; model: string } | Array<{ brand: string; model: string }> | null;
};
type ProductRow = { id: string; brand: string; model: string; active: boolean; source_origin: string; spreadsheet_synced: boolean };
type AliasRow = { product_id: string; brand_alias: string; model_alias: string };

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function useProductCatalog(stationId: string) {
  const [liveProducts, setLiveProducts] = useState<Product[]>([]);
  const [aliases, setAliases] = useState<ProductAlias[]>([]);
  const [proposals, setProposals] = useState<ProductProposal[]>([]);

  const refresh = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const [productResult, aliasResult, proposalResult] = await Promise.all([
      client.from("products").select("id, brand, model, active, source_origin, spreadsheet_synced").eq("active", true),
      client.from("product_aliases").select("product_id, brand_alias, model_alias"),
      stationId
        ? client.from("product_proposals").select("id, proposed_brand, proposed_model, status, resolved_product_id, review_note, resolved_product:products!product_proposals_resolved_product_id_fkey(brand, model)").eq("station_id", stationId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (!productResult.error) {
      setLiveProducts(((productResult.data ?? []) as ProductRow[]).map((row) => ({
        productId: row.id,
        brand: row.brand,
        model: row.model,
        active: row.active,
        sourceOrigin: row.source_origin as Product["sourceOrigin"],
        spreadsheetSynced: row.spreadsheet_synced,
      })));
    }
    if (!aliasResult.error) {
      setAliases(((aliasResult.data ?? []) as AliasRow[]).map((row) => ({
        productId: row.product_id,
        brand: row.brand_alias,
        model: row.model_alias,
      })));
    }
    if (!proposalResult.error) {
      setProposals(((proposalResult.data ?? []) as ProposalRow[]).map((row) => {
        const resolved = one(row.resolved_product);
        return {
          id: row.id,
          proposedBrand: row.proposed_brand,
          proposedModel: row.proposed_model,
          status: row.status,
          resolvedProductId: row.resolved_product_id ?? undefined,
          resolvedBrand: resolved?.brand,
          resolvedModel: resolved?.model,
          reviewNote: row.review_note ?? undefined,
        };
      }));
    }
  }, [stationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const products = useMemo(() => [...liveProducts].sort((left, right) => `${left.brand} ${left.model}`.localeCompare(`${right.brand} ${right.model}`, "id")), [liveProducts]);

  const proposalMap = useMemo(() => new Map(proposals.map((proposal) => [proposal.id, proposal])), [proposals]);
  return { products, aliases, proposals, proposalMap, refresh };
}
