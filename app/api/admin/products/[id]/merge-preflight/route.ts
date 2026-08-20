import { NextResponse } from "next/server";
import { parseProductMergeRequest, PRODUCT_UUID_PATTERN, productDependencyRpcError, productMergeConflictMessage, requireProductDependencyClient } from "../../../../../lib/admin-product-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!PRODUCT_UUID_PATTERN.test(id)) return NextResponse.json({ error: "ID produk sumber tidak valid." }, { status: 400 });
  const auth = await requireProductDependencyClient(request);
  if ("response" in auth) return auth.response;
  const parsed = parseProductMergeRequest(await request.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: "Produk tujuan tidak valid." }, { status: 400 });
  const { data, error } = await auth.client.rpc("admin_product_merge_preflight", {
    p_source_product_id: id,
    p_target_product_id: parsed.targetProductId,
  });
  if (error) return productDependencyRpcError(error, "Preflight merge Produk gagal.");
  const result = data as { status?: string } | null;
  if (!result?.status) return NextResponse.json({ error: "Hasil preflight merge tidak valid." }, { status: 400 });
  return NextResponse.json({ preflight: result, message: result.status === "ready" ? null : productMergeConflictMessage(result.status) });
}
