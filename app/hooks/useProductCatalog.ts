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
const PAGE_SIZE = 60;

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function useProductCatalog(stationId: string, search = "") {
  const [liveProducts, setLiveProducts] = useState<Product[]>([]);
  const [aliases, setAliases] = useState<ProductAlias[]>([]);
  const [proposals, setProposals] = useState<ProductProposal[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    try {
      const [productResponse, aliasResult, proposalResult] = await Promise.all([
      fetch(`/api/products?${params.toString()}`, { cache: "no-store" }),
      client.from("product_aliases").select("product_id, brand_alias, model_alias"),
      stationId
        ? client.from("product_proposals").select("id, proposed_brand, proposed_model, status, resolved_product_id, review_note, resolved_product:products!product_proposals_resolved_product_id_fkey(brand, model)").eq("station_id", stationId)
        : Promise.resolve({ data: [], error: null }),
      ]);
      const productResult = await productResponse.json() as { rows?: ProductRow[]; totalCount?: number; error?: string };
    if (!productResponse.ok) throw new Error(productResult.error || "Katalog produk gagal dimuat.");
    setLiveProducts((productResult.rows ?? []).map((row) => ({
        productId: row.id,
        brand: row.brand,
        model: row.model,
        active: row.active,
        sourceOrigin: row.source_origin as Product["sourceOrigin"],
        spreadsheetSynced: row.spreadsheet_synced,
      })));
    setTotalCount(productResult.totalCount ?? 0);
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
    } catch {
      setLiveProducts([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, stationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), search.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [refresh, search]);

  const products = useMemo(() => [...liveProducts].sort((left, right) => `${left.brand} ${left.model}`.localeCompare(`${right.brand} ${right.model}`, "id")), [liveProducts]);

  const proposalMap = useMemo(() => new Map(proposals.map((proposal) => [proposal.id, proposal])), [proposals]);
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const findCanonical = useCallback(async (brand: string, model: string) => {
    const params = new URLSearchParams({ page: "1", brand, model });
    const response = await fetch(`/api/products?${params.toString()}`, { cache: "no-store" });
    const result = await response.json() as { rows?: ProductRow[] };
    const row = result.rows?.[0];
    return row ? { productId: row.id, brand: row.brand, model: row.model, active: row.active, sourceOrigin: row.source_origin as Product["sourceOrigin"], spreadsheetSynced: row.spreadsheet_synced } : null;
  }, []);
  return { products, aliases, proposals, proposalMap, refresh, page, pageCount, totalCount, loading, setPage, findCanonical };
}
