import { NextResponse } from "next/server";
import { PRODUCT_UUID_PATTERN, productDependencyRpcError, requireProductDependencyClient } from "../../../../../lib/admin-product-api";

function pageSize(value: string | null) {
  const parsed = Number(value ?? "50");
  return [50, 100, 200].includes(parsed) ? parsed : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!PRODUCT_UUID_PATTERN.test(id)) return NextResponse.json({ error: "ID produk tidak valid." }, { status: 400 });
  const auth = await requireProductDependencyClient(request);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const size = pageSize(url.searchParams.get("pageSize"));
  if (size === null) return NextResponse.json({ error: "Baris per halaman harus 50, 100, atau 200." }, { status: 400 });
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const archiveScope = ["ALL", "CURRENT", "ARCHIVED"].includes((url.searchParams.get("archive") || "ALL").toUpperCase())
    ? (url.searchParams.get("archive") || "ALL").toUpperCase()
    : "ALL";
  const { data, error } = await auth.client.rpc("admin_product_direct_references", {
    p_product_id: id,
    p_page: page,
    p_page_size: size,
    p_search: url.searchParams.get("search")?.trim() || null,
    p_archive_scope: archiveScope,
  });
  if (error) return productDependencyRpcError(error, "Referensi produk gagal dimuat.");
  return NextResponse.json({ references: data });
}
