import type {
  StationConditionFilter,
  StationFollowUpKey,
  StationMonitoringFilters,
  StationMonitoringSort,
  StationQcFilter,
} from "../lib/station-monitoring";
import { hasStationMonitoringFilters } from "../lib/station-monitoring";

type FollowUpCounts = {
  notStarted: number;
  partialUnder50: number;
  partial50to99: number;
  complete: number;
};

const quickActions: Array<{ key: StationFollowUpKey; countKey: keyof FollowUpCounts; label: string }> = [
  { key: "not-started", countKey: "notStarted", label: "Belum Dimulai" },
  { key: "partial-under-50", countKey: "partialUnder50", label: "Terisi <50%" },
  { key: "partial-50-99", countKey: "partial50to99", label: "Terisi 50-99%" },
  { key: "complete", countKey: "complete", label: "Lengkap" },
];

export default function StationMonitoringControls({
  filters,
  counts,
  qcSummary,
  stationCategories,
  siteTypes,
  visibleCount,
  totalCount,
  loading,
  available,
  onChange,
  onQuickAction,
  onQcPending,
  onReset,
}: {
  filters: StationMonitoringFilters;
  counts: FollowUpCounts;
  qcSummary: { stationCount: number; totalPending: number; maxPending: number };
  stationCategories: Array<{ id: string; name: string }>;
  siteTypes: Array<{ id: string; name: string }>;
  visibleCount: number;
  totalCount: number;
  loading: boolean;
  available: boolean;
  onChange: (next: StationMonitoringFilters) => void;
  onQuickAction: (key: StationFollowUpKey) => void;
  onQcPending: () => void;
  onReset: () => void;
}) {
  if (loading) return <section className="station-monitoring station-monitoring-skeleton" aria-label="Memuat kontrol monitoring" aria-busy="true">
    <span /><span /><span />
  </section>;
  if (!available) return null;

  return <section className="station-monitoring" aria-labelledby="station-follow-up-heading">
    <div className="station-follow-up-heading">
      <h3 id="station-follow-up-heading">Perlu ditindaklanjuti</h3>
      <small>Ringkasan progres dan beban QC dari data yang sama.</small>
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
      <label>Jenis Stasiun
        <select value={filters.stationCategoryId} onChange={(event) => onChange({ ...filters, stationCategoryId: event.target.value, siteTypeId: "all" })}>
          <option value="all">Semua jenis stasiun</option>
          {stationCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <label>Tipe Site
        <select value={filters.siteTypeId} onChange={(event) => onChange({ ...filters, siteTypeId: event.target.value })}>
          <option value="all">Semua tipe site</option>
          {siteTypes.map((siteType) => <option key={siteType.id} value={siteType.id}>{siteType.name}</option>)}
        </select>
      </label>
      <label>Kondisi Pengisian
        <select value={filters.condition} onChange={(event) => onChange({ ...filters, condition: event.target.value as StationConditionFilter })}>
          <option value="all">Semua</option>
          <option value="not-started">Belum Dimulai</option>
          <option value="lt50">Terisi &lt;50%</option>
          <option value="50to99">Terisi 50-99%</option>
          <option value="complete">Lengkap</option>
          <option value="attention">Perlu Perhatian</option>
          <option value="not-assessed">Tidak Dinilai</option>
        </select>
      </label>
      <label>QC Produk
        <select value={filters.qc} onChange={(event) => onChange({ ...filters, qc: event.target.value as StationQcFilter })}>
          <option value="all">Semua</option>
          <option value="pending">Ada QC Pending</option>
          <option value="none">Tanpa QC Pending</option>
        </select>
      </label>
      <label>Urutkan
        <select value={filters.sort} onChange={(event) => onChange({ ...filters, sort: event.target.value as StationMonitoringSort })}>
          <option value="priority">Prioritas Pengisian</option>
          <option value="progress-asc">Progress Terendah</option>
          <option value="progress-desc">Progress Tertinggi</option>
          <option value="qc-desc">QC Pending Terbanyak</option>
          <option value="qc-asc">QC Pending Tersedikit</option>
          <option value="name-asc">Nama A-Z</option>
          <option value="name-desc">Nama Z-A</option>
        </select>
      </label>
      {hasStationMonitoringFilters(filters) && <button className="station-monitoring-reset" type="button" onClick={onReset}>Reset filter</button>}
    </div>
    <div className="station-qc-summary" aria-label="Ringkasan QC Produk">
      <div><strong>QC Produk</strong><span>{qcSummary.stationCount} Stasiun memiliki QC Pending | {qcSummary.totalPending} QC Pending</span></div>
      {qcSummary.totalPending > 0 && <button type="button" onClick={onQcPending}>Lihat QC Pending</button>}
    </div>
    <p className="station-monitoring-result" role="status">Menampilkan <strong>{visibleCount}</strong> dari <strong>{totalCount}</strong> Stasiun</p>
  </section>;
}
