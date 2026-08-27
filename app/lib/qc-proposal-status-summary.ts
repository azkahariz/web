import type { ProductProposalStatus } from "../types/inventory";

export type QcProposalStatusSummary = Record<Exclude<ProductProposalStatus, "PENDING_LOCAL">, number> & {
  total: number;
  other: number;
};

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function parseQcProposalStatusSummary(value: unknown): QcProposalStatusSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const pending = nonNegativeInteger(row.pending);
  const approved = nonNegativeInteger(row.approved);
  const merged = nonNegativeInteger(row.merged);
  const rejected = nonNegativeInteger(row.rejected);
  const other = nonNegativeInteger(row.other);
  const total = nonNegativeInteger(row.total);
  if (pending === null || approved === null || merged === null || rejected === null || other === null || total === null) return null;
  if (total !== pending + approved + merged + rejected + other) return null;
  return { PENDING: pending, APPROVED: approved, MERGED: merged, REJECTED: rejected, other, total };
}
