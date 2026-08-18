"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminBulkExport from "./AdminBulkExport";
import AdminProducts from "./AdminProducts";
import AdminSubmissionMonitor from "./AdminSubmissionMonitor";
import { useAppFeedback } from "../components/AppFeedback";
import AsyncButton from "../components/AsyncButton";
import EyeIcon from "../components/EyeIcon";
import FooterAttribution from "../components/FooterAttribution";
import { downloadAdminInventory } from "../lib/admin-export";
import {
  accountMatchesAdminSearch,
  adminSearchPlaceholder,
  buildStationFillingView,
  filterStationFillingRows,
  loadAllAdminRows,
} from "../lib/admin-view";
import { csvCell, downloadText } from "../lib/download";
import { logoutCurrentBrowser } from "../lib/local-logout";
import { summarizeSitesByType } from "../lib/admin-summary";
import { adminViewFromSearchParam, adminViewHref, type AdminView } from "../lib/admin-navigation";
import { hasMixedMergeProposalFamilies, rankMergeProducts, type ProductAlias } from "../lib/product-qc";
import type { QcProposalContext } from "../lib/qc-proposal-context";
import type { SubmissionSummary } from "../lib/submission-monitoring";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Station = { id: string; name: string; active: boolean };
type Site = { id: string; station_id: string; site_type_id: string; name: string; active: boolean };
type SiteType = { id: string; name: string };
type Subtype = { id: string; site_type_id: string; name: string };
type Submission = {
  id: string; station_id: string; site_id: string; site_subtype_id: string;
  version: number; operator_name: string | null;
  locked_by_session_id: string | null; lock_operator_name: string | null;
  lock_last_activity_at: string | null; last_saved_at: string | null; updated_at: string;
};
type Account = { id: string; station_id: string; username: string; active: boolean; updated_at: string };
type Product = { id: string; brand: string; model: string; active: boolean; source_origin: string; spreadsheet_synced: boolean };
type QcProductAlias = ProductAlias;
type QcProductAliasRow = { product_id: string; brand_alias: string; model_alias: string };
type Proposal = {
  id: string; station_id: string; submission_id: string | null; operator_name: string | null;
  proposed_brand: string; proposed_model: string; normalized_brand: string; normalized_model: string;
  status: "PENDING" | "APPROVED" | "MERGED" | "REJECTED"; resolved_product_id: string | null;
  reviewed_by: string | null; reviewed_at: string | null; review_note: string | null; created_at: string;
  reviewer: { username: string; displayName: string } | null;
  context: QcProposalContext;
};
type Audit = { id: string; admin_auth_user_id: string; action: string; target_type: string; target_id: string | null; metadata: Record<string, unknown>; created_at: string };
type AdminIdentity = { auth_user_id: string; username: string; display_name?: string | null };
type QcConflict = {
  proposalId: string;
  currentStatus: Proposal["status"] | "NOT_FOUND";
  reviewerAuthUserId: string | null;
  reviewerDisplayName: string | null;
  reviewedAt: string | null;
};
type QcMutationResult = {
  outcome: "processed" | "partial" | "conflict";
  action: Proposal["status"];
  productId?: string;
  processedProposalIds: string[];
  processedCount: number;
  conflicts: QcConflict[];
};
type Tab = AdminView;
type FillingMode = "master" | "submissions";

type StationFillingView = {
  siteCount: number;
  submissionCount: number;
  rows: Array<{
    site: Site;
    siteType: SiteType | null;
    subtype: Subtype | null;
    submission: Submission | null;
  }>;
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "summary", label: "Ringkasan" },
  { id: "stations", label: "Stasiun & Pengisian" },
  { id: "products", label: "Produk" },
  { id: "accounts", label: "Akun Stasiun" },
  { id: "locks", label: "Lock Aktif" },
  { id: "qc", label: "QC Produk" },
  { id: "audit", label: "Audit Admin" },
];

function ageLabel(value: string | null, now: number) {
  if (!value) return "-";
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
  return minutes < 1 ? "kurang dari 1 menit" : `${minutes} menit`;
}

function proposalCategoryLabel(context: QcProposalContext) {
  if (context.state === "unavailable") return "Konteks tidak tersedia";
  if (context.state === "missing-submission") return "Konteks submission tidak tersedia";
  if (!context.categories.length) return "Kategori tidak ditemukan pada submission aktif";
  const visible = context.categories.slice(0, 3);
  return `${visible.join(" · ")}${context.categories.length > visible.length ? ` · +${context.categories.length - visible.length} lainnya` : ""}`;
}

const StationFillingCard = memo(function StationFillingCard({
  station,
  view,
  visibleRows,
  expanded,
  busyAction,
  onToggle,
  onDownload,
}: {
  station: Station;
  view: StationFillingView;
  visibleRows: StationFillingView["rows"];
  expanded: boolean;
  busyAction: string | null;
  onToggle: (open: boolean) => void;
  onDownload: (station: Station, site: Site, subtype: Subtype) => void;
}) {
  return <details open={expanded} onToggle={(event) => onToggle(event.currentTarget.open)}>
    <summary><strong>{station.name}</strong><span>{view.siteCount} site {"\u2022"} {view.submissionCount} submission</span></summary>
    {expanded && <div className="admin-table-wrap station-filling-table"><table><thead><tr><th>Site</th><th>Tipe Site</th><th>Subtipe</th><th>Status</th><th>Versi</th><th>Terakhir Simpan</th><th>Aksi</th></tr></thead><tbody>
      {visibleRows.map(({ site, siteType, subtype, submission }) => <tr key={`${site.id}:${subtype?.id ?? "no-subtype"}`}>
        <td><strong>{site.name}</strong></td>
        <td>{siteType?.name ?? "Belum terpetakan"}</td>
        <td>{subtype?.name ?? "Belum terpetakan"}</td>
        <td><span className={`status-pill ${submission ? "active" : "pending"}`}>{submission ? "Sudah ada data" : "Belum ada submission"}</span></td>
        <td>{submission?.version ?? "-"}</td>
        <td>{submission ? new Date(submission.last_saved_at ?? submission.updated_at).toLocaleString("id-ID") : "-"}</td>
        <td>{subtype ? <details className="row-action-menu">
          <summary>Aksi</summary>
          <div>
            <Link href={submission ? `/admin/submissions/${submission.id}` : `/admin/inventory?siteId=${site.id}&subtypeId=${subtype.id}`} target="_blank" rel="noopener noreferrer">Buka</Link>
            <AsyncButton loading={busyAction === `download:${site.id}:${subtype.id}`} loadingText="Menyiapkan..." onClick={() => onDownload(station, site, subtype)}>Unduh</AsyncButton>
          </div>
        </details> : "-"}</td>
      </tr>)}
      {!visibleRows.length && <tr><td colSpan={7}>Belum ada site atau subtipe yang cocok.</td></tr>}
    </tbody></table></div>}
  </details>;
}, (previous, next) => (
  previous.station === next.station
  && previous.view === next.view
  && previous.visibleRows === next.visibleRows
  && previous.expanded === next.expanded
  && previous.busyAction === next.busyAction
));

export default function AdminDashboard({ username, displayName }: { username: string; displayName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const feedback = useAppFeedback();
  const tab = adminViewFromSearchParam(searchParams.get("view"));
  const [fillingMode, setFillingMode] = useState<FillingMode>("master");
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null);
  const [submissionMonitorMounted, setSubmissionMonitorMounted] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteTypes, setSiteTypes] = useState<SiteType[]>([]);
  const [subtypes, setSubtypes] = useState<Subtype[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productAliases, setProductAliases] = useState<QcProductAlias[]>([]);
  const [qcProductsLoading, setQcProductsLoading] = useState(false);
  const [productTotal, setProductTotal] = useState(0);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [adminIdentities, setAdminIdentities] = useState<AdminIdentity[]>([]);
  const [search, setSearch] = useState("");
  const [qcStatus, setQcStatus] = useState<Proposal["status"]>("PENDING");
  const [selectedProposals, setSelectedProposals] = useState<string[]>([]);
  const [mergeProductId, setMergeProductId] = useState("");
  const [mergeProductQuery, setMergeProductQuery] = useState("");
  const [mergePickerOpen, setMergePickerOpen] = useState(false);
  const [mergeActiveIndex, setMergeActiveIndex] = useState(-1);
  const mergeBlurTimer = useRef<number | null>(null);
  const [message, setMessage] = useState("");
  const [credential, setCredential] = useState<{ username: string; password: string; title: string } | null>(null);
  const [credentialVisible, setCredentialVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const loadQcProducts = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setQcProductsLoading(true);
    try {
      const [productResult, aliasResult] = await Promise.all([
        client.from("products").select("id, brand, model, active, source_origin, spreadsheet_synced").order("brand").order("model"),
        client.from("product_aliases").select("product_id, brand_alias, model_alias"),
      ]);
      const error = productResult.error ?? aliasResult.error;
      if (error) {
        setMessage(`Gagal memuat produk QC: ${error.message}`);
        return;
      }
      setProducts((productResult.data ?? []) as Product[]);
      setProductAliases(((aliasResult.data ?? []) as QcProductAliasRow[]).map((alias) => ({ productId: alias.product_id, brand: alias.brand_alias, model: alias.model_alias })));
    } finally {
      setQcProductsLoading(false);
    }
  }, []);

  const refreshQcProposals = useCallback(async () => {
    const response = await fetch("/api/admin/product-proposals", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { rows?: Proposal[]; error?: string };
    if (!response.ok) {
      setMessage(payload.error || "Proposal produk gagal dimuat.");
      return false;
    }
    setProposals(payload.rows ?? []);
    return true;
  }, []);

  const refresh = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setLoading(true);
    try {
      const [stationRows, siteRows, siteTypeRows, subtypeRows, submissionRows, accountRows, productSummaryRows, proposalResponse, auditRows] = await Promise.all([
      client.from("stations").select("id, name, active").order("name"),
      loadAllAdminRows((from, to) => client.from("sites")
        .select("id, station_id, site_type_id, name, active")
        .order("name")
        .order("id")
        .range(from, to)),
      client.from("site_types").select("id, name").order("name"),
      client.from("site_subtypes").select("id, site_type_id, name").order("name"),
      loadAllAdminRows((from, to) => client.from("submissions")
        .select("id, station_id, site_id, site_subtype_id, version, operator_name, locked_by_session_id, lock_operator_name, lock_last_activity_at, last_saved_at, updated_at")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to)),
      client.from("station_accounts").select("id, station_id, username, active, updated_at").order("username"),
      client.rpc("admin_product_summary"),
      fetch("/api/admin/product-proposals", { cache: "no-store" }),
      client.from("admin_audit_log").select("id, admin_auth_user_id, action, target_type, target_id, metadata, created_at").order("created_at", { ascending: false }).limit(250),
      ]);
      let adminIdentityResult = await client.from("super_admins")
        .select("auth_user_id, username, display_name")
        .order("username");
      if (adminIdentityResult.error) {
        adminIdentityResult = await client.from("super_admins")
          .select("auth_user_id, username")
          .order("username");
      }
      const proposalPayload = await proposalResponse.json().catch(() => ({})) as { rows?: Proposal[]; error?: string };
      const error = [stationRows, siteRows, siteTypeRows, subtypeRows, submissionRows, accountRows, productSummaryRows, auditRows].find((result) => result.error)?.error;
      if (error || !proposalResponse.ok) setMessage(error ? `Gagal memuat dashboard: ${error.message}` : proposalPayload.error || "Proposal produk gagal dimuat.");
      else {
        setStations((stationRows.data ?? []) as Station[]);
        setSites((siteRows.data ?? []) as Site[]);
        setSiteTypes((siteTypeRows.data ?? []) as SiteType[]);
        setSubtypes((subtypeRows.data ?? []) as Subtype[]);
        setSubmissions((submissionRows.data ?? []) as Submission[]);
        setAccounts((accountRows.data ?? []) as Account[]);
        const productSummary = Array.isArray(productSummaryRows.data) ? productSummaryRows.data[0] : productSummaryRows.data;
        setProductTotal(Number(productSummary?.total_count ?? 0));
        setProposals(proposalPayload.rows ?? []);
        setAudits((auditRows.data ?? []) as Audit[]);
        setAdminIdentities((adminIdentityResult.data ?? []) as AdminIdentity[]);
      }
    } catch {
      setMessage("Gagal memuat dashboard. Periksa koneksi lalu muat ulang.");
    } finally {
      setLoadedAt(Date.now());
      setLoading(false);
    }
  }, []);

  const refreshProductSummary = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { data, error } = await client.rpc("admin_product_summary");
    if (error) return;
    const productSummary = Array.isArray(data) ? data[0] : data;
    setProductTotal(Number(productSummary?.total_count ?? 0));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (tab !== "qc") return;
    const timer = window.setTimeout(() => void loadQcProducts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadQcProducts, tab]);

  useEffect(() => {
    if (!credential) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCredentialVisible(false);
        setCredential(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [credential]);

  const stationMap = useMemo(() => new Map(stations.map((station) => [station.id, station])), [stations]);
  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const subtypeMap = useMemo(() => new Map(subtypes.map((subtype) => [subtype.id, subtype])), [subtypes]);
  const accountByStation = useMemo(() => new Map(accounts.map((account) => [account.station_id, account])), [accounts]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const adminIdentityMap = useMemo(() => new Map(adminIdentities.map((admin) => [admin.auth_user_id, {
    username: admin.username,
    displayName: admin.display_name?.trim() || admin.username,
  }])), [adminIdentities]);
  const activeProducts = useMemo(() => products.filter((product) => product.active), [products]);
  const activeLocks = submissions.filter((submission) => submission.locked_by_session_id && submission.lock_last_activity_at
    && new Date(submission.lock_last_activity_at).getTime() >= loadedAt - 5 * 60_000);
  const pendingSpreadsheet = products.filter((product) => !product.spreadsheet_synced);
  const query = search.trim().toLocaleLowerCase("id-ID");
  const stationFillingViews = useMemo(() => stations.map((station) => ({
    station,
    view: buildStationFillingView(station.id, sites, siteTypes, subtypes, submissions),
  })), [sites, siteTypes, stations, submissions, subtypes]);
  const filteredStationFillingViews = useMemo(() => stationFillingViews.map(({ station, view }) => ({
    station,
    view,
    visibleRows: filterStationFillingRows(station.name, view.rows, query),
  })).filter(({ station, visibleRows }) => !query
    || station.name.toLocaleLowerCase("id-ID").includes(query)
    || visibleRows.length > 0), [query, stationFillingViews]);
  const filteredAccounts = accounts.filter((account) => accountMatchesAdminSearch(account, query, stationMap));
  const filteredUnprovisionedStations = stations.filter((station) => !accountByStation.has(station.id)
    && (!query || station.name.toLocaleLowerCase("id-ID").includes(query)));
  const siteTypeSummary = useMemo(() => summarizeSitesByType(sites, siteTypes), [sites, siteTypes]);
  const filteredProposals = proposals.filter((proposal) => proposal.status === qcStatus && (!query
    || `${proposal.proposed_brand} ${proposal.proposed_model} ${stationMap.get(proposal.station_id)?.name ?? ""} ${proposal.context.siteName ?? ""} ${proposal.context.subtypeName ?? ""} ${proposal.context.categories.join(" ")}`.toLocaleLowerCase("id-ID").includes(query)));
  const searchTab = (tab === "stations" && fillingMode === "master") || tab === "accounts" || tab === "qc" ? tab : null;
  const selectedPendingProposals = useMemo(() => selectedProposals.map((id) => proposals.find((proposal) => proposal.id === id))
    .filter((proposal): proposal is Proposal => proposal?.status === "PENDING"), [proposals, selectedProposals]);
  const mergeRecommendationRanks = useMemo(() => rankMergeProducts(
    selectedPendingProposals.map((proposal) => ({ proposedBrand: proposal.proposed_brand, proposedModel: proposal.proposed_model })),
    activeProducts,
    productAliases,
  ), [activeProducts, productAliases, selectedPendingProposals]);
  const mixedMergeSelection = useMemo(() => hasMixedMergeProposalFamilies(
    selectedPendingProposals.map((proposal) => ({ proposedBrand: proposal.proposed_brand, proposedModel: proposal.proposed_model })),
  ), [selectedPendingProposals]);
  const normalizedMergeQuery = mergeProductQuery.trim().toLocaleLowerCase("id-ID");
  const mergeSearchResults = useMemo(() => !normalizedMergeQuery ? activeProducts : activeProducts.filter((product) =>
    `${product.brand} ${product.model}`.toLocaleLowerCase("id-ID").includes(normalizedMergeQuery)), [activeProducts, normalizedMergeQuery]);
  const mergeKeyboardOptions = normalizedMergeQuery ? mergeSearchResults : [...mergeRecommendationRanks.map(({ product }) => product), ...activeProducts];

  function selectMergeProduct(product: Pick<Product, "id" | "brand" | "model">) {
    setMergeProductId(product.id);
    setMergeProductQuery(`${product.brand} - ${product.model}`);
    setMergePickerOpen(false);
    setMergeActiveIndex(-1);
  }

  function openMergePicker() {
    if (mergeBlurTimer.current) window.clearTimeout(mergeBlurTimer.current);
    setMergePickerOpen(true);
    setMergeActiveIndex(-1);
  }

  function closeMergePicker() {
    mergeBlurTimer.current = window.setTimeout(() => {
      setMergePickerOpen(false);
      setMergeActiveIndex(-1);
      if (!mergeProductQuery && mergeProductId) {
        const selected = productMap.get(mergeProductId);
        if (selected) setMergeProductQuery(`${selected.brand} - ${selected.model}`);
      }
    }, 120);
  }

  async function runAction(key: string, action: () => Promise<void>) {
    if (activeAction) return;
    setActiveAction(key);
    try {
      await action();
    } finally {
      setActiveAction(null);
    }
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    const client = getSupabaseBrowserClient();
    if (!client) return false;
    setMessage("");
    const { error } = await client.rpc(name, args);
    if (error) {
      setMessage(error.message);
      return false;
    }
    await refresh();
    if (tab === "qc") await loadQcProducts();
    return true;
  }

  function qcConflictMessage(conflict: QcConflict | undefined) {
    if (!conflict) return "Proposal sudah diproses Admin lain.";
    const actor = conflict.reviewerDisplayName ? ` oleh ${conflict.reviewerDisplayName}` : " oleh Admin lain";
    const status = conflict.currentStatus === "NOT_FOUND" ? "tidak lagi tersedia" : `sebagai ${conflict.currentStatus}`;
    return `Proposal ini sudah diproses${actor} ${status}.`;
  }

  async function qcRpc(name: string, args: Record<string, unknown>) {
    const client = getSupabaseBrowserClient();
    if (!client) return null;
    setMessage("");
    const { data, error } = await client.rpc(name, args);
    if (error) {
      setMessage(error.message);
      return null;
    }
    const result = data as QcMutationResult;
    const completedIds = new Set([
      ...result.processedProposalIds,
      ...result.conflicts.map((conflict) => conflict.proposalId),
    ]);
    setSelectedProposals((current) => current.filter((id) => !completedIds.has(id)));
    await refreshQcProposals();
    if (result.conflicts.length) {
      const conflictMessage = result.conflicts.length === 1
        ? qcConflictMessage(result.conflicts[0])
        : `${result.conflicts.length} proposal dilewati karena sudah diproses Admin lain.`;
      if (result.processedCount === 0) feedback.toast(conflictMessage, "error");
      else feedback.toast(`${result.processedCount} proposal berhasil. ${conflictMessage}`, "success");
    }
    return result;
  }

  async function forceRelease(id: string) {
    await feedback.confirmAction({
      title: "Paksa lepas lock?",
      description: "Editor saat ini akan kehilangan hak menyimpan.",
      confirmLabel: "Lepas Lock",
      danger: true,
    }, async () => {
      const ok = await rpc("admin_force_release_submission", { p_submission_id: id });
      if (ok) feedback.toast("Lock berhasil dilepas.", "success");
      return ok;
    });
  }

  async function approve(proposal: Proposal) {
    const brand = await feedback.prompt({ title: "Brand canonical", inputLabel: "Brand", initialValue: proposal.proposed_brand, required: true, confirmLabel: "Berikutnya" });
    if (!brand) return;
    const model = await feedback.prompt({ title: "Tipe/model canonical", inputLabel: "Tipe/model", initialValue: proposal.proposed_model, required: true, confirmLabel: "Berikutnya" });
    if (!model) return;
    const note = await feedback.prompt({ title: "Catatan pemeriksaan", inputLabel: "Catatan (opsional)", confirmLabel: "Berikutnya" });
    if (note === null) return;
    await feedback.confirmAction({ title: "Setujui produk baru?", description: `${brand} - ${model}`, confirmLabel: "Setujui" }, async () => {
      const result = await qcRpc("admin_approve_product_proposal_v2", { p_proposal_id: proposal.id, p_canonical_brand: brand, p_canonical_model: model, p_review_note: note || null });
      if (result?.outcome === "processed") {
        await Promise.all([loadQcProducts(), refreshProductSummary()]);
        feedback.toast("Proposal disetujui sebagai produk baru.", "success");
      }
      return result?.outcome === "processed";
    });
  }

  async function merge(ids: string[]) {
    if (!ids.length || !mergeProductId) {
      setMessage("Pilih proposal dan produk tujuan terlebih dahulu.");
      return;
    }
    const target = productMap.get(mergeProductId);
    if (!target) return;
    const note = await feedback.prompt({ title: "Catatan merge", inputLabel: "Catatan (opsional)", confirmLabel: "Berikutnya" });
    if (note === null) return;
    await feedback.confirmAction({ title: "Gabungkan proposal?", description: `${ids.length} proposal akan digabungkan ke ${target.brand} - ${target.model}.`, confirmLabel: "Gabungkan" }, async () => {
      const result = await qcRpc("admin_merge_product_proposals_v2", { p_proposal_ids: ids, p_product_id: mergeProductId, p_review_note: note || null });
      if (result?.outcome === "processed") {
        feedback.toast(`${result.processedCount} proposal berhasil digabungkan.`, "success");
      }
      return Boolean(result && result.processedCount > 0);
    });
  }

  async function reject(proposal: Proposal) {
    const reason = await feedback.prompt({ title: "Tolak proposal", description: "Raw input tetap disimpan.", inputLabel: "Alasan penolakan", required: true, confirmLabel: "Berikutnya", danger: true });
    if (!reason) return;
    await feedback.confirmAction({ title: "Konfirmasi penolakan", description: reason, confirmLabel: "Tolak", danger: true }, async () => {
      const result = await qcRpc("admin_reject_product_proposal_v2", { p_proposal_id: proposal.id, p_review_note: reason });
      if (result?.outcome === "processed") feedback.toast("Proposal ditolak.", "success");
      return result?.outcome === "processed";
    });
  }

  async function editCanonical(product: Product) {
    const brand = await feedback.prompt({ title: "Koreksi brand canonical", inputLabel: "Brand", initialValue: product.brand, required: true, confirmLabel: "Berikutnya" });
    if (!brand) return;
    const model = await feedback.prompt({ title: "Koreksi tipe/model canonical", inputLabel: "Tipe/model", initialValue: product.model, required: true, confirmLabel: "Berikutnya" });
    if (!model) return;
    await feedback.confirmAction({ title: "Simpan koreksi?", description: "Produk akan masuk daftar rekonsiliasi Spreadsheet.", confirmLabel: "Simpan" }, async () => {
      const ok = await rpc("admin_update_canonical_product", { p_product_id: product.id, p_brand: brand, p_model: model });
      if (ok) feedback.toast("Produk diperbarui dan perlu disinkronkan ke Spreadsheet.", "success");
      return ok;
    });
  }

  async function accountAction(body: Record<string, unknown>, confirmation: string) {
    await feedback.confirmAction({ title: "Konfirmasi aksi akun", description: confirmation, confirmLabel: "Lanjutkan", danger: body.action === "set-active" }, async () => {
      setMessage("");
      setCredential(null);
      setCredentialVisible(false);
      const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; username?: string; temporaryPassword?: string };
      if (!response.ok) {
        feedback.toast(result.error ?? "Aksi akun gagal.", "error");
        return false;
      }
      if (result.temporaryPassword) setCredential({
        username: result.username ?? "",
        password: result.temporaryPassword,
        title: body.action === "reset-password" ? "Password berhasil direset" : "Akun dan password berhasil dibuat",
      });
      feedback.toast("Aksi akun berhasil.", "success");
      await refresh();
      return true;
    });
  }

  function closeCredentialDialog() {
    setCredentialVisible(false);
    setCredential(null);
  }

  function exportProducts() {
    const rows = [["product_id", "Merk", "Tipe", "active"], ...pendingSpreadsheet.map((product) => [product.id, product.brand, product.model, product.active])];
    downloadText("products-qc-pending-spreadsheet.csv", `\uFEFF${rows.map((row) => row.map((value) => csvCell(String(value))).join(",")).join("\r\n")}`, "text/csv;charset=utf-8");
  }

  async function downloadRow(station: Station, site: Site, subtype: Subtype, submissionId?: string) {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setMessage("Menyiapkan CSV terbaru...");
    try {
      const result = await downloadAdminInventory({
        client,
        station,
        sites,
        siteTypes,
        subtypes,
        scope: { stationId: station.id, siteId: site.id, siteSubtypeId: subtype.id },
        submissionId,
      });
      setMessage(`${result.filename} berhasil diunduh tanpa mengubah lock atau submission.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Unduh gagal: ${error.message}` : "Unduh gagal.");
    }
  }

  async function downloadSubmission(row: SubmissionSummary) {
    const station = stationMap.get(row.station_id);
    const site = siteMap.get(row.site_id);
    const subtype = subtypeMap.get(row.site_subtype_id);
    if (!station || !site || !subtype) {
      setMessage("Relasi master untuk submission ini tidak ditemukan.");
      return;
    }
    await downloadRow(station, site, subtype, row.id);
  }

  function navigate(nextTab: Tab, options?: { fillingMode?: FillingMode; qcStatus?: Proposal["status"] }) {
    router.push(adminViewHref(nextTab));
    setSearch("");
    if (options?.fillingMode) {
      setFillingMode(options.fillingMode);
      if (options.fillingMode === "submissions") setSubmissionMonitorMounted(true);
    }
    if (options?.qcStatus) {
      setQcStatus(options.qcStatus);
      setSelectedProposals([]);
    }
  }

  async function logout() {
    const client = getSupabaseBrowserClient();
    if (client) await logoutCurrentBrowser({ signOut: (options) => client.auth.signOut(options) });
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="admin-shell">
      <header className="topbar admin-topbar">
        <div className="brand-lockup"><div className="brand-mark">AC</div><div><p className="eyebrow">SUPER ADMIN</p><h1>Aloptama Collect</h1></div></div>
        <div className="account-actions"><span className="admin-username">{displayName}{displayName !== username && <small>{username}</small>}</span><Link className="logout-button" href="/admin/panduan">Panduan Super Admin</Link><button className="logout-button" onClick={logout}>Keluar</button></div>
      </header>
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Menu admin">
          {tabs.map((item) => <Link key={item.id} href={adminViewHref(item.id)} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined}>{item.label}</Link>)}
        </nav>
        <section className={`admin-content${tab === "accounts" ? " accounts-view" : ""}`}>
          <div className="admin-heading"><div><p className="kicker">PENGELOLAAN APLIKASI</p><h2>{tabs.find((item) => item.id === tab)?.label}</h2></div>{!(tab === "stations" && fillingMode === "submissions") && tab !== "products" && <AsyncButton className="secondary-button" type="button" loading={loading} loadingText="Memuat..." onClick={() => void refresh()}>Muat ulang</AsyncButton>}</div>
          {message && <p className="admin-message" role="status">{message}</p>}
          {loading && <p className="loading-copy">Memuat data admin...</p>}

          {!loading && tab === "summary" && <div className="admin-stats">
            <button onClick={() => navigate("stations", { fillingMode: "master" })}><strong>{stations.filter((row) => row.active).length}</strong><span>Stasiun aktif</span></button>
            <button onClick={() => navigate("accounts")}><strong>{accounts.filter((row) => row.active).length}</strong><span>Akun aktif</span></button>
            <button onClick={() => navigate("stations", { fillingMode: "master" })}><strong>{siteTypeSummary.totalCount}</strong><span>Site</span></button>
            <button onClick={() => navigate("products")}><strong>{productTotal}</strong><span>Produk</span></button>
            <button onClick={() => navigate("stations", { fillingMode: "submissions" })}><strong>{submissions.length}</strong><span>Submission</span></button>
            <button onClick={() => navigate("locks")}><strong>{activeLocks.length}</strong><span>Lock aktif</span></button>
            <button onClick={() => navigate("qc", { qcStatus: "PENDING" })}><strong>{proposals.filter((row) => row.status === "PENDING").length}</strong><span>QC Pending</span></button>
            <button onClick={() => navigate("qc", { qcStatus: "APPROVED" })}><strong>{proposals.filter((row) => row.status === "APPROVED").length}</strong><span>Approved</span></button>
            <button onClick={() => navigate("qc", { qcStatus: "MERGED" })}><strong>{proposals.filter((row) => row.status === "MERGED").length}</strong><span>Merged</span></button>
            <button onClick={() => navigate("qc", { qcStatus: "REJECTED" })}><strong>{proposals.filter((row) => row.status === "REJECTED").length}</strong><span>Rejected</span></button>
          </div>}

          {!loading && tab === "summary" && <section className="admin-site-type-summary" aria-labelledby="site-type-summary-heading">
            <div className="admin-section-heading"><h3 id="site-type-summary-heading">Site berdasarkan Tipe Site</h3><span>{siteTypeSummary.totalCount} site unik</span></div>
            <div className="admin-site-type-grid">
              {siteTypeSummary.byType.map((siteType) => <div className="admin-site-type-item" key={siteType.id}><span>{siteType.name}</span><strong>{siteType.count}</strong></div>)}
            </div>
          </section>}

          {!loading && tab === "stations" && <div className="status-tabs filling-mode-tabs" role="tablist" aria-label="Mode Stasiun dan Pengisian">
            <button role="tab" aria-selected={fillingMode === "master"} className={fillingMode === "master" ? "active" : ""} onClick={() => { setFillingMode("master"); setSearch(""); }}>Master Pengisian</button>
            <button role="tab" aria-selected={fillingMode === "submissions"} className={fillingMode === "submissions" ? "active" : ""} onClick={() => { setSubmissionMonitorMounted(true); setFillingMode("submissions"); setSearch(""); }}>Submission</button>
          </div>}

          {!loading && tab === "products" && <AdminProducts onChanged={refreshProductSummary} />}

          {!loading && searchTab && tab !== "stations" && <label className="admin-search">Cari<input autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={adminSearchPlaceholder(searchTab)} /></label>}

          {!loading && tab === "stations" && fillingMode === "master" && <div className="station-filling-toolbar">
            <label className="admin-search">Cari<input autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={adminSearchPlaceholder("stations")} /></label>
            <AdminBulkExport stations={stations} sites={sites} siteTypes={siteTypes} subtypes={subtypes} onMessage={setMessage} />
          </div>}

          {!loading && tab === "stations" && fillingMode === "master" && <div className="admin-list">
            {filteredStationFillingViews.map(({ station, view, visibleRows }) => <StationFillingCard
              key={station.id}
              station={station}
              view={view}
              visibleRows={visibleRows}
              expanded={expandedStationId === station.id}
              busyAction={activeAction?.startsWith(`download:${station.id}:`) ? activeAction : null}
              onToggle={(open) => setExpandedStationId(open ? station.id : null)}
              onDownload={(selectedStation, site, subtype) => void runAction(`download:${site.id}:${subtype.id}`, () => downloadRow(selectedStation, site, subtype))}
            />)}
          </div>}

          {submissionMonitorMounted && <div hidden={tab !== "stations" || fillingMode !== "submissions"}>
            <AdminSubmissionMonitor
              stations={stations}
              siteTypes={siteTypes}
              onDownload={downloadSubmission}
              onChanged={refresh}
            />
          </div>}

          {!loading && tab === "accounts" && <div className="admin-table-wrap accounts-table"><table><thead><tr><th>Stasiun</th><th>Username</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
            {filteredAccounts.map((account) => <tr key={account.id}><td>{stationMap.get(account.station_id)?.name ?? "Stasiun tidak ditemukan"}</td><td>{account.username}</td><td><span className={`status-pill ${account.active ? "active" : "inactive"}`}>{account.active ? "Aktif" : "Nonaktif"}</span></td><td className="table-actions"><AsyncButton loading={activeAction === `account:${account.id}:active`} loadingText={account.active ? "Menonaktifkan..." : "Mengaktifkan..."} onClick={() => void runAction(`account:${account.id}:active`, () => accountAction({ action: "set-active", accountId: account.id, active: !account.active }, `${account.active ? "Nonaktifkan" : "Aktifkan"} akun ${account.username}?`))}>{account.active ? "Nonaktifkan" : "Aktifkan"}</AsyncButton><AsyncButton loading={activeAction === `account:${account.id}:reset`} loadingText="Mereset..." onClick={() => void runAction(`account:${account.id}:reset`, () => accountAction({ action: "reset-password", accountId: account.id }, `Reset password ${account.username}? Password lama langsung tidak berlaku.`))}>Reset Password</AsyncButton></td></tr>)}
            {filteredUnprovisionedStations.map((station) => <tr key={station.id}><td>{station.name}</td><td>-</td><td><span className="status-pill pending">Belum ada akun</span></td><td><AsyncButton loading={activeAction === `account:${station.id}:provision`} loadingText="Membuat akun..." onClick={() => void runAction(`account:${station.id}:provision`, () => accountAction({ action: "provision", stationId: station.id }, `Buat akun baru untuk ${station.name}?`))}>Provision akun</AsyncButton></td></tr>)}
            {!filteredAccounts.length && !filteredUnprovisionedStations.length && <tr><td colSpan={4}>Akun atau stasiun tidak ditemukan.</td></tr>}
          </tbody></table></div>}

          {!loading && tab === "locks" && <div className="admin-table-wrap"><table><thead><tr><th>Stasiun</th><th>Site / Subtipe</th><th>Operator</th><th>Session</th><th>Durasi</th><th>Aksi</th></tr></thead><tbody>
            {activeLocks.map((lock) => <tr key={lock.id}><td>{stationMap.get(lock.station_id)?.name}</td><td>{siteMap.get(lock.site_id)?.name}<small>{subtypeMap.get(lock.site_subtype_id)?.name}</small></td><td>{lock.lock_operator_name || "Tidak diketahui"}</td><td><code>{lock.locked_by_session_id?.slice(0, 8)}</code></td><td>{ageLabel(lock.lock_last_activity_at, loadedAt)}</td><td><AsyncButton className="danger-inline" loading={activeAction === `lock:${lock.id}`} loadingText="Melepas lock..." onClick={() => void runAction(`lock:${lock.id}`, () => forceRelease(lock.id))}>Paksa Lepas Lock</AsyncButton></td></tr>)}
            {!activeLocks.length && <tr><td colSpan={6}>Tidak ada lock aktif.</td></tr>}
          </tbody></table></div>}

          {!loading && tab === "qc" && <>
            <div className="qc-toolbar"><div className="status-tabs">{(["PENDING", "APPROVED", "MERGED", "REJECTED"] as const).map((status) => <button key={status} className={qcStatus === status ? "active" : ""} onClick={() => { setQcStatus(status); setSelectedProposals([]); }}>{status} ({proposals.filter((row) => row.status === status).length})</button>)}</div><button className="secondary-button" disabled={!pendingSpreadsheet.length} onClick={exportProducts}>Unduh Produk Baru untuk Spreadsheet ({pendingSpreadsheet.length})</button></div>
            {qcStatus === "PENDING" && <div className="bulk-merge"><div className="qc-merge-combobox">
              <input
                aria-activedescendant={mergeActiveIndex >= 0 ? `qc-merge-option-${mergeActiveIndex}` : undefined}
                aria-autocomplete="list"
                aria-controls="qc-merge-options"
                aria-expanded={mergePickerOpen}
                aria-label="Pilih produk existing tujuan merge"
                role="combobox"
                placeholder="Pilih produk existing tujuan merge"
                value={mergeProductQuery}
                onFocus={() => { if (mergeProductId) setMergeProductQuery(""); openMergePicker(); }}
                onBlur={closeMergePicker}
                onChange={(event) => { setMergeProductQuery(event.target.value); setMergePickerOpen(true); setMergeActiveIndex(-1); }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); openMergePicker(); setMergeActiveIndex((current) => mergeKeyboardOptions.length ? Math.min(current + 1, mergeKeyboardOptions.length - 1) : -1); }
                  else if (event.key === "ArrowUp") { event.preventDefault(); openMergePicker(); setMergeActiveIndex((current) => mergeKeyboardOptions.length ? Math.max(current - 1, 0) : -1); }
                  else if (event.key === "Enter" && mergePickerOpen && mergeActiveIndex >= 0) { event.preventDefault(); const product = mergeKeyboardOptions[mergeActiveIndex]; if (product) selectMergeProduct(product); }
                  else if (event.key === "Escape") { setMergePickerOpen(false); setMergeActiveIndex(-1); }
                }}
              />
              {mergePickerOpen && <div id="qc-merge-options" className="qc-merge-options" role="listbox">
                {!normalizedMergeQuery && (selectedPendingProposals.length ? <>
                  <p className="qc-merge-section-label">{mergeRecommendationRanks[0]?.kind === "nearest" ? "Kandidat terdekat" : "Disarankan"}</p>
                  {mergeRecommendationRanks.map((candidate, index) => <button id={`qc-merge-option-${index}`} key={`recommended:${candidate.product.id}`} type="button" role="option" aria-selected={mergeProductId === candidate.product.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectMergeProduct(candidate.product)}><strong>{candidate.product.brand}</strong><span>{candidate.product.model}</span><small>{candidate.confidence}</small></button>)}
                  {!mergeRecommendationRanks.length && <p className="qc-merge-message">Belum ada produk yang cukup mirip untuk direkomendasikan.</p>}
                </> : <p className="qc-merge-message">Centang usulan QC untuk melihat rekomendasi.</p>)}
                {qcProductsLoading ? <p className="qc-merge-message">Memuat produk...</p> : <>
                  <p className="qc-merge-section-label">{normalizedMergeQuery ? "Hasil pencarian" : "Semua produk"}</p>
                  {mergeSearchResults.map((product, index) => <button id={`qc-merge-option-${(normalizedMergeQuery ? 0 : mergeRecommendationRanks.length) + index}`} key={product.id} type="button" role="option" aria-selected={mergeProductId === product.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectMergeProduct(product)}><strong>{product.brand}</strong><span>{product.model}</span></button>)}
                  {!mergeSearchResults.length && <p className="qc-merge-message">Produk tidak ditemukan.</p>}
                </>}
              </div>}
              {mixedMergeSelection && <p className="qc-merge-warning">Usulan yang dipilih tampak memiliki Merk/Tipe yang berbeda. Periksa kembali sebelum menggabungkan.</p>}
            </div><AsyncButton className="primary-button" disabled={!selectedProposals.length || !mergeProductId} loading={activeAction === "qc:merge"} loadingText={`Memproses ${selectedProposals.length} item...`} onClick={() => void runAction("qc:merge", () => merge(selectedProposals))}>Gabungkan Semua ({selectedProposals.length})</AsyncButton></div>}
            <div className="admin-table-wrap qc-proposals-table"><table><thead><tr>{qcStatus === "PENDING" && <th>Pilih</th>}<th>Usulan Brand / Tipe</th><th>Stasiun / Operator</th><th>Site / Subtipe / Kategori</th><th>Tanggal</th><th>Hasil QC</th><th>Aksi</th></tr></thead><tbody>
              {filteredProposals.map((proposal) => <tr key={proposal.id}>{qcStatus === "PENDING" && <td><input type="checkbox" checked={selectedProposals.includes(proposal.id)} onChange={(event) => setSelectedProposals((current) => event.target.checked ? [...current, proposal.id] : current.filter((id) => id !== proposal.id))} /></td>}<td><strong>{proposal.proposed_brand}</strong><small>{proposal.proposed_model}</small></td><td>{stationMap.get(proposal.station_id)?.name}<small>{proposal.operator_name || "-"}</small></td><td className="qc-proposal-context"><strong>{proposal.context.siteName ?? (proposal.context.state === "missing-submission" ? "Konteks submission tidak tersedia" : proposal.context.state === "unavailable" ? "-" : "Site tidak ditemukan")}</strong>{proposal.context.state !== "missing-submission" && proposal.context.state !== "unavailable" && <small>{proposal.context.subtypeName ?? "Subtipe tidak ditemukan"}</small>}<small title={proposal.context.categories.join(" · ") || undefined}>{proposalCategoryLabel(proposal.context)}</small></td><td>{new Date(proposal.created_at).toLocaleDateString("id-ID")}</td><td className="qc-result-cell">{proposal.resolved_product_id ? <><strong>{`${productMap.get(proposal.resolved_product_id)?.brand ?? ""} - ${productMap.get(proposal.resolved_product_id)?.model ?? ""}`}</strong>{proposal.review_note?.trim() && <small className="qc-result-note">Catatan: {proposal.review_note}</small>}</> : proposal.review_note || "-"}{proposal.status !== "PENDING" && proposal.reviewer && <small className="qc-reviewer">Diproses oleh {proposal.reviewer.displayName}{proposal.reviewed_at ? ` · ${new Date(proposal.reviewed_at).toLocaleString("id-ID")}` : ""}</small>}</td><td className="table-actions">{proposal.status === "PENDING" && <><button onClick={() => void approve(proposal)}>Approve Baru</button><button onClick={() => { setSelectedProposals([proposal.id]); setMessage("Pilih produk tujuan pada kotak merge."); }}>Merge</button><button className="danger-inline" onClick={() => void reject(proposal)}>Tolak</button></>}</td></tr>)}
              {!filteredProposals.length && <tr><td colSpan={qcStatus === "PENDING" ? 7 : 6}>Tidak ada proposal pada status ini.</td></tr>}
            </tbody></table></div>
            <div className="admin-subheading"><div><strong>Perubahan master yang perlu masuk Spreadsheet</strong><span>Produk QC baru atau koreksi canonical yang belum direkonsiliasi.</span></div></div>
            <div className="admin-table-wrap"><table><thead><tr><th>Product ID</th><th>Brand</th><th>Tipe</th><th>Sumber</th><th>Aksi</th></tr></thead><tbody>
              {pendingSpreadsheet.map((product) => <tr key={product.id}><td><code>{product.id}</code></td><td>{product.brand}</td><td>{product.model}</td><td>{product.source_origin}</td><td><AsyncButton loading={activeAction === `qc:canonical:${product.id}`} loadingText="Menyimpan..." onClick={() => void runAction(`qc:canonical:${product.id}`, () => editCanonical(product))}>Koreksi canonical</AsyncButton></td></tr>)}
              {!pendingSpreadsheet.length && <tr><td colSpan={5}>Semua produk sudah sinkron dengan Spreadsheet.</td></tr>}
            </tbody></table></div>
          </>}

          {!loading && tab === "audit" && <div className="admin-table-wrap"><table><thead><tr><th>Waktu</th><th>Admin</th><th>Aksi</th><th>Target</th><th>Metadata</th></tr></thead><tbody>{audits.map((audit) => { const actor = adminIdentityMap.get(audit.admin_auth_user_id); return <tr key={audit.id}><td>{new Date(audit.created_at).toLocaleString("id-ID")}</td><td>{actor?.displayName ?? audit.admin_auth_user_id.slice(0, 8)}{actor && actor.displayName !== actor.username && <small>{actor.username}</small>}</td><td><span className="status-pill">{audit.action}</span></td><td>{audit.target_type}<small>{audit.target_id?.slice(0, 8) ?? "-"}</small></td><td><code>{JSON.stringify(audit.metadata)}</code></td></tr>; })}</tbody></table></div>}
        </section>
      </div>
      {credential && (
        <div className="credential-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCredentialDialog(); }}>
          <section className="credential-dialog" role="dialog" aria-modal="true" aria-labelledby="credential-dialog-title">
            <div className="credential-dialog-heading">
              <div><p className="eyebrow">CREDENTIAL SEMENTARA</p><h2 id="credential-dialog-title">{credential.title}</h2></div>
              <button type="button" aria-label="Tutup dialog password" onClick={closeCredentialDialog}>Tutup</button>
            </div>
            <p className="credential-warning">Simpan atau kirim password ini sekarang. Setelah dialog ditutup, password tidak dapat ditampilkan kembali.</p>
            <dl>
              <div><dt>Username</dt><dd>{credential.username || "Sesuai akun stasiun"}</dd></div>
              <div><dt>Password baru</dt><dd className="credential-password-row">
                <input aria-label="Password baru" autoComplete="off" readOnly type={credentialVisible ? "text" : "password"} value={credential.password} />
                <button
                  className="password-visibility-button"
                  type="button"
                  aria-label={credentialVisible ? "Sembunyikan password" : "Tampilkan password"}
                  aria-pressed={credentialVisible}
                  onClick={() => setCredentialVisible((current) => !current)}
                >
                  <EyeIcon hidden={credentialVisible} />
                </button>
              </dd></div>
            </dl>
            <div className="credential-dialog-actions">
              <button className="secondary-button" type="button" onClick={() => void navigator.clipboard.writeText(credential.password)}>Salin Password</button>
              <button className="primary-button" type="button" onClick={closeCredentialDialog}>Tutup</button>
            </div>
          </section>
        </div>
      )}
      <FooterAttribution />
    </main>
  );
}
