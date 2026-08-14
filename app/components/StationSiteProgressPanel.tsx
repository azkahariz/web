"use client";

import { useMemo } from "react";
import { buildStationSiteProgress, summarizeStationSiteProgress, type StationSubmissionProgress } from "../lib/station-site-progress";
import type { DataSet, StationSite } from "../types/inventory";

export default function StationSiteProgressPanel({
  data,
  sites,
  submissions,
  loading,
  selectedSite,
  disabled,
  onSelectSite,
}: {
  data: DataSet;
  sites: StationSite[];
  submissions: StationSubmissionProgress[];
  loading: boolean;
  selectedSite: string;
  disabled: boolean;
  onSelectSite: (site: string) => void;
}) {
  const rows = useMemo(() => buildStationSiteProgress(data, sites, submissions), [data, sites, submissions]);
  const summary = useMemo(() => summarizeStationSiteProgress(rows), [rows]);

  return (
    <section className="station-site-progress" aria-labelledby="station-site-progress-title">
      <div className="station-site-progress-head">
        <div>
          <p className="eyebrow">RINGKASAN PENGISIAN</p>
          <h3 id="station-site-progress-title">Ringkasan Site Saya</h3>
        </div>
        {loading && <span>Memuat...</span>}
      </div>
      <div className="station-site-progress-stats" aria-label="Ringkasan progress site">
        <span><strong>{summary.total}</strong>Total Site</span>
        <span><strong>{summary.notStarted}</strong>Belum mulai</span>
        <span><strong>{summary.partial}</strong>Terisi sebagian</span>
        <span><strong>{summary.complete}</strong>Lengkap</span>
      </div>
      <div className="station-site-progress-list">
        {rows.map((row) => (
          <button
            className={`station-site-progress-row ${selectedSite === row.siteName ? "selected" : ""}`}
            disabled={disabled}
            key={row.siteId}
            onClick={() => onSelectSite(row.siteName)}
          >
            <span className="station-site-progress-name"><strong>{row.siteName}</strong><small>{row.siteType}</small></span>
            <span className="station-site-progress-state"><small>{row.detail}</small><em className={`site-progress-status ${row.status === "Lengkap" ? "complete" : row.status === "Terisi sebagian" ? "partial" : "empty"}`}>{row.status}</em></span>
          </button>
        ))}
      </div>
    </section>
  );
}
