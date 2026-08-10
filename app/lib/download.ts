export function csvCell(value: string | number | null | undefined) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function sanitizeFilenamePart(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("id-ID")
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "");
}

export function buildAloptamaFilename(
  station: string | null | undefined,
  site: string | null | undefined,
  subtype: string | null | undefined,
  extension: "csv" | "json",
) {
  const stationPart = sanitizeFilenamePart(station);
  const sitePart = sanitizeFilenamePart(site);
  const subtypePart = sanitizeFilenamePart(subtype);
  if (!stationPart || !sitePart || !subtypePart) return `aloptama-data.${extension}`;
  return `${stationPart}-${sitePart}_${subtypePart}.${extension}`;
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
