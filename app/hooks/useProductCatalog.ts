"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import type { Product, ProductProposal } from "../types/inventory";
import { PRODUCT_PICKER_PAGE_SIZE } from "../lib/product-picker";

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
type RecommendationRow = ProductRow & { confidence: "Sangat mirip" | "Mirip" | "Kemungkinan" };
export type ProductRecommendation = Product & { confidence: RecommendationRow["confidence"] };

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function useProductCatalog(stationId: string, search = "", recommendationBrand = "", recommendationModel = "") {
  const [liveProducts, setLiveProducts] = useState<Product[]>([]);
  const [proposals, setProposals] = useState<ProductProposal[]>([]);
  const [page, setPage] = useState(1);
  const [displayPage, setDisplayPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const requestSequenceRef = useRef(0);
  const recommendationSequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setLoading(true);
    setError("");
    const requestSequence = ++requestSequenceRef.current;
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) {
      params.set("mode", "search");
      params.set("search", search.trim());
    }
    try {
      const [productResponse, proposalResult] = await Promise.all([
      fetch(`/api/products?${params.toString()}`, { cache: "no-store" }),
      stationId
        ? client.from("product_proposals").select("id, proposed_brand, proposed_model, status, resolved_product_id, review_note, resolved_product:products!product_proposals_resolved_product_id_fkey(brand, model)").eq("station_id", stationId)
        : Promise.resolve({ data: [], error: null }),
      ]);
      const productResult = await productResponse.json() as { rows?: ProductRow[]; totalCount?: number; error?: string };
      if (!productResponse.ok) throw new Error(productResult.error || "Katalog produk gagal dimuat.");
      if (requestSequence !== requestSequenceRef.current) return;
      setLiveProducts((productResult.rows ?? []).map((row) => ({
        productId: row.id,
        brand: row.brand,
        model: row.model,
        active: row.active,
        sourceOrigin: row.source_origin as Product["sourceOrigin"],
        spreadsheetSynced: row.spreadsheet_synced,
      })));
      setTotalCount(productResult.totalCount ?? 0);
      setDisplayPage(page);
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
      // Pertahankan snapshot sebelumnya agar refresh gagal tidak mengosongkan picker.
      if (requestSequence === requestSequenceRef.current) setError("Katalog produk gagal dimuat.");
    } finally {
      if (requestSequence === requestSequenceRef.current) setLoading(false);
    }
  }, [page, search, stationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), search.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [refresh, search]);

  useEffect(() => {
    const brand = recommendationBrand.trim();
    const model = recommendationModel.trim();
    if (brand.replace(/[^a-z0-9+]/gi, "").length < 2 && model.replace(/[^a-z0-9+]/gi, "").length < 2) {
      recommendationSequenceRef.current += 1;
      const clearTimer = window.setTimeout(() => {
        setRecommendations([]);
        setRecommendationError("");
        setRecommendationLoading(false);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }
    const timer = window.setTimeout(async () => {
      const requestSequence = ++recommendationSequenceRef.current;
      setRecommendationLoading(true);
      setRecommendationError("");
      try {
        const params = new URLSearchParams({ mode: "recommend", brand, model });
        const response = await fetch(`/api/products?${params.toString()}`, { cache: "no-store" });
        const result = await response.json() as { rows?: RecommendationRow[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Produk serupa gagal dimuat.");
        if (requestSequence !== recommendationSequenceRef.current) return;
        setRecommendations((result.rows ?? []).map((row) => ({
          productId: row.id,
          brand: row.brand,
          model: row.model,
          active: row.active,
          sourceOrigin: row.source_origin as Product["sourceOrigin"],
          spreadsheetSynced: row.spreadsheet_synced,
          confidence: row.confidence,
        })));
      } catch {
        if (requestSequence === recommendationSequenceRef.current) setRecommendationError("Produk serupa belum dapat dimuat.");
      } finally {
        if (requestSequence === recommendationSequenceRef.current) setRecommendationLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [recommendationBrand, recommendationModel]);

  const products = useMemo(() => [...liveProducts].sort((left, right) => `${left.brand} ${left.model}`.localeCompare(`${right.brand} ${right.model}`, "id")), [liveProducts]);

  const proposalMap = useMemo(() => new Map(proposals.map((proposal) => [proposal.id, proposal])), [proposals]);
  const pageCount = Math.max(1, Math.ceil(totalCount / PRODUCT_PICKER_PAGE_SIZE));
  const findCanonical = useCallback(async (brand: string, model: string) => {
    const params = new URLSearchParams({ page: "1", brand, model });
    const response = await fetch(`/api/products?${params.toString()}`, { cache: "no-store" });
    const result = await response.json() as { rows?: ProductRow[] };
    const row = result.rows?.[0];
    return row ? { productId: row.id, brand: row.brand, model: row.model, active: row.active, sourceOrigin: row.source_origin as Product["sourceOrigin"], spreadsheetSynced: row.spreadsheet_synced } : null;
  }, []);
  return { products, proposals, proposalMap, refresh, page, displayPage, pageCount, totalCount, loading, error, setPage, findCanonical, recommendations, recommendationLoading, recommendationError };
}
