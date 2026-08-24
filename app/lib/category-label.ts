const CATEGORY_DISPLAY_LABELS: Record<string, string> = {
  "SIstem Catu Daya Tidak Terputus": "Sistem Catu Daya Tidak Terputus",
};

export function formatCategoryLabel(name: string) {
  return CATEGORY_DISPLAY_LABELS[name] ?? name;
}
