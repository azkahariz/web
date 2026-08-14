"use client";

import { useMemo } from "react";
import { buildStationSiteProgress, type StationSubmissionProgress } from "../lib/station-site-progress";
import type { DataSet, StationSite } from "../types/inventory";

export default function StationSiteProgressPanel({
  data,
  sites,
  submissions,
  loading,
  error,
  selectedSite,
  disabled,
  onSelectSite,
}: {
  data: DataSet;
  sites: StationSite[];
  submissions: StationSubmissionProgress[];
  loading: boolean;
  error: string;
  selectedSite: string;
  disabled: boolean;
  onSelectSite: (site: string) => void;
}) {
  const rows = useMemo(() => buildStationSiteProgress(data, sites, submissions), [data, sites, submissions]);

  return (
    <section className="station-site-progress" aria-labelledby="station-site-progress-title">
      <div className="station-site-progress-head">
        <div>
          <p className="eyebrow">RINGKASAN PENGISIAN</p>
          <h3 id="station-site-progress-title">Ringkasan Site Saya</h3>
        </div>
        {loading && <span>Memuat...</span>}
      </div>
      {error && <p className="station-site-progress-error">{error}</p>}
      <div className="station-site-progress-list">
        {rows.map((row) => (
          <button
            className={`station-site-progress-row ${selectedSite === row.siteName ? "selected" : ""}`}
            disabled={disabled}
            key={row.siteId}
            onClick={() => onSelectSite(row.siteName)}
          >
            <span className="station-site-progress-name"><strong>{row.siteName}</strong><small>{row.siteType}</small></span>
            {row.warehouseMode ? (
              <span className="station-site-progress-state"><strong>{row.warehouseCategoryCount} kategori</strong><small>{row.warehouseUnitCount} unit</small></span>
            ) : (
              <span className="station-site-progress-state"><strong>{row.progressPercent}%</strong><small>{row.totalCount ? `${row.filledCount}/${row.totalCount} kategori` : "Profil belum tersedia"}</small></span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
