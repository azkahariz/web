export type SelectableProductReference = {
  referenceType?: "DIRECT" | "QC_RESULT";
  referenceId?: string;
  submissionId: string;
  expectedSubmissionVersion: number;
  itemId: string | null;
  archivedAt: string | null;
  activeLock: boolean;
};

export function productReferenceSelectionKey(reference: Pick<SelectableProductReference, "submissionId" | "expectedSubmissionVersion" | "itemId" | "referenceId">) {
  if (reference.referenceId) return reference.referenceId;
  return `${reference.submissionId}:${reference.expectedSubmissionVersion}:${reference.itemId ?? ""}`;
}

export function isProductReferenceSelectable(reference: SelectableProductReference) {
  if (reference.referenceType === "QC_RESULT") return !reference.activeLock;
  return Boolean(reference.itemId && !reference.archivedAt && !reference.activeLock);
}

export function getCurrentPageSelectionState<T extends SelectableProductReference>(rows: readonly T[], selected: ReadonlyMap<string, T>) {
  const eligibleRows = rows.filter(isProductReferenceSelectable);
  const selectedCount = eligibleRows.filter((row) => selected.has(productReferenceSelectionKey(row))).length;

  return {
    eligibleCount: eligibleRows.length,
    selectedCount,
    checked: eligibleRows.length > 0 && selectedCount === eligibleRows.length,
    indeterminate: selectedCount > 0 && selectedCount < eligibleRows.length,
    disabled: eligibleRows.length === 0,
  };
}

export function toggleCurrentPageSelection<T extends SelectableProductReference>(rows: readonly T[], selected: ReadonlyMap<string, T>) {
  const next = new Map(selected);
  const eligibleRows = rows.filter(isProductReferenceSelectable);
  const allSelected = eligibleRows.length > 0 && eligibleRows.every((row) => next.has(productReferenceSelectionKey(row)));

  for (const row of eligibleRows) {
    const key = productReferenceSelectionKey(row);
    if (allSelected) next.delete(key);
    else next.set(key, row);
  }

  return next;
}

export function clearProductReferenceSelection<T extends SelectableProductReference>() {
  return new Map<string, T>();
}
