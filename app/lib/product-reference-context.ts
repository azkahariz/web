type ProductReferenceContext = {
  siteName?: string | null;
  siteTypeName?: string | null;
  siteSubtypeName?: string | null;
  categories?: readonly string[] | null;
};

export function referenceCategorySummary(categories: readonly string[] | null | undefined, limit = 3) {
  const unique = Array.from(new Set((categories ?? [])
    .filter((category): category is string => typeof category === "string")
    .map((category) => category.trim())
    .filter(Boolean)));
  if (unique.length <= limit) return unique.join(", ");
  return `${unique.slice(0, limit).join(", ")} +${unique.length - limit} lainnya`;
}

export function formatReferenceContext(context: ProductReferenceContext) {
  return [
    context.siteName?.trim(),
    context.siteTypeName?.trim(),
    context.siteSubtypeName?.trim(),
    referenceCategorySummary(context.categories),
  ].filter(Boolean).join(" \u00b7 ");
}
