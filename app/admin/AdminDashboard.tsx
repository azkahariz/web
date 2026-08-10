"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EyeIcon from "../components/EyeIcon";
import {
  accountMatchesAdminSearch,
  adminSearchPlaceholder,
  countDistinctStationSites,
  siteDisplayName,
  stationMatchesAdminSearch,
} from "../lib/admin-view";
import { csvCell, downloadText } from "../lib/download";
import { logoutCurrentBrowser } from "../lib/local-logout";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Station = { id: string; name: string; active: boolean };
type Site = { id: string; station_id: string; site_type_id: string; name: string; active: boolean };
type SiteType = { id: string; name: string };
type Subtype = { id: string; site_type_id: string; name: string };
type Submission = {
  id: string; station_id: string; site_id: string; site_subtype_id: string;
  version: number; payload: Record<string, unknown>; operator_name: string | null;
  locked_by_session_id: string | null; lock_operator_name: string | null;
  lock_last_activity_at: string | null; last_saved_at: string | null;
};
type Account = { id: string; station_id: string; username: string; active: boolean; updated_at: string };
type Product = { id: string; brand: string; model: string; active: boolean; source_origin: string; spreadsheet_synced: boolean };
type Proposal = {
  id: string; station_id: string; submission_id: string | null; operator_name: string | null;
  proposed_brand: string; proposed_model: string; normalized_brand: string; normalized_model: string;
  status: "PENDING" | "APPROVED" | "MERGED" | "REJECTED"; resolved_product_id: string | null;
  review_note: string | null; created_at: string;
};
type Audit = { id: string; action: string; target_type: string; target_id: string | null; metadata: Record<string, unknown>; created_at: string };
type Tab = "summary" | "stations" | "accounts" | "locks" | "qc" | "audit";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "summary", label: "Ringkasan" },
  { id: "stations", label: "Stasiun & Pengisian" },
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

export default function AdminDashboard({ username }: { username: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("summary");
  const [stations, setStations] = useState<Station[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteTypes, setSiteTypes] = useState<SiteType[]>([]);
  const [subtypes, setSubtypes] = useState<Subtype[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [search, setSearch] = useState("");
  const [qcStatus, setQcStatus] = useState<Proposal["status"]>("PENDING");
  const [selectedProposals, setSelectedProposals] = useState<string[]>([]);
  const [mergeProductId, setMergeProductId] = useState("");
  const [message, setMessage] = useState("");
  const [credential, setCredential] = useState<{ username: string; password: string; title: string } | null>(null);
  const [credentialVisible, setCredentialVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);

  const refresh = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setLoading(true);
    const [stationRows, siteRows, siteTypeRows, subtypeRows, submissionRows, accountRows, productRows, proposalRows, auditRows] = await Promise.all([
      client.from("stations").select("id, name, active").order("name"),
      client.from("sites").select("id, station_id, site_type_id, name, active").order("name"),
      client.from("site_types").select("id, name").order("name"),
      client.from("site_subtypes").select("id, site_type_id, name").order("name"),
      client.from("submissions").select("id, station_id, site_id, site_subtype_id, version, payload, operator_name, locked_by_session_id, lock_operator_name, lock_last_activity_at, last_saved_at").order("updated_at", { ascending: false }),
      client.from("station_accounts").select("id, station_id, username, active, updated_at").order("username"),
      client.from("products").select("id, brand, model, active, source_origin, spreadsheet_synced").order("brand"),
      client.from("product_proposals").select("id, station_id, submission_id, operator_name, proposed_brand, proposed_model, normalized_brand, normalized_model, status, resolved_product_id, review_note, created_at").order("created_at", { ascending: false }),
      client.from("admin_audit_log").select("id, action, target_type, target_id, metadata, created_at").order("created_at", { ascending: false }).limit(250),
    ]);
    const error = [stationRows, siteRows, siteTypeRows, subtypeRows, submissionRows, accountRows, productRows, proposalRows, auditRows].find((result) => result.error)?.error;
    if (error) setMessage(`Gagal memuat dashboard: ${error.message}`);
    else {
      setStations((stationRows.data ?? []) as Station[]);
      setSites((siteRows.data ?? []) as Site[]);
      setSiteTypes((siteTypeRows.data ?? []) as SiteType[]);
      setSubtypes((subtypeRows.data ?? []) as Subtype[]);
      setSubmissions((submissionRows.data ?? []) as Submission[]);
      setAccounts((accountRows.data ?? []) as Account[]);
      setProducts((productRows.data ?? []) as Product[]);
      setProposals((proposalRows.data ?? []) as Proposal[]);
      setAudits((auditRows.data ?? []) as Audit[]);
    }
    setLoadedAt(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

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
  const activeLocks = submissions.filter((submission) => submission.locked_by_session_id && submission.lock_last_activity_at
    && new Date(submission.lock_last_activity_at).getTime() >= loadedAt - 5 * 60_000);
  const pendingSpreadsheet = products.filter((product) => !product.spreadsheet_synced);
  const query = search.trim().toLocaleLowerCase("id-ID");
  const filteredStations = stations.filter((station) => stationMatchesAdminSearch(station, query, sites, siteTypes, subtypes));
  const filteredAccounts = accounts.filter((account) => accountMatchesAdminSearch(account, query, stationMap));
  const filteredUnprovisionedStations = stations.filter((station) => !accountByStation.has(station.id)
    && (!query || station.name.toLocaleLowerCase("id-ID").includes(query)));
  const filteredProposals = proposals.filter((proposal) => proposal.status === qcStatus && (!query
    || `${proposal.proposed_brand} ${proposal.proposed_model} ${stationMap.get(proposal.station_id)?.name ?? ""}`.toLocaleLowerCase("id-ID").includes(query)));
  const searchTab = tab === "stations" || tab === "accounts" || tab === "qc" ? tab : null;

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
    return true;
  }

  async function forceRelease(id: string) {
    if (!window.confirm("Paksa lepas lock ini? Editor saat ini akan kehilangan hak menyimpan.")) return;
    if (await rpc("admin_force_release_submission", { p_submission_id: id })) setMessage("Lock berhasil dilepas.");
  }

  async function approve(proposal: Proposal) {
    const brand = window.prompt("Brand canonical", proposal.proposed_brand)?.trim();
    if (!brand) return;
    const model = window.prompt("Tipe/model canonical", proposal.proposed_model)?.trim();
    if (!model || !window.confirm(`Approve sebagai produk baru: ${brand} - ${model}?`)) return;
    const note = window.prompt("Catatan pemeriksaan (opsional)", "") ?? "";
    if (await rpc("admin_approve_product_proposal", { p_proposal_id: proposal.id, p_canonical_brand: brand, p_canonical_model: model, p_review_note: note || null })) {
      setMessage("Proposal disetujui sebagai produk baru.");
    }
  }

  async function merge(ids: string[]) {
    if (!ids.length || !mergeProductId) {
      setMessage("Pilih proposal dan produk tujuan terlebih dahulu.");
      return;
    }
    const target = productMap.get(mergeProductId);
    if (!target || !window.confirm(`Gabungkan ${ids.length} proposal ke ${target.brand} - ${target.model}?`)) return;
    const note = window.prompt("Catatan merge (opsional)", "") ?? "";
    if (await rpc("admin_merge_product_proposals", { p_proposal_ids: ids, p_product_id: mergeProductId, p_review_note: note || null })) {
      setSelectedProposals([]);
      setMessage(`${ids.length} proposal berhasil digabungkan.`);
    }
  }

  async function reject(proposal: Proposal) {
    const reason = window.prompt("Alasan penolakan (wajib)", "")?.trim();
    if (!reason || !window.confirm("Tolak proposal ini? Raw input tetap disimpan.")) return;
    if (await rpc("admin_reject_product_proposal", { p_proposal_id: proposal.id, p_review_note: reason })) setMessage("Proposal ditolak.");
  }

  async function editCanonical(product: Product) {
    const brand = window.prompt("Brand canonical", product.brand)?.trim();
    if (!brand) return;
    const model = window.prompt("Tipe/model canonical", product.model)?.trim();
    if (!model || !window.confirm("Simpan koreksi ini? Produk akan masuk daftar rekonsiliasi Spreadsheet.")) return;
    if (await rpc("admin_update_canonical_product", { p_product_id: product.id, p_brand: brand, p_model: model })) {
      setMessage("Produk diperbarui dan ditandai perlu disinkronkan ke Spreadsheet.");
    }
  }

  async function accountAction(body: Record<string, unknown>, confirmation: string) {
    if (!window.confirm(confirmation)) return;
    setMessage("");
    setCredential(null);
    setCredentialVisible(false);
    const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string; username?: string; temporaryPassword?: string };
    if (!response.ok) setMessage(result.error ?? "Aksi akun gagal.");
    else {
      if (result.temporaryPassword) {
        setCredential({
          username: result.username ?? "",
          password: result.temporaryPassword,
          title: body.action === "reset-password" ? "Password berhasil direset" : "Akun dan password berhasil dibuat",
        });
      }
      setMessage("Aksi akun berhasil.");
      await refresh();
    }
  }

  function closeCredentialDialog() {
    setCredentialVisible(false);
    setCredential(null);
  }

  function exportProducts() {
    const rows = [["product_id", "Merk", "Tipe", "active"], ...pendingSpreadsheet.map((product) => [product.id, product.brand, product.model, product.active])];
    downloadText("products-qc-pending-spreadsheet.csv", `\uFEFF${rows.map((row) => row.map((value) => csvCell(String(value))).join(",")).join("\r\n")}`, "text/csv;charset=utf-8");
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
        <div className="account-actions"><span className="admin-username">{username}</span><button className="logout-button" onClick={logout}>Keluar</button></div>
      </header>
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Menu admin">
          {tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setSearch(""); }}>{item.label}</button>)}
        </nav>
        <section className={`admin-content${tab === "accounts" ? " accounts-view" : ""}`}>
          <div className="admin-heading"><div><p className="kicker">PENGELOLAAN APLIKASI</p><h2>{tabs.find((item) => item.id === tab)?.label}</h2></div><button className="secondary-button" onClick={() => void refresh()}>Muat ulang</button></div>
          {message && <p className="admin-message" role="status">{message}</p>}
          {loading && <p className="loading-copy">Memuat data admin...</p>}

          {!loading && tab === "summary" && <div className="admin-stats">
            <div><strong>{stations.filter((row) => row.active).length}</strong><span>Stasiun aktif</span></div>
            <div><strong>{accounts.filter((row) => row.active).length}</strong><span>Akun aktif</span></div>
            <div><strong>{new Set(sites.map((site) => site.id)).size}</strong><span>Site</span></div>
            <div><strong>{submissions.length}</strong><span>Submission</span></div>
            <div><strong>{activeLocks.length}</strong><span>Lock aktif</span></div>
            <div><strong>{proposals.filter((row) => row.status === "PENDING").length}</strong><span>QC Pending</span></div>
            <div><strong>{proposals.filter((row) => row.status === "APPROVED").length}</strong><span>Approved</span></div>
            <div><strong>{proposals.filter((row) => row.status === "MERGED").length}</strong><span>Merged</span></div>
            <div><strong>{proposals.filter((row) => row.status === "REJECTED").length}</strong><span>Rejected</span></div>
          </div>}

          {!loading && searchTab && <label className="admin-search">Cari<input autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={adminSearchPlaceholder(searchTab)} /></label>}

          {!loading && tab === "stations" && <div className="admin-list">
            {filteredStations.map((station) => {
              const stationSubmissions = submissions.filter((submission) => submission.station_id === station.id);
              const siteCount = countDistinctStationSites(station.id, sites);
              return <details key={station.id}><summary><strong>{station.name}</strong><span>{siteCount} site, {stationSubmissions.length} submission</span></summary><div className="admin-table-wrap"><table><thead><tr><th>Site</th><th>Subtipe</th><th>Versi</th><th>Terakhir simpan</th><th>Payload</th><th>Aksi</th></tr></thead><tbody>
                {stationSubmissions.map((submission) => <tr key={submission.id}><td>{siteDisplayName(submission.site_id, siteMap)}</td><td>{subtypeMap.get(submission.site_subtype_id)?.name ?? "Subtipe tidak ditemukan"}</td><td>{submission.version}</td><td>{submission.last_saved_at ? new Date(submission.last_saved_at).toLocaleString("id-ID") : "Belum"}</td><td><details><summary>Lihat JSON</summary><pre>{JSON.stringify(submission.payload, null, 2)}</pre></details></td><td><Link className="table-action" href={`/admin/submissions/${submission.id}`}>Buka / edit</Link></td></tr>)}
                {!stationSubmissions.length && <tr><td colSpan={6}>Belum ada submission.</td></tr>}
              </tbody></table></div></details>;
            })}
          </div>}

          {!loading && tab === "accounts" && <div className="admin-table-wrap accounts-table"><table><thead><tr><th>Stasiun</th><th>Username</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
            {filteredAccounts.map((account) => <tr key={account.id}><td>{stationMap.get(account.station_id)?.name ?? "Stasiun tidak ditemukan"}</td><td>{account.username}</td><td><span className={`status-pill ${account.active ? "active" : "inactive"}`}>{account.active ? "Aktif" : "Nonaktif"}</span></td><td className="table-actions"><button onClick={() => void accountAction({ action: "set-active", accountId: account.id, active: !account.active }, `${account.active ? "Nonaktifkan" : "Aktifkan"} akun ${account.username}?`)}>{account.active ? "Nonaktifkan" : "Aktifkan"}</button><button onClick={() => void accountAction({ action: "reset-password", accountId: account.id }, `Reset password ${account.username}? Password lama langsung tidak berlaku.`)}>Reset Password</button></td></tr>)}
            {filteredUnprovisionedStations.map((station) => <tr key={station.id}><td>{station.name}</td><td>-</td><td><span className="status-pill pending">Belum ada akun</span></td><td><button onClick={() => void accountAction({ action: "provision", stationId: station.id }, `Buat akun baru untuk ${station.name}?`)}>Provision akun</button></td></tr>)}
            {!filteredAccounts.length && !filteredUnprovisionedStations.length && <tr><td colSpan={4}>Akun atau stasiun tidak ditemukan.</td></tr>}
          </tbody></table></div>}

          {!loading && tab === "locks" && <div className="admin-table-wrap"><table><thead><tr><th>Stasiun</th><th>Site / Subtipe</th><th>Operator</th><th>Session</th><th>Durasi</th><th>Aksi</th></tr></thead><tbody>
            {activeLocks.map((lock) => <tr key={lock.id}><td>{stationMap.get(lock.station_id)?.name}</td><td>{siteMap.get(lock.site_id)?.name}<small>{subtypeMap.get(lock.site_subtype_id)?.name}</small></td><td>{lock.lock_operator_name || "Tidak diketahui"}</td><td><code>{lock.locked_by_session_id?.slice(0, 8)}</code></td><td>{ageLabel(lock.lock_last_activity_at, loadedAt)}</td><td><button className="danger-inline" onClick={() => void forceRelease(lock.id)}>Paksa Lepas Lock</button></td></tr>)}
            {!activeLocks.length && <tr><td colSpan={6}>Tidak ada lock aktif.</td></tr>}
          </tbody></table></div>}

          {!loading && tab === "qc" && <>
            <div className="qc-toolbar"><div className="status-tabs">{(["PENDING", "APPROVED", "MERGED", "REJECTED"] as const).map((status) => <button key={status} className={qcStatus === status ? "active" : ""} onClick={() => { setQcStatus(status); setSelectedProposals([]); }}>{status} ({proposals.filter((row) => row.status === status).length})</button>)}</div><button className="secondary-button" disabled={!pendingSpreadsheet.length} onClick={exportProducts}>Unduh Produk Baru untuk Spreadsheet ({pendingSpreadsheet.length})</button></div>
            {qcStatus === "PENDING" && <div className="bulk-merge"><select value={mergeProductId} onChange={(event) => setMergeProductId(event.target.value)}><option value="">Pilih produk existing tujuan merge</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.brand} - {product.model}</option>)}</select><button className="primary-button" disabled={!selectedProposals.length || !mergeProductId} onClick={() => void merge(selectedProposals)}>Gabungkan Semua ({selectedProposals.length})</button></div>}
            <div className="admin-table-wrap"><table><thead><tr>{qcStatus === "PENDING" && <th>Pilih</th>}<th>Usulan Brand / Tipe</th><th>Stasiun / Operator</th><th>Tanggal</th><th>Hasil QC</th><th>Aksi</th></tr></thead><tbody>
              {filteredProposals.map((proposal) => <tr key={proposal.id}>{qcStatus === "PENDING" && <td><input type="checkbox" checked={selectedProposals.includes(proposal.id)} onChange={(event) => setSelectedProposals((current) => event.target.checked ? [...current, proposal.id] : current.filter((id) => id !== proposal.id))} /></td>}<td><strong>{proposal.proposed_brand}</strong><small>{proposal.proposed_model}</small></td><td>{stationMap.get(proposal.station_id)?.name}<small>{proposal.operator_name || "-"}</small></td><td>{new Date(proposal.created_at).toLocaleDateString("id-ID")}</td><td>{proposal.resolved_product_id ? `${productMap.get(proposal.resolved_product_id)?.brand ?? ""} - ${productMap.get(proposal.resolved_product_id)?.model ?? ""}` : proposal.review_note || "-"}</td><td className="table-actions">{proposal.status === "PENDING" && <><button onClick={() => void approve(proposal)}>Approve Baru</button><button onClick={() => { setSelectedProposals([proposal.id]); setMessage("Pilih produk tujuan pada kotak merge."); }}>Merge</button><button className="danger-inline" onClick={() => void reject(proposal)}>Tolak</button></>}</td></tr>)}
              {!filteredProposals.length && <tr><td colSpan={qcStatus === "PENDING" ? 6 : 5}>Tidak ada proposal pada status ini.</td></tr>}
            </tbody></table></div>
            <div className="admin-subheading"><div><strong>Perubahan master yang perlu masuk Spreadsheet</strong><span>Produk QC baru atau koreksi canonical yang belum direkonsiliasi.</span></div></div>
            <div className="admin-table-wrap"><table><thead><tr><th>Product ID</th><th>Brand</th><th>Tipe</th><th>Sumber</th><th>Aksi</th></tr></thead><tbody>
              {pendingSpreadsheet.map((product) => <tr key={product.id}><td><code>{product.id}</code></td><td>{product.brand}</td><td>{product.model}</td><td>{product.source_origin}</td><td><button onClick={() => void editCanonical(product)}>Koreksi canonical</button></td></tr>)}
              {!pendingSpreadsheet.length && <tr><td colSpan={5}>Semua produk sudah sinkron dengan Spreadsheet.</td></tr>}
            </tbody></table></div>
          </>}

          {!loading && tab === "audit" && <div className="admin-table-wrap"><table><thead><tr><th>Waktu</th><th>Aksi</th><th>Target</th><th>Metadata</th></tr></thead><tbody>{audits.map((audit) => <tr key={audit.id}><td>{new Date(audit.created_at).toLocaleString("id-ID")}</td><td><span className="status-pill">{audit.action}</span></td><td>{audit.target_type}<small>{audit.target_id?.slice(0, 8) ?? "-"}</small></td><td><code>{JSON.stringify(audit.metadata)}</code></td></tr>)}</tbody></table></div>}
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
    </main>
  );
}
