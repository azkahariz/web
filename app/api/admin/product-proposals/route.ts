import { NextResponse } from "next/server";
import { buildQcProposalContexts } from "../../../lib/qc-proposal-context";
import { parseQcPendingSummary } from "../../../lib/qc-pending-summary";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type ProposalRow = {
  id: string;
  station_id: string;
  submission_id: string | null;
  operator_name: string | null;
  proposed_brand: string;
  proposed_model: string;
  normalized_brand: string;
  normalized_model: string;
  status: "PENDING" | "APPROVED" | "MERGED" | "REJECTED";
  resolved_product_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

type SubmissionRow = { id: string; site_id: string; site_subtype_id: string; payload: unknown; archived_at: string | null };
type NamedRow = { id: string; name: string; site_type_id?: string };
type StationRow = { id: string; station_category_id: string | null };
type AdminIdentityRow = { auth_user_id: string; username: string; display_name?: string | null };

function errorResponse(code: string | undefined, fallback: string) {
  if (code === "42501") return NextResponse.json({ error: "Akses Super Admin diperlukan." }, { status: 403 });
  return NextResponse.json({ error: fallback }, { status: 400 });
}

export async function GET() {
  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Konfigurasi Supabase belum tersedia." }, { status: 503 });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Belum login." }, { status: 401 });

  // The RPC is the database authorization boundary before any context is read.
  const { error: authorizationError } = await client.rpc("admin_product_summary");
  if (authorizationError) return errorResponse(authorizationError.code, "Akses QC Produk gagal divalidasi.");

  const [proposalResult, pendingSummaryResult] = await Promise.all([
    client.from("product_proposals")
      .select("id, station_id, submission_id, operator_name, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id, reviewed_by, reviewed_at, review_note, created_at")
      .order("created_at", { ascending: false }),
    client.rpc("admin_pending_product_proposal_summary"),
  ]);
  const { data: proposalData, error: proposalError } = proposalResult;
  if (proposalError) return errorResponse(proposalError.code, "Proposal produk gagal dimuat.");
  if (pendingSummaryResult.error) return errorResponse(pendingSummaryResult.error.code, "Ringkasan QC Pending gagal dimuat.");
  const pendingSummary = parseQcPendingSummary(pendingSummaryResult.data);
  if (!pendingSummary) return NextResponse.json({ error: "Contract ringkasan QC Pending tidak valid." }, { status: 500 });

  const proposals = (proposalData ?? []) as ProposalRow[];
  const submissionIds = [...new Set(proposals.map((proposal) => proposal.submission_id).filter((id): id is string => Boolean(id)))];
  const { data: submissionData, error: submissionError } = submissionIds.length
    ? await client.from("submissions").select("id, site_id, site_subtype_id, payload, archived_at").in("id", submissionIds)
    : { data: [], error: null };

  const submissions = (submissionData ?? []) as SubmissionRow[];
  const siteIds = [...new Set(submissions.map((submission) => submission.site_id))];
  const subtypeIds = [...new Set(submissions.map((submission) => submission.site_subtype_id))];
  const reviewerIds = [...new Set(proposals.map((proposal) => proposal.reviewed_by).filter((id): id is string => Boolean(id)))];
  const stationIds = [...new Set(proposals.map((proposal) => proposal.station_id))];
  const [siteResult, subtypeResult, stationResult, siteTypeResult, adminResult] = submissionError ? [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }] : await Promise.all([
    siteIds.length ? client.from("sites").select("id, name, site_type_id").in("id", siteIds) : Promise.resolve({ data: [], error: null }),
    subtypeIds.length ? client.from("site_subtypes").select("id, name").in("id", subtypeIds) : Promise.resolve({ data: [], error: null }),
    stationIds.length ? client.from("stations").select("id, station_category_id").in("id", stationIds) : Promise.resolve({ data: [], error: null }),
    client.from("site_types").select("id, name"),
    reviewerIds.length ? client.from("super_admins").select("auth_user_id, username, display_name").in("auth_user_id", reviewerIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const contextUnavailable = Boolean(submissionError || siteResult.error || subtypeResult.error || stationResult.error || siteTypeResult.error);
  const contexts = contextUnavailable
    ? new Map(proposals.map((proposal) => [proposal.id, { state: "unavailable" as const, siteName: null, subtypeName: null, categories: [], stationCategoryId: null, siteTypeId: null, stationCategoryName: null, siteTypeName: null, qcContext: null }]))
    : buildQcProposalContexts(proposals, submissions, (siteResult.data ?? []) as NamedRow[], (subtypeResult.data ?? []) as NamedRow[], (stationResult.data ?? []) as StationRow[], (siteTypeResult.data ?? []) as NamedRow[]);
  const adminByAuthUser = new Map(((adminResult.data ?? []) as AdminIdentityRow[]).map((admin) => [admin.auth_user_id, {
    username: admin.username,
    displayName: admin.display_name?.trim() || admin.username,
  }]));
  return NextResponse.json({ pendingSummary, rows: proposals.map((proposal) => ({
    ...proposal,
    reviewer: proposal.reviewed_by ? adminByAuthUser.get(proposal.reviewed_by) ?? null : null,
    context: contexts.get(proposal.id),
  })) });
}
