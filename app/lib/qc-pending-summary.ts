export type QcPendingSummary = {
  totalPending: number;
  pendingPengisian: number;
  pendingGudang: number;
  pendingTidakDigunakan: number;
};

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function parseQcPendingSummary(value: unknown): QcPendingSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const totalPending = nonNegativeInteger(row.total_pending);
  const pendingPengisian = nonNegativeInteger(row.pending_pengisian);
  const pendingGudang = nonNegativeInteger(row.pending_gudang);
  const pendingTidakDigunakan = nonNegativeInteger(row.pending_tidak_digunakan);
  if (totalPending === null || pendingPengisian === null || pendingGudang === null || pendingTidakDigunakan === null) return null;
  if (totalPending !== pendingPengisian + pendingGudang + pendingTidakDigunakan) return null;
  return { totalPending, pendingPengisian, pendingGudang, pendingTidakDigunakan };
}
