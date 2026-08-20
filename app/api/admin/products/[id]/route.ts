import { NextResponse } from "next/server";
import { PRODUCT_UUID_PATTERN, productDeleteConflictMessage, productDependencyRpcError, requireProductDependencyClient } from "../../../../lib/admin-product-api";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!PRODUCT_UUID_PATTERN.test(id)) return NextResponse.json({ error: "ID produk tidak valid." }, { status: 400 });
  const auth = await requireProductDependencyClient(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null) as { preflightToken?: unknown } | null;
  if (typeof body?.preflightToken !== "string" || !body.preflightToken.trim()) {
    return NextResponse.json({ error: "Konfirmasi preflight hapus tidak valid." }, { status: 400 });
  }
  const { data, error } = await auth.client.rpc("admin_delete_product", {
    p_product_id: id,
    p_preflight_token: body.preflightToken.trim(),
  });
  if (error) return productDependencyRpcError(error, "Produk gagal dihapus permanen.");
  const result = data as { status?: string } | null;
  if (result?.status !== "deleted") {
    const status = result?.status ?? "invalid_delete";
    return NextResponse.json({ error: productDeleteConflictMessage(status), result }, { status: 409 });
  }
  return NextResponse.json({ result });
}
