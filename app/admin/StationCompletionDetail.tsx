"use client";

import { useState } from "react";
import AsyncButton from "../components/AsyncButton";
import type { StationCompletionDetailResponse, StationCompletionDetailRow } from "../lib/station-completion";
import {
  stationCompletionDetailKey,
  stationCompletionIncompleteRows,
  stationCompletionStatusClass,
  stationCompletionStatusLabel,
} from "../lib/station-completion-view";

const VISIBLE_MISSING_LIMIT = 3;

function isStationWithoutSite(row: StationCompletionDetailRow) {
  return !row.site_id || row.issues.some((issue) => issue.code === "station_has_no_active_site");
}

function CompletionGap({ row }: { row: StationCompletionDetailRow }) {
  const [showAllCategories, setShowAllCategories] = useState(false);
  const key = stationCompletionDetailKey(row);
  const categoryListId = `missing-categories-${key}`;
  const hasManyMissing = row.missing_categories.length > 5;
  const visibleCategories = hasManyMissing && !showAllCategories
    ? row.missing_categories.slice(0, VISIBLE_MISSING_LIMIT)
    : row.missing_categories;

  return <article className="station-completion-gap">
    <div className="station-completion-gap-heading">
      <div>
        <strong>{row.site_name ?? "Belum Ada Konfigurasi"}</strong>
        {(row.site_type_name || row.subtype_name) && <span>{[row.site_type_name, row.subtype_name].filter(Boolean).join(" · ")}</span>}
      </div>
      <span className={`station-completion-status ${stationCompletionStatusClass(row.status)}`}>{stationCompletionStatusLabel(row.status)}</span>
    </div>

    {isStationWithoutSite(row) ? <p>Stasiun belum memiliki Site aktif yang dapat dimonitor.</p>
      : row.is_warehouse ? <p>Pengisian Gudang belum tersedia.</p>
        : <>
          {row.status === "BELUM_DIMULAI" && <p>Pengisian belum tersedia.</p>}
          {row.status !== "BELUM_DIMULAI" && <p><strong>{row.filled_category_count} / {row.expected_category_count}</strong> kategori terisi</p>}
          <p>{row.missing_categories.length} kategori belum terisi</p>
        </>}

    {row.issues.length > 0 && <ul className="station-completion-issues">
      {row.issues.map((issue) => <li key={issue.code}>{issue.label}</li>)}
    </ul>}

    {!row.is_warehouse && visibleCategories.length > 0 && <div className="station-completion-missing">
      <span>Belum:</span>
      <ul id={categoryListId}>{visibleCategories.map((category) => <li key={category.id}>{category.label}</li>)}</ul>
      {hasManyMissing && <button
        type="button"
        aria-expanded={showAllCategories}
        aria-controls={categoryListId}
        onClick={() => setShowAllCategories((current) => !current)}
      >{showAllCategories ? "Sembunyikan kategori" : `Lihat semua ${row.missing_categories.length} kategori`}</button>}
      <span className="sr-only" aria-live="polite">{showAllCategories ? "Semua kategori ditampilkan" : "Sebagian kategori ditampilkan"}</span>
    </div>}
  </article>;
}

export default function StationCompletionDetail({
  detail,
  loading,
  error,
  onRetry,
}: {
  detail: StationCompletionDetailResponse | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const incompleteRows = detail ? stationCompletionIncompleteRows(detail.rows) : [];

  return <section className="station-completion-detail" aria-labelledby={detail ? `completion-detail-${detail.station_id}` : undefined} aria-busy={loading}>
    <div className="station-completion-detail-heading">
      <div><h3 id={detail ? `completion-detail-${detail.station_id}` : undefined}>Yang belum dilengkapi</h3>
        {detail && <span>{incompleteRows.length} pengisian memerlukan tindak lanjut</span>}
      </div>
      {detail && detail.summary.complete_submission_count > 0 && <strong>{detail.summary.complete_submission_count} pengisian lengkap</strong>}
    </div>

    {loading && !detail && <div className="station-completion-detail-skeleton" aria-label="Memuat detail kelengkapan"><span /><span /><span /></div>}
    {error && <div className="station-completion-detail-error" role="alert"><span>{error}</span><AsyncButton type="button" loading={loading} loadingText="Memuat..." onClick={onRetry}>Coba muat ulang</AsyncButton></div>}
    {detail && incompleteRows.length === 0 && <p className="station-completion-complete">Semua pengisian yang diwajibkan sudah tersedia dan kategori yang dipersyaratkan sudah terisi.</p>}
    {detail && incompleteRows.length > 0 && <div className="station-completion-gap-list">
      {incompleteRows.map((row) => <CompletionGap key={stationCompletionDetailKey(row)} row={row} />)}
    </div>}
  </section>;
}
