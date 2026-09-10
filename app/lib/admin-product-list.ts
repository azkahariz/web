export type AdminProductStatusFilter = "active" | "inactive" | "merged" | "all";
export type AdminProductSortField = "brand" | "model" | "status" | "source" | "usage";
export type AdminProductSortDirection = "asc" | "desc";
export const PRODUCT_USAGE_COUNT_BATCH_SIZE = 500;

export type ProductUsageCountRow = {
  product_id: string;
  reference_count: number;
};

export type ProductReferenceCategoryRow = {
  product_id: string;
  categories: string[];
};

export type ProductPageEnrichmentRow = ProductUsageCountRow & ProductReferenceCategoryRow;

export type AdminProductListRow = {
  id: string;
  brand: string;
  model: string;
  active: boolean;
  source_origin: string;
  merged_into_product_id?: string | null;
  usage_count?: number | null;
  categories?: string[] | null;
};

const collator = new Intl.Collator("id", { sensitivity: "base", numeric: true });

export async function loadProductUsageCountsInBatches<TError>(
  productIds: string[],
  loadBatch: (productIds: string[]) => PromiseLike<{ data: ProductUsageCountRow[] | null; error: TError | null }>,
  batchSize = PRODUCT_USAGE_COUNT_BATCH_SIZE,
) {
  const uniqueIds = [...new Set(productIds)];
  const rows: ProductUsageCountRow[] = [];
  for (let from = 0; from < uniqueIds.length; from += batchSize) {
    const result = await loadBatch(uniqueIds.slice(from, from + batchSize));
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
  }
  return { data: rows, error: null };
}

export function normalizeProductReferenceCategories(categories: string[]) {
  return [...new Set(categories.map((category) => category.trim()).filter(Boolean))]
    .sort((left, right) => collator.compare(left, right) || left.localeCompare(right));
}

export function enrichAdminProductPage(
  products: AdminProductListRow[],
  usageCounts: ProductUsageCountRow[],
  referenceCategories: ProductReferenceCategoryRow[],
  { preserveUsage = false, usageUnavailable = false, categoriesUnavailable = false } = {},
) {
  const usageById = new Map(usageCounts.map((row) => [row.product_id, row.reference_count]));
  const categoriesById = new Map(referenceCategories.map((row) => [row.product_id, row.categories]));
  return products.map((product) => ({
    ...product,
    usage_count: preserveUsage ? product.usage_count ?? 0 : usageUnavailable ? null : usageById.get(product.id) ?? 0,
    categories: categoriesUnavailable ? null : categoriesById.get(product.id) ?? [],
  }));
}

export async function loadProductReferenceCategoriesInBatches<TError>(
  productIds: string[],
  loadBatch: (productIds: string[]) => PromiseLike<{ data: ProductReferenceCategoryRow[] | null; error: TError | null }>,
  batchSize = PRODUCT_USAGE_COUNT_BATCH_SIZE,
) {
  const uniqueIds = [...new Set(productIds)];
  const rows: ProductReferenceCategoryRow[] = [];
  for (let from = 0; from < uniqueIds.length; from += batchSize) {
    const result = await loadBatch(uniqueIds.slice(from, from + batchSize));
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []).map((row) => ({
      ...row,
      categories: normalizeProductReferenceCategories(row.categories ?? []),
    })));
  }
  return { data: rows, error: null };
}

export async function loadProductPageEnrichmentInBatches<TError>(
  productIds: string[],
  loadBatch: (productIds: string[]) => PromiseLike<{ data: ProductPageEnrichmentRow[] | null; error: TError | null }>,
  batchSize = PRODUCT_USAGE_COUNT_BATCH_SIZE,
) {
  const uniqueIds = [...new Set(productIds)];
  const rows: ProductPageEnrichmentRow[] = [];
  for (let from = 0; from < uniqueIds.length; from += batchSize) {
    const result = await loadBatch(uniqueIds.slice(from, from + batchSize));
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []).map((row) => ({
      ...row,
      categories: normalizeProductReferenceCategories(row.categories ?? []),
    })));
  }
  return { data: rows, error: null };
}

export function productSourceLabel(origin: string) {
  if (origin === "QC") return "QC Produk";
  if (origin === "ADMIN") return "Admin";
  if (origin === "SPREADSHEET") return "Legacy Spreadsheet";
  return origin;
}

export function productStatusLabel(product: Pick<AdminProductListRow, "active" | "merged_into_product_id">) {
  if (product.merged_into_product_id) return "Digabungkan";
  return product.active ? "Aktif" : "Nonaktif";
}

export function normalizeProductStatusFilter(value: string | null): AdminProductStatusFilter {
  return value === "inactive" || value === "merged" || value === "all" ? value : "active";
}

export function normalizeProductSortField(value: string | null): AdminProductSortField {
  return value === "model" || value === "status" || value === "source" || value === "usage" ? value : "brand";
}

export function normalizeProductSortDirection(value: string | null): AdminProductSortDirection {
  return value === "desc" ? "desc" : "asc";
}

export function matchesProductStatus(product: AdminProductListRow, status: AdminProductStatusFilter) {
  if (status === "all") return true;
  if (status === "merged") return Boolean(product.merged_into_product_id);
  if (status === "inactive") return !product.active && !product.merged_into_product_id;
  return product.active && !product.merged_into_product_id;
}

export function filterAdminProducts(
  products: AdminProductListRow[],
  { search = "", status = "active", source = "" }: { search?: string; status?: AdminProductStatusFilter; source?: string } = {},
) {
  const normalizedSearch = search.trim().toLocaleLowerCase("id");
  return products.filter((product) => {
    if (!matchesProductStatus(product, status)) return false;
    if (source && product.source_origin !== source) return false;
    if (!normalizedSearch) return true;
    return `${product.brand} ${product.model}`.toLocaleLowerCase("id").includes(normalizedSearch);
  });
}

export function sortAdminProducts(
  products: AdminProductListRow[],
  field: AdminProductSortField = "brand",
  direction: AdminProductSortDirection = "asc",
) {
  const factor = direction === "desc" ? -1 : 1;
  return [...products].sort((left, right) => {
    const compared = field === "usage"
      ? (left.usage_count ?? 0) - (right.usage_count ?? 0)
      : field === "status"
        ? collator.compare(productStatusLabel(left), productStatusLabel(right))
        : field === "source"
          ? collator.compare(productSourceLabel(left.source_origin), productSourceLabel(right.source_origin))
          : collator.compare(field === "model" ? left.model : left.brand, field === "model" ? right.model : right.brand);
    if (compared !== 0) return compared * factor;

    const brandCompared = collator.compare(left.brand, right.brand);
    if (brandCompared !== 0) return brandCompared;
    const modelCompared = collator.compare(left.model, right.model);
    if (modelCompared !== 0) return modelCompared;
    return left.id.localeCompare(right.id);
  });
}

export function prepareAdminProductPage(
  products: AdminProductListRow[],
  options: {
    search?: string;
    status?: AdminProductStatusFilter;
    source?: string;
    sort?: AdminProductSortField;
    direction?: AdminProductSortDirection;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? 50);
  const filtered = filterAdminProducts(products, options);
  const sorted = sortAdminProducts(filtered, options.sort, options.direction);
  const start = (page - 1) * pageSize;
  return {
    rows: sorted.slice(start, start + pageSize),
    totalCount: sorted.length,
    page,
    pageSize,
  };
}
