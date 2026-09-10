export const UPT_DATA_ENTRY_CLOSED_CODE = "42501";
export const UPT_DATA_ENTRY_CLOSED_ERROR = "upt_data_entry_closed";
export const UPT_DATA_ENTRY_CLOSED_TITLE = "Pengisian data telah ditutup oleh Super Admin.";
export const UPT_DATA_ENTRY_CLOSED_DESCRIPTION = "Periode pengisian telah selesai. Form pengisian tidak dapat diakses.";

export type UptDataEntryStatus = {
  enabled: boolean;
  updatedAt: string;
};

export function isUptDataEntryClosedError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === UPT_DATA_ENTRY_CLOSED_CODE
    && error.message?.includes(UPT_DATA_ENTRY_CLOSED_ERROR) === true;
}

export function parseUptDataEntryStatus(value: unknown): UptDataEntryStatus | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as { enabled?: unknown; updated_at?: unknown };
  if (typeof candidate.enabled !== "boolean" || typeof candidate.updated_at !== "string") return null;
  return { enabled: candidate.enabled, updatedAt: candidate.updated_at };
}
