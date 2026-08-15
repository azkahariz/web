import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPublicSupabaseConfig } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type RpcError = { code?: string | null };
type ProductAction = "create" | "update" | "set-active";

function productPageSize(value: string | null) {
  const raw = value?.trim() || "50";
  if (!/^\d+$/.test(raw)) return null;
  const pageSize = Number(raw);
  return Number.isInteger(pageSize) && pageSize >= 10 && pageSize <= 1000 ? pageSize : null;
}

function rpcErrorResponse(error: RpcError, fallback: string) {
  if (error.code === "42501") return NextResponse.json({ error: "Akses Super Admin diperlukan." }, { status: 403 });
  if (error.code === "23505") return NextResponse.json({ error: "Produk dengan Merk dan Tipe tersebut sudah tersedia." }, { status: 409 });
  return NextResponse.json({ error: fallback }, { status: 400 });
}

async function requireAuthenticatedUser(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const config = getPublicSupabaseConfig();
  const client = bearer && config
    ? createClient(config.url, config.publishableKey, { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { autoRefreshToken: false, persistSession: false } })
    : await createSupabaseServerClient();
  if (!client) return { response: NextResponse.json({ error: "Konfigurasi Supabase belum tersedia." }, { status: 503 }) };
  const { data: userData } = await client.auth.getUser(bearer);
  if (!userData.user) return { response: NextResponse.json({ error: "Belum login." }, { status: 401 }) };
  return { client };
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  if (url.searchParams.get("summary") === "1") {
    const { data, error } = await auth.client.rpc("admin_product_summary");
    if (error) return rpcErrorResponse(error, "Ringkasan produk gagal dimuat.");
    return NextResponse.json({ summary: Array.isArray(data) ? data[0] ?? null : data });
  }
  const pageSize = productPageSize(url.searchParams.get("pageSize"));
  if (pageSize === null) return NextResponse.json({ error: "Jumlah per halaman harus berupa bilangan bulat 10-1000." }, { status: 400 });
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const sortField = url.searchParams.get("sort") === "model" ? "model" : "brand";
  const sortDirection = url.searchParams.get("direction") === "desc" ? false : true;
  const search = url.searchParams.get("search")?.trim().replace(/[(),]/g, " ") || "";
  const { error: authorizationError } = await auth.client.rpc("admin_product_summary");
  if (authorizationError) return rpcErrorResponse(authorizationError, "Akses daftar produk gagal divalidasi.");
  let query = auth.client.from("products")
    .select("id, brand, model, active, source_origin", { count: "exact" });
  if (search) query = query.or(`brand.ilike.%${search}%,model.ilike.%${search}%`);
  const secondarySort = sortField === "brand" ? "model" : "brand";
  query = query.order(sortField, { ascending: sortDirection }).order(secondarySort, { ascending: true }).order("id", { ascending: true });
  const { data, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return rpcErrorResponse(error, "Daftar produk gagal dimuat.");
  return NextResponse.json({ totalCount: count ?? 0, rows: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ("response" in auth) return auth.response;
  const body = await request.json() as { action?: ProductAction; productId?: string; brand?: string; model?: string; active?: boolean };
  const action = body.action;
  const rpc = action === "create"
    ? auth.client.rpc("admin_create_product", { p_brand: body.brand?.trim() || "", p_model: body.model?.trim() || "" })
    : action === "update" && body.productId
      ? auth.client.rpc("admin_update_product", { p_product_id: body.productId, p_brand: body.brand?.trim() || "", p_model: body.model?.trim() || "" })
      : action === "set-active" && body.productId && typeof body.active === "boolean"
        ? auth.client.rpc("admin_set_product_active", { p_product_id: body.productId, p_active: body.active })
        : null;
  if (!rpc) return NextResponse.json({ error: "Aksi produk tidak valid." }, { status: 400 });
  const { data, error } = await rpc;
  if (error) return rpcErrorResponse(error, "Aksi produk gagal diproses.");
  if (!data) return NextResponse.json({ error: "Produk tidak ditemukan atau statusnya sudah berubah." }, { status: 404 });
  return NextResponse.json({ ok: true, productId: typeof data === "string" ? data : body.productId });
}
