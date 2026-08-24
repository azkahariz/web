import type { StationCompletionStatus, StationCompletionSummary } from "./station-completion";

const STATUS_LABELS: Record<StationCompletionStatus, string> = {
  LENGKAP: "Lengkap",
  TERISI_SEBAGIAN: "Terisi Sebagian",
  BELUM_DIMULAI: "Belum Dimulai",
  PERLU_PERHATIAN: "Perlu Perhatian",
};

export function stationCompletionStatusLabel(status: string) {
  return STATUS_LABELS[status as StationCompletionStatus] ?? "Status tidak dikenal";
}

export function stationCompletionStatusClass(status: string) {
  return STATUS_LABELS[status as StationCompletionStatus]
    ? status.toLocaleLowerCase("id-ID").replaceAll("_", "-")
    : "unknown";
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
