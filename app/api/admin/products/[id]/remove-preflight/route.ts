import { NextResponse } from "next/server";
import { parseProductRemoveRequest, PRODUCT_UUID_PATTERN, productDependencyRpcError, productRemoveConflictMessage, requireProductDependencyClient } from "../../../../../lib/admin-product-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!PRODUCT_UUID_PATTERN.test(id)) return NextResponse.json({ error: "ID produk sumber tidak valid." }, { status: 400 });
  const auth = await requireProductDependencyClient(request);
  if ("response" in auth) return auth.response;
  const parsed = parseProductRemoveRequest(await request.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: "Pilihan referensi tidak valid." }, { status: 400 });
  const { data, error } = await auth.client.rpc("admin_product_reference_removal_preflight", {
    p_source_product_id: id,
    p_references: parsed.references,
  });
  if (error) return productDependencyRpcError(error, "Preflight penghapusan referensi gagal.");
  const result = data as { status?: string } | null;
  if (!result?.status) return NextResponse.json({ error: "Hasil preflight tidak valid." }, { status: 400 });
  return NextResponse.json({ preflight: result, message: result.status === "ready" ? null : productRemoveConflictMessage(result.status) });
}
