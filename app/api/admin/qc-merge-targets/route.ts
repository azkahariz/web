import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPublicSupabaseConfig } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { rankMergeProducts, type ProductAlias } from "../../../lib/product-qc";
import {
  isExactQcMergeTarget,
  normalizeQcMergeTargetPage,
  normalizeQcMergeTargetPageSize,
  qcMergeTargetSearchTerms,
  QC_MERGE_TARGET_MAX_PROPOSALS,
  type QcMergeTargetProduct,
  type QcMergeTargetProposal,
} from "../../../lib/qc-merge-targets";

type RpcError = { code?: string | null };
type ProposalRow = { id: string; proposed_brand: string; proposed_model: string; status: string };
type AliasRow = { id: string; product_id: string; brand_alias: string; model_alias: string };
type RequestBody = { proposalIds?: unknown; search?: unknown; page?: unknown; pageSize?: unknown };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: RpcError, fallback: string) {
  if (error.code === "42501") return NextResponse.json({ error: "Akses Super Admin diperlukan." }, { status: 403 });
  return NextResponse.json({ error: fallback }, { status: 400 });
}

async function authenticatedClient(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const config = getPublicSupabaseConfig();
  const client = bearer && config
    ? createClient(config.url, config.publishableKey, { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { autoRefreshToken: false, persistSession: false } })
    : await createSupabaseServerClient();
  if (!client) return { response: NextResponse.json({ error: "Konfigurasi Supabase belum tersedia." }, { status: 503 }) };
  const { data } = await client.auth.getUser(bearer);
  if (!data.user) return { response: NextResponse.json({ error: "Belum login." }, { status: 401 }) };
  return { client };
}

export async function POST(request: Request) {
  const auth = await authenticatedClient(request);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null) as RequestBody | null;
  const proposalIds = Array.isArray(body?.proposalIds)
    ? [...new Set(body.proposalIds.filter((value): value is string => typeof value === "string" && UUID_PATTERN.test(value)))]
    : [];
  if (!proposalIds.length || proposalIds.length > QC_MERGE_TARGET_MAX_PROPOSALS) {
    return NextResponse.json({ error: `Pilih 1-${QC_MERGE_TARGET_MAX_PROPOSALS} proposal PENDING.` }, { status: 400 });
  }

  const { error: authorizationError } = await auth.client.rpc("admin_product_summary");
  if (authorizationError) return errorResponse(authorizationError, "Akses target merge gagal divalidasi.");

  const proposalResult = await auth.client.from("product_proposals")
    .select("id, proposed_brand, proposed_model, status")
    .in("id", proposalIds);
  if (proposalResult.error) return errorResponse(proposalResult.error, "Proposal QC gagal dimuat.");
  const proposalRows = (proposalResult.data ?? []) as ProposalRow[];
  if (proposalRows.length !== proposalIds.length || proposalRows.some((proposal) => proposal.status !== "PENDING")) {
    return NextResponse.json({ error: "Proposal sudah berubah. Muat ulang antrean QC." }, { status: 409 });
  }
  const proposals: QcMergeTargetProposal[] = proposalRows.map((proposal) => ({
    id: proposal.id,
    proposedBrand: proposal.proposed_brand,
    proposedModel: proposal.proposed_model,
  }));

  const page = normalizeQcMergeTargetPage(body?.page);
  const pageSize = normalizeQcMergeTargetPageSize(body?.pageSize);
  const terms = qcMergeTargetSearchTerms(body?.search);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = auth.client.from("products")
    .select("id, brand, model, active", { count: "exact" })
    .eq("active", true).is("merged_into_product_id", null);
  for (const term of terms) query = query.or(`brand.ilike.%${term}%,model.ilike.%${term}%`);
  const result = await query.order("brand").order("model").order("id").range(from, to);
  if (result.error) return errorResponse(result.error, "Target merge gagal dimuat.");
  const rows = ((result.data ?? []) as QcMergeTargetProduct[]).map((product) => ({
    ...product,
    exactMatch: isExactQcMergeTarget(proposals, product),
  }));

  let recommendations: Array<{ product: QcMergeTargetProduct; confidence: string; kind: "recommended" | "nearest" }> = [];
  if (!terms.length) {
    const allProducts: QcMergeTargetProduct[] = [];
    const allAliases: AliasRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const batch = await auth.client.from("products").select("id, brand, model, active")
        .eq("active", true).is("merged_into_product_id", null).order("id").range(offset, offset + 999);
      if (batch.error) return errorResponse(batch.error, "Rekomendasi target merge gagal dimuat.");
      allProducts.push(...((batch.data ?? []) as QcMergeTargetProduct[]));
      if ((batch.data?.length ?? 0) < 1000) break;
    }
    for (let offset = 0; ; offset += 1000) {
      const batch = await auth.client.from("product_aliases").select("id, product_id, brand_alias, model_alias")
        .order("product_id").order("id").range(offset, offset + 999);
      if (batch.error) return errorResponse(batch.error, "Alias target merge gagal dimuat.");
      allAliases.push(...((batch.data ?? []) as AliasRow[]));
      if ((batch.data?.length ?? 0) < 1000) break;
    }
    const aliases: ProductAlias[] = allAliases.map((alias) => ({ productId: alias.product_id, brand: alias.brand_alias, model: alias.model_alias }));
    recommendations = rankMergeProducts(proposals, allProducts, aliases).map((recommendation) => ({
      product: { ...recommendation.product, exactMatch: isExactQcMergeTarget(proposals, recommendation.product) },
      confidence: recommendation.confidence,
      kind: recommendation.kind,
    }));
  }

  return NextResponse.json({ page, pageSize, totalCount: result.count ?? 0, rows, recommendations });
}
