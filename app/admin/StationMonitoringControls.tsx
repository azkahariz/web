import type {
  StationActivityFilter,
  StationFollowUpKey,
  StationMonitoringFilters,
  StationMonitoringSort,
  StationProgressFilter,
  StationStatusFilter,
} from "../lib/station-monitoring";
import { hasStationMonitoringFilters } from "../lib/station-monitoring";

type FollowUpCounts = {
  attention: number;
  notStarted: number;
  partialUnder50: number;
  stale7: number;
};

const quickActions: Array<{ key: StationFollowUpKey; countKey: keyof FollowUpCounts; label: string }> = [
  { key: "attention", countKey: "attention", label: "Perlu Perhatian" },
  { key: "not-started", countKey: "notStarted", label: "Belum Dimulai" },
  { key: "partial-under-50", countKey: "partialUnder50", label: "Terisi <50%" },
  { key: "stale-7", countKey: "stale7", label: "Tidak diperbarui >7 hari" },
];

export default function StationMonitoringControls({
  filters,
  counts,
  visibleCount,
  totalCount,
  loading,
  available,
  onChange,
  onQuickAction,
  onReset,
}: {
  filters: StationMonitoringFilters;
  counts: FollowUpCounts;
  visibleCount: number;
  totalCount: number;
  loading: boolean;
  available: boolean;
  onChange: (next: StationMonitoringFilters) => void;
  onQuickAction: (key: StationFollowUpKey) => void;
  onReset: () => void;
}) {
  if (loading) return <section className="station-monitoring station-monitoring-skeleton" aria-label="Memuat kontrol monitoring" aria-busy="true">
    <span /><span /><span />
  </section>;
  if (!available) return null;

  return <section className="station-monitoring" aria-labelledby="station-follow-up-heading">
    <div className="station-follow-up-heading">
      <h3 id="station-follow-up-heading">Perlu ditindaklanjuti</h3>
      <small>Indikator dapat saling tumpang tindih.</small>
    </div>
    <div className="station-follow-up-actions">
      {quickActions.map((action) => {
        const count = counts[action.countKey];
        return <button key={action.key} type="button" disabled={count === 0} onClick={() => onQuickAction(action.key)}>
          <strong>{count}</strong><span>{action.label}</span>
        </button>;
      })}
    </div>

    <div className="station-monitoring-filters">
      <label>Status
        <select value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value as StationStatusFilter })}>
          <option value="all">Semua</option>
          <option value="incomplete">Belum Lengkap</option>
          <option value="LENGKAP">Lengkap</option>
          <option value="TERISI_SEBAGIAN">Terisi Sebagian</option>
          <option value="BELUM_DIMULAI">Belum Dimulai</option>
          <option value="PERLU_PERHATIAN">Perlu Perhatian</option>
          <option value="TIDAK_DINILAI">Tidak Dinilai</option>
        </select>
      </label>
      <label>Progress
        <select value={filters.progress} onChange={(event) => onChange({ ...filters, progress: event.target.value as StationProgressFilter })}>
          <option value="all">Semua</option>
          <option value="lt25">Kurang dari 25%</option>
          <option value="lt50">Kurang dari 50%</option>
          <option value="50to99">50-99%</option>
          <option value="100">100%</option>
        </select>
      </label>
      <label>Aktivitas
        <select value={filters.activity} onChange={(event) => onChange({ ...filters, activity: event.target.value as StationActivityFilter })}>
          <option value="all">Semua</option>
          <option value="never">Belum pernah disimpan</option>
          <option value="stale7">Tidak diperbarui &gt; 7 hari</option>
          <option value="stale14">Tidak diperbarui &gt; 14 hari</option>
        </select>
      </label>
      <label>Urutkan
        <select value={filters.sort} onChange={(event) => onChange({ ...filters, sort: event.target.value as StationMonitoringSort })}>
          <option value="priority">Prioritas Tindak Lanjut</option>
          <option value="progress-asc">Progress Terendah</option>
          <option value="progress-desc">Progress Tertinggi</option>
          <option value="oldest">Paling Lama Tidak Diperbarui</option>
          <option value="newest">Pembaruan Terbaru</option>
          <option value="name-asc">Nama A-Z</option>
          <option value="name-desc">Nama Z-A</option>
        </select>
      </label>
      {hasStationMonitoringFilters(filters) && <button className="station-monitoring-reset" type="button" onClick={onReset}>Reset filter</button>}
    </div>
    <p className="station-monitoring-result" role="status">Menampilkan <strong>{visibleCount}</strong> dari <strong>{totalCount}</strong> Stasiun</p>
  </section>;
}
