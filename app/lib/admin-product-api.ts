import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPublicSupabaseConfig } from "./supabase/config";
import { createSupabaseServerClient } from "./supabase/server";

type RpcError = { code?: string | null };

export const PRODUCT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function productDependencyRpcError(error: RpcError, fallback: string) {
  if (error.code === "42501") return NextResponse.json({ error: "Akses Super Admin diperlukan." }, { status: 403 });
  if (error.code === "P0002") return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ error: fallback }, { status: 400 });
}

export async function requireProductDependencyClient(request: Request): Promise<{ client: SupabaseClient } | { response: NextResponse }> {
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
