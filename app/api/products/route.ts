import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { PRODUCT_PICKER_PAGE_SIZE } from "../../lib/product-picker";

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Konfigurasi Supabase belum tersedia." }, { status: 503 });
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError || !userData.user) return NextResponse.json({ error: "Belum login." }, { status: 401 });
  const url = new URL(request.url);
  const rawPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const search = url.searchParams.get("search")?.trim().replace(/[(),]/g, " ") || "";
  const brand = url.searchParams.get("brand")?.trim().replace(/[(),]/g, " ") || "";
  const model = url.searchParams.get("model")?.trim().replace(/[(),]/g, " ") || "";
  let query = client.from("products").select("id, brand, model, active, source_origin, spreadsheet_synced", { count: "exact" }).eq("active", true);
  if (search) query = query.or(`brand.ilike.%${search}%,model.ilike.%${search}%`);
  if (brand) query = query.ilike("brand", brand);
  if (model) query = query.ilike("model", model);
  const { data, count, error } = await query.order("brand", { ascending: true }).order("model", { ascending: true }).order("id", { ascending: true }).range((page - 1) * PRODUCT_PICKER_PAGE_SIZE, page * PRODUCT_PICKER_PAGE_SIZE - 1);
  if (error) return NextResponse.json({ error: "Katalog produk gagal dimuat." }, { status: 400 });
  return NextResponse.json({ rows: data ?? [], totalCount: count ?? 0, page, pageSize: PRODUCT_PICKER_PAGE_SIZE });
}
