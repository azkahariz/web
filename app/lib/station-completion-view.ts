import type {
  StationCompletionDetailResponse,
  StationCompletionDetailRow,
  StationCompletionRowStatus,
  StationCompletionSummary,
} from "./station-completion";

const STATUS_LABELS: Record<StationCompletionRowStatus, string> = {
  LENGKAP: "Lengkap",
  TERISI_SEBAGIAN: "Terisi Sebagian",
  BELUM_DIMULAI: "Belum Dimulai",
  PERLU_PERHATIAN: "Perlu Perhatian",
  KOSONG: "Kosong",
  GUDANG_TERSEDIA: "Gudang Tersedia",
};

const DETAIL_STATUS_ORDER = new Map<StationCompletionRowStatus, number>([
  ["PERLU_PERHATIAN", 0],
  ["BELUM_DIMULAI", 1],
  ["KOSONG", 2],
  ["TERISI_SEBAGIAN", 3],
  ["GUDANG_TERSEDIA", 4],
  ["LENGKAP", 5],
]);

export function stationCompletionStatusLabel(status: string) {
  return STATUS_LABELS[status as StationCompletionRowStatus] ?? "Status tidak dikenal";
}

export function stationCompletionStatusClass(status: string) {
  return STATUS_LABELS[status as StationCompletionRowStatus]
    ? status.toLocaleLowerCase("id-ID").replaceAll("_", "-")
    : "unknown";
}

export function stationCompletionIncompleteRows(rows: StationCompletionDetailRow[]) {
  return rows.map((row, index) => ({ row, index }))
    .filter(({ row }) => row.status !== "LENGKAP" && row.status !== "GUDANG_TERSEDIA")
    .sort((left, right) => (
      (DETAIL_STATUS_ORDER.get(left.row.status) ?? Number.MAX_SAFE_INTEGER)
      - (DETAIL_STATUS_ORDER.get(right.row.status) ?? Number.MAX_SAFE_INTEGER)
      || left.index - right.index
    ))
    .map(({ row }) => row);
}

export function stationCompletionDetailKey(row: StationCompletionDetailRow) {
  return `${row.site_id ?? "no-site"}:${row.site_subtype_id ?? "no-subtype"}:${row.submission_id ?? "no-submission"}`;
}

export function stationCompletionDetailResponse(value: unknown): StationCompletionDetailResponse | null {
  if (!value || typeof value !== "object") return null;
  const detail = value as Partial<StationCompletionDetailResponse>;
  if (typeof detail.station_id !== "string" || !detail.summary || !Array.isArray(detail.rows)) return null;
  return detail as StationCompletionDetailResponse;
}

export function stationCompletionCategory(summary: Pick<StationCompletionSummary,
  "expected_category_count" | "filled_category_count" | "category_progress"
  | "warehouse_expected_count" | "warehouse_existing_count"
  | "warehouse_category_count" | "warehouse_unit_count"
>) {
  if (summary.expected_category_count === 0 || summary.category_progress === null) {
    const warehouseOnly = summary.warehouse_expected_count > 0
      && summary.warehouse_existing_count === summary.warehouse_expected_count;
    return {
      label: warehouseOnly
        ? `Gudang · ${summary.warehouse_category_count} kategori · ${summary.warehouse_unit_count} unit`
        : "Kategori: -",
      progress: null,
    };
  }

  return {
    label: `${summary.filled_category_count} / ${summary.expected_category_count} Kategori`,
    progress: summary.category_progress,
  };
}

export function stationCompletionRows(value: unknown): StationCompletionSummary[] {
  if (!value || typeof value !== "object" || !("rows" in value)) return [];
  const rows = (value as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is StationCompletionSummary => Boolean(
    row
    && typeof row === "object"
    && "station_id" in row
    && typeof row.station_id === "string",
  ));
}
