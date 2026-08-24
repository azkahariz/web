"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import { submissionItemDisplays, type SubmissionDetail, type SubmissionSummary } from "../lib/submission-monitoring";

function formatUpdated(row: Pick<SubmissionSummary, "last_saved_at" | "updated_at">) {
  return new Date(row.last_saved_at ?? row.updated_at).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SubmissionProgressDetail({
  detail,
  pendingProposalIds,
  actionId,
  onDownload,
  onArchive,
  onDelete,
}: {
  detail: SubmissionDetail;
  pendingProposalIds?: ReadonlySet<string>;
  actionId: string | null;
  onDownload: (row: SubmissionSummary) => Promise<void>;
  onArchive: (row: SubmissionSummary) => Promise<void>;
  onDelete: (row: SubmissionSummary) => Promise<void>;
}) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());
  const visibleItems = useMemo(() => submissionItemDisplays(detail, pendingProposalIds), [detail, pendingProposalIds]);

  return <div className="submission-inline-detail">
    <div className="submission-detail-summary">{detail.progress_kind === "WAREHOUSE" ? <>
      <div><strong>Inventaris Gudang</strong><span>Tidak memakai target kelengkapan katalog</span></div>
      <strong>{detail.warehouse_unit_count} unit / {detail.warehouse_category_count} kategori</strong>
    </> : <>
      <div><strong>Progress Barang</strong><span>{detail.filled_count} dari {detail.total_count} kategori terisi</span></div>
      <strong>{detail.progress_percent}%</strong>
    </>}</div>
    <div className="submission-item-list">{visibleItems.map((item) => {
      const itemExpanded = expandedItems.has(item.name);
      const first = item.entries[0];
      return <div className={item.filled ? "filled" : "empty"} key={item.name}>
        <button
          type="button"
          disabled={item.entries.length < 2}
          aria-expanded={item.entries.length > 1 ? itemExpanded : undefined}
          onClick={() => setExpandedItems((current) => {
            const next = new Set(current);
            if (next.has(item.name)) next.delete(item.name); else next.add(item.name);
            return next;
          })}
        >
          <span>{item.filled ? "\u2713" : "\u25CB"} {item.name}</span>
          {first && <small>{first.kind === "material" ? first.primary : `${first.primary} - ${first.secondary}`} · {first.unitCount} unit{first.functions.length > 1 ? ` · ${first.functions.join(" + ")}` : ""}{item.entries.length > 1 ? ` + ${item.entries.length - 1} lainnya` : ""}</small>}
          {item.hasPendingQc && <small className="qc-pending-badge">QC Pending</small>}
          {item.entries.length > 1 && <b aria-hidden="true">{itemExpanded ? "\u25B2" : "\u25BC"}</b>}
        </button>
        {itemExpanded && <ol>{item.entries.map((entry, index) => <li key={`${entry.primary}:${entry.secondary ?? ""}:${index}`}>{entry.kind === "material" ? entry.primary : `${entry.primary} - ${entry.secondary}`} · {entry.unitCount} unit{entry.functions.length > 1 ? ` · ${entry.functions.join(" + ")}` : ""}</li>)}</ol>}
        {itemExpanded && item.entries.some((entry) => entry.pendingQc) && <div className="submission-pending-items">{item.entries.filter((entry) => entry.pendingQc).map((entry, index) => <small className="qc-pending-badge" key={`pending:${entry.primary}:${index}`}>QC Pending: {entry.primary}{entry.secondary ? ` - ${entry.secondary}` : ""}</small>)}</div>}
      </div>;
    })}</div>
    {!detail.expected_items.length && <p>Profil barang belum terpetakan pada master.</p>}
    <dl className="submission-info">
      <div><dt>Operator</dt><dd>{detail.operator_name || "-"}</dd></div>
      <div><dt>Versi</dt><dd>v{detail.version}</dd></div>
      <div><dt>Terakhir diperbarui</dt><dd>{formatUpdated(detail)}</dd></div>
      <div><dt>QC Pending</dt><dd>{detail.qc_pending_count}</dd></div>
      {detail.archive_reason && <div><dt>Alasan arsip</dt><dd>{detail.archive_reason}</dd></div>}
    </dl>
    <div className="table-actions submission-detail-actions">
      <Link className="table-action" href={`/admin/submissions/${detail.id}`} target="_blank" rel="noopener noreferrer">Buka</Link>
      <AsyncButton loading={actionId === `download:${detail.id}`} loadingText="Menyiapkan..." onClick={() => void onDownload(detail)}>Unduh</AsyncButton>
      <AsyncButton className={detail.archived_at ? "" : "danger-inline"} loading={actionId === `archive:${detail.id}`} loadingText={detail.archived_at ? "Memulihkan..." : "Mengarsipkan..."} onClick={() => void onArchive(detail)}>{detail.archived_at ? "Pulihkan Submission" : "Arsipkan Submission"}</AsyncButton>
    </div>
    <div className="submission-danger-zone">
      <div><strong>Zona Berbahaya</strong><span>Penghapusan permanen tidak dapat dipulihkan.</span></div>
      <AsyncButton className="danger-button" loading={actionId === `delete:${detail.id}`} loadingText="Menghapus..." onClick={() => void onDelete(detail)}>Hapus Permanen</AsyncButton>
    </div>
  </div>;
}
