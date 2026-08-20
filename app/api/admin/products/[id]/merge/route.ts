import { NextResponse } from "next/server";
import { parseProductMergeRequest, PRODUCT_UUID_PATTERN, productDependencyRpcError, productMergeConflictMessage, requireProductDependencyClient } from "../../../../../lib/admin-product-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!PRODUCT_UUID_PATTERN.test(id)) return NextResponse.json({ error: "ID produk sumber tidak valid." }, { status: 400 });
  const auth = await requireProductDependencyClient(request);
  if ("response" in auth) return auth.response;
  const parsed = parseProductMergeRequest(await request.json().catch(() => null), true);
  if (!parsed?.preflightToken) return NextResponse.json({ error: "Konfirmasi preflight merge tidak valid." }, { status: 400 });
  const { data, error } = await auth.client.rpc("admin_merge_product", {
    p_source_product_id: id,
    p_target_product_id: parsed.targetProductId,
    p_preflight_token: parsed.preflightToken,
  });
  if (error) return productDependencyRpcError(error, "Merge Produk gagal.");
  const result = data as { status?: string } | null;
  if (result?.status !== "merged") {
    const status = result?.status ?? "invalid_merge";
    return NextResponse.json({ error: productMergeConflictMessage(status), result }, { status: 409 });
  }
  return NextResponse.json({ result });
}
