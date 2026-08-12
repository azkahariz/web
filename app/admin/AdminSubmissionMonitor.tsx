"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import {
  SUBMISSION_PAGE_SIZE,
  type SubmissionArchiveFilter,
  type SubmissionDetail,
  type SubmissionProgressStatus,
  type SubmissionSummary,
} from "../lib/submission-monitoring";

type NamedRow = { id: string; name: string };

type ListResponse = {
  rows?: SubmissionSummary[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
  error?: string;
};

type ListCacheValue = {
  rows: SubmissionSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
};

const progressOptions: Array<SubmissionProgressStatus | ""> = [
  "", "Kosong", "Terisi Sebagian", "Lengkap", "Belum terpetakan",
];

function formatUpdated(row: Pick<SubmissionSummary, "last_saved_at" | "updated_at">) {
  return new Date(row.last_saved_at ?? row.updated_at).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminSubmissionMonitor({
  stations,
  siteTypes,
  onMessage,
  onDownload,
  onEdit,
  onChanged,
}: {
  stations: NamedRow[];
  siteTypes: NamedRow[];
  onMessage: (message: string) => void;
  onDownload: (row: SubmissionSummary) => Promise<void>;
  onEdit: (row: SubmissionSummary) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState<SubmissionSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [stationId, setStationId] = useState("");
  const [siteTypeId, setSiteTypeId] = useState("");
  const [progress, setProgress] = useState<SubmissionProgressStatus | "">("");
  const [updated, setUpdated] = useState("ALL");
  const [archive, setArchive] = useState<SubmissionArchiveFilter>("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, SubmissionDetail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [actionId, setActionId] = useState<string | null>(null);
  const lastScheduledRequestKeyRef = useRef<string | null>(null);
  const listCacheRef = useRef(new Map<string, ListCacheValue>());

  const pageCount = Math.max(1, Math.ceil(totalCount / SUBMISSION_PAGE_SIZE));
  const requestKey = useMemo(
    () => [page, SUBMISSION_PAGE_SIZE, search, stationId, siteTypeId, progress, updated, archive].join("\u0000"),
    [archive, page, progress, search, siteTypeId, stationId, updated],
  );

  const loadList = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!force) {
      const cached = listCacheRef.current.get(requestKey);
      if (cached) {
        setRows(cached.rows);
        setTotalCount(cached.totalCount);
        setPage(cached.page);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), archive, updated });
    if (search.trim()) params.set("search", search.trim());
    if (stationId) params.set("stationId", stationId);
    if (siteTypeId) params.set("siteTypeId", siteTypeId);
    if (progress) params.set("progress", progress);
    try {
      const response = await fetch(`/api/admin/submissions?${params}`, { cache: "no-store" });
      const result = await response.json() as ListResponse;
      if (!response.ok) throw new Error(result.error || "Daftar submission gagal dimuat.");
      const cached: ListCacheValue = {
        rows: result.rows ?? [],
        totalCount: result.totalCount ?? 0,
        page: result.page ?? page,
        pageSize: result.pageSize ?? SUBMISSION_PAGE_SIZE,
      };
      listCacheRef.current.set(requestKey, cached);
      setRows(cached.rows);
      setTotalCount(cached.totalCount);
      if (cached.page > Math.max(1, Math.ceil(cached.totalCount / SUBMISSION_PAGE_SIZE))) setPage(1);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Daftar submission gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [archive, onMessage, page, progress, requestKey, search, siteTypeId, stationId, updated]);

  useEffect(() => {
    if (lastScheduledRequestKeyRef.current === requestKey) return;
    const isInitialLoad = lastScheduledRequestKeyRef.current === null;
    lastScheduledRequestKeyRef.current = requestKey;
    if (isInitialLoad || listCacheRef.current.has(requestKey)) {
      void loadList();
      return;
    }
    const timer = window.setTimeout(() => void loadList(), 250);
    return () => window.clearTimeout(timer);
  }, [loadList, requestKey]);

  const visibleDetail = useMemo(() => expandedId ? detailCache[expandedId] : undefined, [detailCache, expandedId]);

  async function loadDetail(id: string) {
    setDetailLoadingId(id);
    setDetailErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    try {
      const response = await fetch(`/api/admin/submissions?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const result = await response.json() as { detail?: SubmissionDetail; error?: string };
      if (!response.ok || !result.detail) throw new Error(result.error || "Detail submission gagal dimuat.");
      setDetailCache((current) => ({ ...current, [id]: result.detail! }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Detail submission gagal dimuat.";
      setDetailErrors((current) => ({ ...current, [id]: message }));
      onMessage(message);
    } finally {
      setDetailLoadingId(null);
    }
  }

  async function toggleDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!detailCache[id]) await loadDetail(id);
  }

  async function reload() {
    listCacheRef.current.clear();
    setDetailCache({});
    setExpandedId(null);
    await loadList({ force: true });
  }

  async function changeArchive(row: SubmissionSummary) {
    const restoring = Boolean(row.archived_at);
    let reason = "";
    if (restoring) {
      if (!window.confirm("Pulihkan submission ini ke pengisian aktif? UUID, payload, dan versi tetap sama.")) return;
    } else {
      if (!window.confirm("Submission ini akan dihapus dari pengisian aktif, tetapi datanya tetap disimpan dan dapat dipulihkan.")) return;
      reason = window.prompt("Alasan arsip (opsional, maksimal 500 karakter)", "")?.trim() ?? "";
    }
    const actionKey = `archive:${row.id}`;
    if (actionId) return;
    setActionId(actionKey);
    try {
      const response = await fetch("/api/admin/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: restoring ? "restore" : "archive", submissionId: row.id, reason }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) {
        onMessage(result.error || "Aksi submission gagal.");
        return;
      }
      setDetailCache((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      listCacheRef.current.clear();
      setExpandedId(null);
      onMessage(restoring ? "Submission berhasil dipulihkan." : "Submission berhasil diarsipkan.");
      await Promise.all([loadList({ force: true }), onChanged()]);
    } catch {
      onMessage("Aksi submission gagal diproses. Coba lagi.");
    } finally {
      setActionId(null);
    }
  }

  function resetPage<T>(setter: (value: T) => void, value: T) {
    setPage(1);
    setExpandedId(null);
    setter(value);
  }

  return <>
    <div className="submission-toolbar">
      <label className="admin-search">Cari
        <input
          autoComplete="off"
          value={search}
          onChange={(event) => resetPage(setSearch, event.target.value)}
          placeholder="Cari stasiun, site, subtipe, atau operator..."
        />
      </label>
      <div className="submission-filter-grid">
        <label>Stasiun<select value={stationId} onChange={(event) => resetPage(setStationId, event.target.value)}><option value="">Semua stasiun</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
        <label>Status progress<select value={progress} onChange={(event) => resetPage(setProgress, event.target.value as SubmissionProgressStatus | "")}>
          {progressOptions.map((status) => <option key={status || "all"} value={status}>{status || "Semua status"}</option>)}
        </select></label>
        <label>Tipe Site<select value={siteTypeId} onChange={(event) => resetPage(setSiteTypeId, event.target.value)}><option value="">Semua tipe</option>{siteTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <label>Terakhir diperbarui<select value={updated} onChange={(event) => resetPage(setUpdated, event.target.value)}><option value="ALL">Semua waktu</option><option value="TODAY">Hari ini</option><option value="LAST_7_DAYS">7 hari terakhir</option><option value="OLDER">Lebih dari 7 hari</option></select></label>
      </div>
      <button className="secondary-button submission-reload" type="button" onClick={() => void reload()}>Muat ulang</button>
    </div>

    <div className="status-tabs submission-archive-tabs">
      <button className={archive === "ACTIVE" ? "active" : ""} onClick={() => resetPage(setArchive, "ACTIVE")}>Aktif</button>
      <button className={archive === "ARCHIVED" ? "active" : ""} onClick={() => resetPage(setArchive, "ARCHIVED")}>Diarsipkan</button>
      <span>{totalCount} submission</span>
    </div>

    <div className={`admin-table-wrap submission-table${loading ? " is-loading" : ""}`} aria-busy={loading}><table><thead><tr><th>Stasiun</th><th>Site</th><th>Tipe Site</th><th>Subtipe</th><th>Progres</th><th>Versi</th><th>Operator</th><th>Terakhir Diperbarui</th><th>Detail</th></tr></thead><tbody>
      {rows.map((row) => <Fragment key={row.id}>
        <tr className={expandedId === row.id ? "is-expanded" : ""}>
          <td>{row.station_name}</td><td><strong>{row.site_name}</strong></td><td>{row.site_type_name}</td><td>{row.subtype_name}</td>
          <td><span className={`status-pill progress-${row.progress_status.toLocaleLowerCase("id-ID").replaceAll(" ", "-")}`}>{row.filled_count}/{row.total_count} ({row.progress_percent}%)</span><small>{row.progress_status}</small></td>
          <td>v{row.version}</td><td>{row.operator_name || "-"}</td><td>{formatUpdated(row)}</td>
          <td><button className="detail-toggle" type="button" aria-expanded={expandedId === row.id} aria-label={`${expandedId === row.id ? "Tutup" : "Buka"} detail ${row.site_name}`} onClick={() => void toggleDetail(row.id)}>{expandedId === row.id ? "\u25B2" : "\u25BC"}</button></td>
        </tr>
        {expandedId === row.id && <tr className="submission-detail-row"><td colSpan={9}>
          {detailLoadingId === row.id && <p className="submission-loading-copy"><span className="loading-spinner" aria-hidden="true" />Memuat detail submission...</p>}
          {detailErrors[row.id] && <p className="submission-detail-error">{detailErrors[row.id]}<AsyncButton type="button" onClick={() => void loadDetail(row.id)} loading={detailLoadingId === row.id} loadingText="Memuat...">Coba lagi</AsyncButton></p>}
          {visibleDetail && <div className="submission-inline-detail">
            <div className="submission-detail-summary"><div><strong>Progress Barang</strong><span>{visibleDetail.filled_count} dari {visibleDetail.total_count} kategori terisi</span></div><strong>{visibleDetail.progress_percent}%</strong></div>
            <div className="submission-item-list">{visibleDetail.expected_items.map((item) => <span className={item.filled ? "filled" : "empty"} key={item.name}>{item.filled ? "\u2713" : "\u25CB"} {item.name}</span>)}</div>
            {!visibleDetail.expected_items.length && <p>Profil barang belum terpetakan pada master.</p>}
            <dl className="submission-info"><div><dt>Operator</dt><dd>{visibleDetail.operator_name || "-"}</dd></div><div><dt>Versi</dt><dd>v{visibleDetail.version}</dd></div><div><dt>Terakhir diperbarui</dt><dd>{formatUpdated(visibleDetail)}</dd></div><div><dt>QC Pending</dt><dd>{visibleDetail.qc_pending_count}</dd></div>{visibleDetail.archive_reason && <div><dt>Alasan arsip</dt><dd>{visibleDetail.archive_reason}</dd></div>}</dl>
            <div className="table-actions submission-detail-actions">
              <Link className="table-action" href={`/admin/submissions/${row.id}`}>Buka Lengkap</Link>
              <AsyncButton loading={actionId === `download:${row.id}`} loadingText="Menyiapkan..." onClick={async () => { if (actionId) return; setActionId(`download:${row.id}`); try { await onDownload(row); } finally { setActionId(null); } }}>Unduh CSV</AsyncButton>
              {!row.archived_at && <AsyncButton loading={actionId === `edit:${row.id}`} loadingText="Membuka mode edit..." onClick={async () => { if (actionId) return; setActionId(`edit:${row.id}`); try { await onEdit(row); } finally { setActionId(null); } }}>Edit sebagai Admin</AsyncButton>}
              <AsyncButton className={row.archived_at ? "" : "danger-inline"} loading={actionId === `archive:${row.id}`} loadingText={row.archived_at ? "Memulihkan..." : "Mengarsipkan..."} onClick={() => void changeArchive(row)}>{row.archived_at ? "Pulihkan Submission" : "Arsipkan Submission"}</AsyncButton>
            </div>
          </div>}
        </td></tr>}
      </Fragment>)}
      {!loading && !rows.length && <tr><td colSpan={9}>{archive === "ACTIVE" ? "Belum ada submission aktif yang cocok." : "Belum ada submission diarsipkan yang cocok."}</td></tr>}
      {loading && !rows.length && <tr><td colSpan={9}><span className="loading-spinner" aria-hidden="true" />Memuat submission...</td></tr>}
    </tbody></table></div>

    <div className="submission-pagination" aria-label="Pagination submission">
      <button disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Sebelumnya</button>
      <span>Halaman {page} dari {pageCount}</span>
      <button disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>Berikutnya</button>
    </div>
  </>;
}
