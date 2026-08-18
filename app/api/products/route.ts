import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { PRODUCT_PICKER_PAGE_SIZE } from "../../lib/product-picker";
import { rankProductSearch, recommendStationProducts, type ProductAlias } from "../../lib/product-qc";

type ProductRow = { id: string; brand: string; model: string; active: boolean; source_origin: string; spreadsheet_synced: boolean };
type AliasRow = { product_id: string; brand_alias: string; model_alias: string };

function catalogRows(rows: ProductRow[]) {
  return rows.map((row) => ({ id: row.id, brand: row.brand, model: row.model, active: row.active }));
}

function catalogAliases(rows: AliasRow[]): ProductAlias[] {
  return rows.map((row) => ({ productId: row.product_id, brand: row.brand_alias, model: row.model_alias }));
}

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
  const mode = url.searchParams.get("mode") || "browse";
  if ((mode === "search" || mode === "recommend") && (search || brand || model)) {
    const [productResult, aliasResult] = await Promise.all([
      client.from("products").select("id, brand, model, active, source_origin, spreadsheet_synced").eq("active", true).order("brand").order("model").order("id"),
      client.from("product_aliases").select("product_id, brand_alias, model_alias"),
    ]);
    if (productResult.error || aliasResult.error) return NextResponse.json({ error: "Katalog produk gagal dimuat." }, { status: 400 });
    const rows = (productResult.data ?? []) as ProductRow[];
    const aliases = catalogAliases((aliasResult.data ?? []) as AliasRow[]);
    if (mode === "recommend") {
      const recommendations = recommendStationProducts(brand, model, catalogRows(rows), aliases);
      return NextResponse.json({
        rows: recommendations.map((candidate) => ({ ...rows.find((row) => row.id === candidate.product.id), confidence: candidate.confidence })),
        totalCount: recommendations.length,
        page: 1,
        pageSize: recommendations.length,
      });
    }
    const ranked = rankProductSearch(search, catalogRows(rows), aliases);
    const rankedIds = ranked.map((candidate) => candidate.product.id);
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const start = (page - 1) * PRODUCT_PICKER_PAGE_SIZE;
    return NextResponse.json({
      rows: rankedIds.slice(start, start + PRODUCT_PICKER_PAGE_SIZE).map((id) => rowById.get(id)).filter(Boolean),
      totalCount: rankedIds.length,
      page,
      pageSize: PRODUCT_PICKER_PAGE_SIZE,
    });
  }
  let query = client.from("products").select("id, brand, model, active, source_origin, spreadsheet_synced", { count: "exact" }).eq("active", true);
  if (brand) query = query.ilike("brand", brand);
  if (model) query = query.ilike("model", model);
  const { data, count, error } = await query.order("brand", { ascending: true }).order("model", { ascending: true }).order("id", { ascending: true }).range((page - 1) * PRODUCT_PICKER_PAGE_SIZE, page * PRODUCT_PICKER_PAGE_SIZE - 1);
  if (error) return NextResponse.json({ error: "Katalog produk gagal dimuat." }, { status: 400 });
  return NextResponse.json({ rows: data ?? [], totalCount: count ?? 0, page, pageSize: PRODUCT_PICKER_PAGE_SIZE });
}
