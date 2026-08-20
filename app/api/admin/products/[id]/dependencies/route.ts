import { NextResponse } from "next/server";
import { PRODUCT_UUID_PATTERN, productDependencyRpcError, requireProductDependencyClient } from "../../../../../lib/admin-product-api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!PRODUCT_UUID_PATTERN.test(id)) return NextResponse.json({ error: "ID produk tidak valid." }, { status: 400 });
  const auth = await requireProductDependencyClient(request);
  if ("response" in auth) return auth.response;
  const { data, error } = await auth.client.rpc("admin_product_dependencies", { p_product_id: id });
  if (error) return productDependencyRpcError(error, "Dependency produk gagal dimuat.");
  return NextResponse.json({ dependencies: data });
}
