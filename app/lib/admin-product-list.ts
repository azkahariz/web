export type AdminProductStatusFilter = "active" | "inactive" | "merged" | "all";
export type AdminProductSortField = "brand" | "model" | "status" | "source" | "usage";
export type AdminProductSortDirection = "asc" | "desc";

export type AdminProductListRow = {
  id: string;
  brand: string;
  model: string;
  active: boolean;
  source_origin: string;
  merged_into_product_id?: string | null;
  usage_count?: number;
};

const collator = new Intl.Collator("id", { sensitivity: "base", numeric: true });

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
