import { NextResponse } from "next/server";
import { AdminRuntimeMasterError, loadAdminRuntimeMaster } from "../../../lib/admin-inventory-master";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Konfigurasi Supabase belum tersedia." }, { status: 503 });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Belum login." }, { status: 401 });
  const { data: admin } = await client.from("super_admins")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: "Akses Super Admin diperlukan." }, { status: 403 });

  const stationId = new URL(request.url).searchParams.get("stationId")?.trim();
  if (!stationId) return NextResponse.json({ error: "stationId wajib diisi." }, { status: 400 });
  try {
    const master = await loadAdminRuntimeMaster(client, stationId);
    return NextResponse.json({ master }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof AdminRuntimeMasterError ? "Master runtime Admin gagal dimuat." : "Master runtime Admin tidak tersedia.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
