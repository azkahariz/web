export const PRODUCT_PICKER_PAGE_SIZE = 100;
export const PRODUCT_CATALOG_BATCH_SIZE = 1000;

export async function loadAllProductCatalogRows<T, TError>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: TError | null }>,
  batchSize = PRODUCT_CATALOG_BATCH_SIZE,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += batchSize) {
    const result = await loadPage(from, from + batchSize - 1);
    if (result.error) return { data: null, error: result.error };
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < batchSize) return { data: rows, error: null };
  }
}
