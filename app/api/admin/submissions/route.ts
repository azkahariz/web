import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPublicSupabaseConfig } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type RpcError = { code?: string | null };

function rpcErrorResponse(error: RpcError, message: string) {
  if (error.code === "42501") {
    return NextResponse.json({ error: "Akses Super Admin diperlukan." }, { status: 403 });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}

async function requireAuthenticatedUser(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const config = getPublicSupabaseConfig();
  const client = bearer && config
    ? createClient(config.url, config.publishableKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    : await createSupabaseServerClient();
  if (!client) return { response: NextResponse.json({ error: "Konfigurasi Supabase belum tersedia." }, { status: 503 }) };
  const { data: userData } = await client.auth.getUser(bearer);
  if (!userData.user) return { response: NextResponse.json({ error: "Belum login." }, { status: 401 }) };
  return { client };
}

function optionalUuid(value: string | null) {
  return value?.trim() || null;
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const submissionId = url.searchParams.get("id")?.trim();

  if (submissionId) {
    const { data, error } = await auth.client.rpc("admin_get_submission_detail", {
      p_submission_id: submissionId,
    });
    if (error) return rpcErrorResponse(error, "Detail submission gagal dimuat.");
    return NextResponse.json({ detail: data });
  }

  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const { data, error } = await auth.client.rpc("admin_list_submissions", {
    p_page: page,
    p_page_size: 50,
    p_search: url.searchParams.get("search")?.trim() || null,
    p_station_id: optionalUuid(url.searchParams.get("stationId")),
    p_site_type_id: optionalUuid(url.searchParams.get("siteTypeId")),
    p_progress_status: url.searchParams.get("progress")?.trim() || null,
    p_updated_filter: url.searchParams.get("updated")?.trim() || "ALL",
    p_archive_filter: url.searchParams.get("archive")?.trim() || "ACTIVE",
  });
  if (error) return rpcErrorResponse(error, "Daftar submission gagal dimuat.");
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ("response" in auth) return auth.response;
  const body = await request.json() as { action?: string; submissionId?: string; reason?: string };
  if (!body.submissionId) return NextResponse.json({ error: "Submission wajib dipilih." }, { status: 400 });

  const rpc = body.action === "archive"
    ? auth.client.rpc("admin_archive_submission", {
      p_submission_id: body.submissionId,
      p_reason: body.reason?.trim() || null,
    })
    : body.action === "restore"
      ? auth.client.rpc("admin_restore_submission", { p_submission_id: body.submissionId })
      : null;
  if (!rpc) return NextResponse.json({ error: "Aksi tidak valid." }, { status: 400 });

  const { data, error } = await rpc;
  if (error) return rpcErrorResponse(error, "Aksi submission gagal diproses.");
  if (!data) return NextResponse.json({ error: "Status submission sudah berubah. Muat ulang daftar." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
