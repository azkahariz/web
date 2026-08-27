import { NextResponse } from "next/server";
import { parseQcPendingSummary } from "../../../lib/qc-pending-summary";
import { parseQcProposalStatusSummary } from "../../../lib/qc-proposal-status-summary";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const statuses = new Set(["PENDING", "APPROVED", "MERGED", "REJECTED"]);

function errorResponse(code: string | undefined, fallback: string) {
  if (code === "42501") return NextResponse.json({ error: "Akses Super Admin diperlukan." }, { status: 403 });
  return NextResponse.json({ error: fallback }, { status: 400 });
}

function rpcError(code: string | undefined, fallback: string) {
  return code === "42501" ? "Akses Super Admin diperlukan." : fallback;
}

function page(value: string | null) {
  return Math.max(1, Number.parseInt(value || "1", 10) || 1);
}

function pageSize(value: string | null) {
  return Math.min(200, Math.max(10, Number.parseInt(value || "50", 10) || 50));
}

function optionalUuid(value: string | null) {
  return value?.trim() || null;
}

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Konfigurasi Supabase belum tersedia." }, { status: 503 });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Belum login." }, { status: 401 });

  // The RPC is the database authorization boundary before any list or aggregate is read.
  const { error: authorizationError } = await client.rpc("admin_product_summary");
  if (authorizationError) return errorResponse(authorizationError.code, "Akses QC Produk gagal divalidasi.");

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "PENDING";
  if (!statuses.has(status)) return NextResponse.json({ error: "Status QC tidak valid." }, { status: 400 });
  const [listResult, pendingSummaryResult, statusSummaryResult] = await Promise.all([
    client.rpc("admin_list_product_proposals", {
      p_status: status,
      p_page: page(url.searchParams.get("page")),
      p_page_size: pageSize(url.searchParams.get("pageSize")),
      p_search: url.searchParams.get("search")?.trim() || null,
      p_station_category_id: optionalUuid(url.searchParams.get("stationCategoryId")),
      p_site_type_id: optionalUuid(url.searchParams.get("siteTypeId")),
      p_qc_context: url.searchParams.get("qcContext")?.trim() || null,
    }),
    client.rpc("admin_pending_product_proposal_summary"),
    client.rpc("admin_product_proposal_status_summary"),
  ]);
  if (listResult.error?.code === "42501" || pendingSummaryResult.error?.code === "42501" || statusSummaryResult.error?.code === "42501") {
    return NextResponse.json({ error: "Akses Super Admin diperlukan." }, { status: 403 });
  }

  const response: Record<string, unknown> = {};
  if (listResult.error) {
    response.listError = rpcError(listResult.error.code, "Proposal produk gagal dimuat.");
  } else if (!listResult.data || typeof listResult.data !== "object" || Array.isArray(listResult.data)) {
    response.listError = "Contract daftar proposal QC tidak valid.";
  } else {
    Object.assign(response, listResult.data);
  }

  const pendingSummary = parseQcPendingSummary(pendingSummaryResult.data);
  const statusSummary = parseQcProposalStatusSummary(statusSummaryResult.data);
  if (pendingSummaryResult.error) {
    response.pendingSummaryError = rpcError(pendingSummaryResult.error.code, "Ringkasan QC Pending gagal dimuat.");
  } else if (!pendingSummary) {
    response.pendingSummaryError = "Contract ringkasan QC Pending tidak valid.";
  } else {
    response.pendingSummary = pendingSummary;
  }
  if (statusSummaryResult.error) {
    response.statusSummaryError = rpcError(statusSummaryResult.error.code, "Ringkasan status QC gagal dimuat.");
  } else if (!statusSummary) {
    response.statusSummaryError = "Contract ringkasan status QC tidak valid.";
  } else {
    response.statusSummary = statusSummary;
  }
  return NextResponse.json(response);
}
