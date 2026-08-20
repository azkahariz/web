import { NextResponse } from "next/server";
import { parseProductMoveRequest, PRODUCT_UUID_PATTERN, productDependencyRpcError, productMoveConflictMessage, requireProductDependencyClient } from "../../../../../lib/admin-product-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!PRODUCT_UUID_PATTERN.test(id)) return NextResponse.json({ error: "ID produk sumber tidak valid." }, { status: 400 });
  const auth = await requireProductDependencyClient(request);
  if ("response" in auth) return auth.response;
  const parsed = parseProductMoveRequest(await request.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: "Pilihan referensi atau Produk tujuan tidak valid." }, { status: 400 });
  const { data, error } = await auth.client.rpc("admin_move_product_references", {
    p_source_product_id: id,
    p_target_product_id: parsed.targetProductId,
    p_references: parsed.references,
  });
  if (error) return productDependencyRpcError(error, "Pemindahan referensi gagal.");
  const result = data as { status?: string } | null;
  if (result?.status !== "moved") {
    const status = result?.status ?? "invalid_selection";
    return NextResponse.json({ error: productMoveConflictMessage(status), result }, { status: status === "invalid_selection" ? 400 : 409 });
  }
  return NextResponse.json({ result });
}
