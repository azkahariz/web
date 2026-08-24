"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import type { StationCompletionDetailResponse } from "../lib/station-completion";
import { stationCompletionStatusClass, stationCompletionStatusLabel } from "../lib/station-completion-view";
import type { SubmissionDetail, SubmissionSummary } from "../lib/submission-monitoring";
import { composeUnifiedFillingRows, type UnifiedFillingMasterRow } from "../lib/unified-filling";
import SubmissionProgressDetail from "./SubmissionProgressDetail";

type Site = { id: string; station_id: string; site_type_id: string; name: string; active: boolean };
type SiteType = { id: string; name: string };
type Subtype = { id: string; site_type_id: string; name: string };
type Submission = {
  id: string;
  site_id: string;
  site_subtype_id: string;
  version: number;
  operator_name: string | null;
  last_saved_at: string | null;
  updated_at: string;
};

const MISSING_PREVIEW_LIMIT = 3;

function compactUpdated(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UnifiedFillingList({
  stationName,
  masterRows,
  detail,
  loading,
  error,
  submissionDetails,
  detailLoadingIds,
  detailErrors,
  actionId,
  onRetryCompletion,
  onLoadSubmissionDetail,
  onDownload,
  onArchive,
  onDelete,
}: {
  stationName: string;
  masterRows: Array<UnifiedFillingMasterRow<Site, SiteType, Subtype, Submission>>;
  detail: StationCompletionDetailResponse | null;
  loading: boolean;
  error: string;
  submissionDetails: Record<string, SubmissionDetail>;
  detailLoadingIds: Set<string>;
  detailErrors: Record<string, string>;
  actionId: string | null;
  onRetryCompletion: () => void;
  onLoadSubmissionDetail: (id: string, force?: boolean) => Promise<void>;
  onDownload: (site: Site, subtype: Subtype, submissionId?: string) => Promise<void>;
  onArchive: (row: SubmissionSummary) => Promise<void>;
  onDelete: (row: SubmissionSummary) => Promise<void>;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [expandedMissing, setExpandedMissing] = useState<Set<string>>(() => new Set());
  const rows = useMemo(
    () => composeUnifiedFillingRows(masterRows, detail?.rows ?? []),
    [detail?.rows, masterRows],
  );

  async function toggleDetail(submissionId: string) {
    if (expandedIds.has(submissionId)) {
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(submissionId);
        return next;
      });
      return;
    }
    setExpandedIds((current) => new Set(current).add(submissionId));
    if (!submissionDetails[submissionId]) await onLoadSubmissionDetail(submissionId);
  }

  return <section className="unified-filling" aria-busy={loading} aria-label={`Pengisian ${stationName}`}>
    <div className="unified-filling-heading">
      <div><h3>Pengisian</h3><span>{rows.length} Site/Subtipe</span></div>
      {detail?.summary.station_status === "TIDAK_DINILAI" && <strong>Tidak ada pengisian non-Gudang yang dinilai</strong>}
    </div>

    {loading && !detail && <div className="station-completion-detail-skeleton" aria-label="Memuat pengisian"><span /><span /><span /></div>}
    {error && <div className="station-completion-detail-error" role="alert"><span>{error}</span><AsyncButton type="button" loading={loading} loadingText="Memuat..." onClick={onRetryCompletion}>Coba muat ulang</AsyncButton></div>}

    <div className="unified-filling-list">
      {rows.map((row) => {
        const completion = row.completion;
        const submission = row.submission;
        const submissionId = completion?.submission_id ?? submission?.id ?? null;
        const expanded = Boolean(submissionId && expandedIds.has(submissionId));
        const showAllMissing = expandedMissing.has(row.key);
        const missingCategories = completion?.missing_categories ?? [];
        const visibleMissing = missingCategories.length > 5 && !showAllMissing
          ? missingCategories.slice(0, MISSING_PREVIEW_LIMIT)
          : missingCategories;
        const status = row.isWarehouse ? "Informasional" : completion ? stationCompletionStatusLabel(completion.status) : "Kelengkapan belum tersedia";
        const subtype = row.subtype;
        const openHref = submissionId
          ? `/admin/submissions/${submissionId}`
          : subtype ? `/admin/inventory?siteId=${row.site.id}&subtypeId=${subtype.id}` : null;
        const downloadActionId = submissionId ? `download:${submissionId}` : `download:${row.site.id}:${subtype?.id ?? "no-subtype"}`;

        return <article className={`unified-filling-row${expanded ? " is-expanded" : ""}`} key={row.key}>
          <div className="unified-filling-row-main">
            <div className="unified-filling-identity">
              <strong>{row.site.name}</strong>
              <span>{[row.siteType?.name, subtype?.name].filter(Boolean).join(" · ") || "Konfigurasi belum terpetakan"}</span>
            </div>
            <div className="unified-filling-progress">
              <span className={`station-completion-status ${row.isWarehouse ? "tidak-dinilai" : stationCompletionStatusClass(completion?.status ?? "UNKNOWN")}`}>{status}</span>
              {row.isWarehouse ? <small>{submissionId ? "Inventaris Gudang tersedia" : "Belum ada inventaris tercatat"}</small>
                : completion && <small><strong>{completion.filled_category_count}/{completion.expected_category_count}</strong> kategori terisi{missingCategories.length > 0 ? ` · ${missingCategories.length} belum terisi` : ""}</small>}
            </div>
            <div className="unified-filling-meta">
              <span>{submissionId ? `v${completion?.submission_version ?? submission?.version ?? "-"}` : "Belum ada submission"}</span>
              <small>{submission?.operator_name || "Operator -"} · {compactUpdated(completion?.content_last_saved_at ?? submission?.last_saved_at ?? submission?.updated_at)}</small>
            </div>
            <div className="unified-filling-actions">
              {openHref && <Link className="table-action" href={openHref} target="_blank" rel="noopener noreferrer">Buka</Link>}
              {subtype && <AsyncButton loading={actionId === downloadActionId} loadingText="Menyiapkan..." onClick={() => void onDownload(row.site, subtype, submissionId ?? undefined)}>Unduh</AsyncButton>}
              {submissionId && <button className="detail-toggle-text" type="button" aria-expanded={expanded} onClick={() => void toggleDetail(submissionId)}>{expanded ? "Tutup rincian" : "Lihat rincian"}</button>}
            </div>
          </div>

          {!row.isWarehouse && completion?.issues.length ? <ul className="station-completion-issues">
            {completion.issues.map((issue) => <li key={issue.code}>{issue.label}</li>)}
          </ul> : null}

          {!row.isWarehouse && visibleMissing.length > 0 && <div className="unified-filling-missing">
            <span>Belum:</span>
            <ul>{visibleMissing.map((category) => <li key={category.id}>{category.label}</li>)}</ul>
            {missingCategories.length > 5 && <button type="button" aria-expanded={showAllMissing} onClick={() => setExpandedMissing((current) => {
              const next = new Set(current);
              if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
              return next;
            })}>{showAllMissing ? "Sembunyikan kategori" : `Lihat semua ${missingCategories.length} kategori`}</button>}
          </div>}

          {expanded && submissionId && <div className="unified-filling-detail">
            {detailLoadingIds.has(submissionId) && <p className="submission-loading-copy"><span className="loading-spinner" aria-hidden="true" />Memuat detail submission...</p>}
            {detailErrors[submissionId] && <p className="submission-detail-error">{detailErrors[submissionId]}<AsyncButton type="button" onClick={() => void onLoadSubmissionDetail(submissionId, true)} loading={detailLoadingIds.has(submissionId)} loadingText="Memuat...">Coba lagi</AsyncButton></p>}
            {submissionDetails[submissionId] && <SubmissionProgressDetail
              detail={submissionDetails[submissionId]}
              actionId={actionId}
              onDownload={async () => {
                if (!subtype) return;
                await onDownload(row.site, subtype, submissionId);
              }}
              onArchive={onArchive}
              onDelete={onDelete}
            />}
          </div>}
        </article>;
      })}
      {!rows.length && !loading && <p className="unified-filling-empty">Belum ada Site/Subtipe aktif untuk stasiun ini.</p>}
    </div>
  </section>;
}
