import { NextResponse } from "next/server";
import { PRODUCT_UUID_PATTERN, productDependencyRpcError, requireProductDependencyClient } from "../../../../../lib/admin-product-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!PRODUCT_UUID_PATTERN.test(id)) return NextResponse.json({ error: "ID produk tidak valid." }, { status: 400 });
  const auth = await requireProductDependencyClient(request);
  if ("response" in auth) return auth.response;
  const { data, error } = await auth.client.rpc("admin_product_delete_preflight", { p_product_id: id });
  if (error) return productDependencyRpcError(error, "Preflight hapus Produk gagal.");
  return NextResponse.json({ preflight: data });
}
