"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppFeedback } from "../components/AppFeedback";
import AsyncButton from "../components/AsyncButton";
import {
  SUBMISSION_PAGE_SIZE,
  SUBMISSION_PAGE_SIZE_MAX,
  SUBMISSION_PAGE_SIZE_MIN,
  SUBMISSION_PAGE_SIZE_OPTIONS,
  normalizeSubmissionPageSize,
  submissionItemDisplays,
  type SubmissionArchiveFilter,
  type SubmissionDetail,
  type SubmissionProgressStatus,
  type SubmissionSortDirection,
  type SubmissionSortField,
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
  "", "Kosong", "Terisi Sebagian", "Lengkap", "Gudang", "Belum terpetakan",
];

const sortableColumns: Array<{ field: SubmissionSortField; label: string }> = [
  { field: "station", label: "Stasiun" },
  { field: "site", label: "Site" },
  { field: "siteType", label: "Tipe Site" },
  { field: "subtype", label: "Subtipe" },
  { field: "progress", label: "Progres" },
  { field: "version", label: "Versi" },
  { field: "operator", label: "Operator" },
  { field: "updated", label: "Terakhir Diperbarui" },
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
  onDownload,
  onChanged,
}: {
  stations: NamedRow[];
  siteTypes: NamedRow[];
  onDownload: (row: SubmissionSummary) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const feedback = useAppFeedback();
  const [rows, setRows] = useState<SubmissionSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(SUBMISSION_PAGE_SIZE);
  const [pageSizeEditing, setPageSizeEditing] = useState(false);
  const [pageSizeDraft, setPageSizeDraft] = useState(String(SUBMISSION_PAGE_SIZE));
  const pageSizeCancelRef = useRef(false);
  const [sortField, setSortField] = useState<SubmissionSortField>("updated");
  const [sortDirection, setSortDirection] = useState<SubmissionSortDirection>("desc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [actionId, setActionId] = useState<string | null>(null);
  const lastScheduledRequestKeyRef = useRef<string | null>(null);
  const listCacheRef = useRef(new Map<string, ListCacheValue>());

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const requestKey = useMemo(
    () => [page, pageSize, debouncedSearch, stationId, siteTypeId, progress, updated, archive, sortField, sortDirection].join("\u0000"),
    [archive, debouncedSearch, page, pageSize, progress, siteTypeId, sortDirection, sortField, stationId, updated],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setExpandedId(null);
      setDebouncedSearch(search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

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
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      archive,
      updated,
      sort: sortField,
      direction: sortDirection,
    });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
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
        pageSize: result.pageSize ?? pageSize,
      };
      listCacheRef.current.set(requestKey, cached);
      setRows(cached.rows);
      setTotalCount(cached.totalCount);
      if (cached.page > Math.max(1, Math.ceil(cached.totalCount / cached.pageSize))) setPage(1);
    } catch (error) {
      feedback.toast(error instanceof Error ? error.message : "Daftar submission gagal dimuat.", "error");
    } finally {
      setLoading(false);
    }
  }, [archive, debouncedSearch, feedback, page, pageSize, progress, requestKey, siteTypeId, sortDirection, sortField, stationId, updated]);

  useEffect(() => {
    if (lastScheduledRequestKeyRef.current === requestKey) return;
    lastScheduledRequestKeyRef.current = requestKey;
    void loadList();
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
      feedback.toast(message, "error");
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
    if (!restoring) {
      const input = await feedback.prompt({
        title: "Arsipkan Submission?",
        description: "Submission akan disembunyikan dari pengisian aktif dan tetap dapat dipulihkan.",
        inputLabel: "Alasan arsip (opsional)",
        maxLength: 500,
        confirmLabel: "Lanjutkan",
      });
      if (input === null) return;
      reason = input;
    }
    const actionKey = `archive:${row.id}`;
    if (actionId) return;
    await feedback.confirmAction({
      title: restoring ? "Pulihkan Submission?" : "Konfirmasi Arsip Submission",
      description: restoring
        ? "UUID, payload, dan versi tetap sama setelah dipulihkan."
        : `${row.station_name} / ${row.site_name} / ${row.subtype_name}`,
      confirmLabel: restoring ? "Pulihkan" : "Arsipkan",
      danger: !restoring,
    }, async () => {
      setActionId(actionKey);
      try {
        const response = await fetch("/api/admin/submissions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: restoring ? "restore" : "archive", submissionId: row.id, reason }),
        });
        const result = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok) {
          feedback.toast(result.error || "Aksi submission gagal.", "error");
          return false;
        }
        setDetailCache((current) => {
          const next = { ...current };
          delete next[row.id];
          return next;
        });
        listCacheRef.current.clear();
        setExpandedId(null);
        feedback.toast(restoring ? "Submission berhasil dipulihkan." : "Submission berhasil diarsipkan.", "success");
        await Promise.all([loadList({ force: true }), onChanged()]);
        return true;
      } finally {
        setActionId(null);
      }
    });
  }

  async function permanentlyDelete(row: SubmissionSummary) {
    if (actionId) return;
    await feedback.confirmAction({
      title: "Hapus Submission secara permanen?",
      description: `${row.station_name} / ${row.site_name} / ${row.subtype_name}. Data ini akan dihapus secara permanen dan tidak dapat dipulihkan.`,
      inputLabel: "Ketik HAPUS untuk melanjutkan",
      confirmationText: "HAPUS",
      confirmLabel: "Hapus Permanen",
      danger: true,
    }, async () => {
      setActionId(`delete:${row.id}`);
      try {
        const response = await fetch("/api/admin/submissions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete", submissionId: row.id }),
        });
        const result = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok) {
          feedback.toast(result.error || "Submission gagal dihapus permanen.", "error");
          return false;
        }
        listCacheRef.current.clear();
        setDetailCache((current) => {
          const next = { ...current };
          delete next[row.id];
          return next;
        });
        setExpandedId(null);
        feedback.toast("Submission berhasil dihapus permanen.", "success");
        await Promise.all([loadList({ force: true }), onChanged()]);
        return true;
      } finally {
        setActionId(null);
      }
    });
  }

  function resetPage<T>(setter: (value: T) => void, value: T) {
    setPage(1);
    setExpandedId(null);
    setter(value);
  }

  function changeSort(field: SubmissionSortField) {
    setPage(1);
    setExpandedId(null);
    if (sortField === field) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  function applyPageSize(value: string) {
    if (pageSizeCancelRef.current) {
      pageSizeCancelRef.current = false;
      return;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < SUBMISSION_PAGE_SIZE_MIN || parsed > SUBMISSION_PAGE_SIZE_MAX) {
      setPageSizeDraft(String(pageSize));
      setPageSizeEditing(false);
      feedback.toast(`Baris per halaman harus ${SUBMISSION_PAGE_SIZE_MIN}-${SUBMISSION_PAGE_SIZE_MAX}.`, "warning");
      return;
    }
    const next = normalizeSubmissionPageSize(parsed);
    setPageSize(next);
    setPageSizeDraft(String(next));
    setPage(1);
    setExpandedId(null);
    setPageSizeEditing(false);
  }

  function rowToggle(event: React.MouseEvent<HTMLTableRowElement>, id: string) {
    if ((event.target as HTMLElement).closest("a, button, input, select, summary")) return;
    void toggleDetail(id);
  }

  const visibleItems = visibleDetail ? submissionItemDisplays(visibleDetail) : [];
  const firstRow = totalCount ? (page - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(page * pageSize, totalCount);

  return <>
    <div className="submission-toolbar">
      <label className="admin-search">Cari
        <input
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
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

    <div className={`admin-table-wrap submission-table${loading ? " is-loading" : ""}`} aria-busy={loading}><table><thead><tr>
      {sortableColumns.map((column) => <th key={column.field} aria-sort={sortField === column.field ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
        <button className="sortable-header" type="button" onClick={() => changeSort(column.field)}>
          {column.label}<span aria-hidden="true">{sortField === column.field ? (sortDirection === "asc" ? "\u25B2" : "\u25BC") : ""}</span>
        </button>
      </th>)}
      <th>Detail</th>
    </tr></thead><tbody>
      {rows.map((row) => <Fragment key={row.id}>
        <tr
          className={`submission-clickable-row${expandedId === row.id ? " is-expanded" : ""}`}
          tabIndex={0}
          onClick={(event) => rowToggle(event, row.id)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void toggleDetail(row.id);
            }
          }}
        >
          <td>{row.station_name}</td><td><strong>{row.site_name}</strong></td><td>{row.site_type_name}</td><td>{row.subtype_name}</td>
          <td>{row.progress_kind === "WAREHOUSE" ? <><span className="status-pill progress-gudang">{row.warehouse_unit_count} unit / {row.warehouse_category_count} kategori</span><small>Inventaris Gudang</small></> : <><span className={`status-pill progress-${row.progress_status.toLocaleLowerCase("id-ID").replaceAll(" ", "-")}`}>{row.filled_count}/{row.total_count} ({row.progress_percent}%)</span><small>{row.progress_status}</small></>}</td>
          <td>v{row.version}</td><td>{row.operator_name || "-"}</td><td>{formatUpdated(row)}</td>
          <td><button className="detail-toggle" type="button" aria-expanded={expandedId === row.id} aria-label={`${expandedId === row.id ? "Tutup" : "Buka"} detail ${row.site_name}`} onClick={() => void toggleDetail(row.id)}>{expandedId === row.id ? "\u25B2" : "\u25BC"}</button></td>
        </tr>
        {expandedId === row.id && <tr className="submission-detail-row"><td colSpan={9}>
          {detailLoadingId === row.id && <p className="submission-loading-copy"><span className="loading-spinner" aria-hidden="true" />Memuat detail submission...</p>}
          {detailErrors[row.id] && <p className="submission-detail-error">{detailErrors[row.id]}<AsyncButton type="button" onClick={() => void loadDetail(row.id)} loading={detailLoadingId === row.id} loadingText="Memuat...">Coba lagi</AsyncButton></p>}
          {visibleDetail && <div className="submission-inline-detail">
            <div className="submission-detail-summary">{visibleDetail.progress_kind === "WAREHOUSE" ? <><div><strong>Inventaris Gudang</strong><span>Tidak memakai target kelengkapan katalog</span></div><strong>{visibleDetail.warehouse_unit_count} unit / {visibleDetail.warehouse_category_count} kategori</strong></> : <><div><strong>Progress Barang</strong><span>{visibleDetail.filled_count} dari {visibleDetail.total_count} kategori terisi</span></div><strong>{visibleDetail.progress_percent}%</strong></>}</div>
            <div className="submission-item-list">{visibleItems.map((item) => {
              const itemKey = `${row.id}:${item.name}`;
              const itemExpanded = expandedItems.has(itemKey);
              const first = item.entries[0];
              return <div className={item.filled ? "filled" : "empty"} key={item.name}>
                <button
                  type="button"
                  disabled={item.entries.length < 2}
                  aria-expanded={item.entries.length > 1 ? itemExpanded : undefined}
                  onClick={() => setExpandedItems((current) => {
                    const next = new Set(current);
                    if (next.has(itemKey)) next.delete(itemKey); else next.add(itemKey);
                    return next;
                  })}
                >
                  <span>{item.filled ? "\u2713" : "\u25CB"} {item.name}</span>
                  {first && <small>{first.kind === "material" ? first.primary : `${first.primary} - ${first.secondary}`} · {first.unitCount} unit{first.functions.length > 1 ? ` · ${first.functions.join(" + ")}` : ""}{item.entries.length > 1 ? ` + ${item.entries.length - 1} lainnya` : ""}</small>}
                  {item.entries.length > 1 && <b aria-hidden="true">{itemExpanded ? "\u25B2" : "\u25BC"}</b>}
                </button>
                {itemExpanded && <ol>{item.entries.map((entry, index) => <li key={`${entry.primary}:${entry.secondary ?? ""}:${index}`}>{entry.kind === "material" ? entry.primary : `${entry.primary} - ${entry.secondary}`} · {entry.unitCount} unit{entry.functions.length > 1 ? ` · ${entry.functions.join(" + ")}` : ""}</li>)}</ol>}
              </div>;
            })}</div>
            {!visibleDetail.expected_items.length && <p>Profil barang belum terpetakan pada master.</p>}
            <dl className="submission-info"><div><dt>Operator</dt><dd>{visibleDetail.operator_name || "-"}</dd></div><div><dt>Versi</dt><dd>v{visibleDetail.version}</dd></div><div><dt>Terakhir diperbarui</dt><dd>{formatUpdated(visibleDetail)}</dd></div><div><dt>QC Pending</dt><dd>{visibleDetail.qc_pending_count}</dd></div>{visibleDetail.archive_reason && <div><dt>Alasan arsip</dt><dd>{visibleDetail.archive_reason}</dd></div>}</dl>
            <div className="table-actions submission-detail-actions">
              <Link className="table-action" href={`/admin/submissions/${row.id}`} target="_blank" rel="noopener noreferrer">Buka</Link>
              <AsyncButton loading={actionId === `download:${row.id}`} loadingText="Menyiapkan..." onClick={async () => { if (actionId) return; setActionId(`download:${row.id}`); try { await onDownload(row); } finally { setActionId(null); } }}>Unduh</AsyncButton>
              <AsyncButton className={row.archived_at ? "" : "danger-inline"} loading={actionId === `archive:${row.id}`} loadingText={row.archived_at ? "Memulihkan..." : "Mengarsipkan..."} onClick={() => void changeArchive(row)}>{row.archived_at ? "Pulihkan Submission" : "Arsipkan Submission"}</AsyncButton>
            </div>
            <div className="submission-danger-zone">
              <div><strong>Zona Berbahaya</strong><span>Penghapusan permanen tidak dapat dipulihkan.</span></div>
              <AsyncButton className="danger-button" loading={actionId === `delete:${row.id}`} loadingText="Menghapus..." onClick={() => void permanentlyDelete(row)}>Hapus Permanen</AsyncButton>
            </div>
          </div>}
        </td></tr>}
      </Fragment>)}
      {!loading && !rows.length && <tr><td colSpan={9}>{archive === "ACTIVE" ? "Belum ada submission aktif yang cocok." : "Belum ada submission diarsipkan yang cocok."}</td></tr>}
      {loading && !rows.length && <tr><td colSpan={9}><span className="loading-spinner" aria-hidden="true" />Memuat submission...</td></tr>}
    </tbody></table></div>

    <div className="submission-pagination" aria-label="Pagination submission">
      <label className="page-size-control">Baris per halaman:
        {pageSizeEditing ? <input
          autoFocus
          type="number"
          min={SUBMISSION_PAGE_SIZE_MIN}
          max={SUBMISSION_PAGE_SIZE_MAX}
          value={pageSizeDraft}
          onChange={(event) => setPageSizeDraft(event.target.value)}
          onBlur={() => applyPageSize(pageSizeDraft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); applyPageSize(pageSizeDraft); }
            if (event.key === "Escape") {
              pageSizeCancelRef.current = true;
              setPageSizeDraft(String(pageSize));
              setPageSizeEditing(false);
            }
          }}
        /> : <select
          aria-label="Baris per halaman"
          value={String(pageSize)}
          onDoubleClick={() => setPageSizeEditing(true)}
          onChange={(event) => {
            if (event.target.value === "custom") setPageSizeEditing(true);
            else applyPageSize(event.target.value);
          }}
        >
          {SUBMISSION_PAGE_SIZE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
          {!SUBMISSION_PAGE_SIZE_OPTIONS.includes(pageSize as (typeof SUBMISSION_PAGE_SIZE_OPTIONS)[number]) && <option value={pageSize}>{pageSize}</option>}
          <option value="custom">Custom...</option>
        </select>}
      </label>
      <span>Menampilkan {firstRow}-{lastRow} dari {totalCount}</span>
      <div className="pagination-buttons">
        <button disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Sebelumnya</button>
        <span>Halaman {page} dari {pageCount}</span>
        <button disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>Berikutnya</button>
      </div>
    </div>
  </>;
}
