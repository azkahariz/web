"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import { useAppFeedback } from "../components/AppFeedback";
import { normalizeSubmissionPageSize, SUBMISSION_PAGE_SIZE, SUBMISSION_PAGE_SIZE_MAX, SUBMISSION_PAGE_SIZE_MIN, SUBMISSION_PAGE_SIZE_OPTIONS } from "../lib/submission-monitoring";

type Product = { id: string; brand: string; model: string; active: boolean; source_origin: string };
type Summary = { total_count: number; active_count: number; inactive_count: number };
type SortField = "brand" | "model";
type SortDirection = "asc" | "desc";
type ProductUsage = {
  rows: Array<{ stationName: string; siteName: string; siteTypeName: string; subtypeName: string; referenceCount: number }>;
  totalCount: number;
  stationCount: number;
  siteCount: number;
  referenceCount: number;
  page: number;
  pageSize: number;
};
type ProductUsageCount = { product_id: string; reference_count: number };

function originLabel(origin: string) {
  if (origin === "QC") return "QC Produk";
  if (origin === "ADMIN") return "Admin";
  return "Legacy Spreadsheet";
}

export default function AdminProducts({ onChanged }: { onChanged: () => void }) {
  const feedback = useAppFeedback();
  const [rows, setRows] = useState<Product[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(SUBMISSION_PAGE_SIZE);
  const [sortField, setSortField] = useState<SortField>("brand");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [productDialog, setProductDialog] = useState<{ mode: "create" | "edit"; productId?: string; brand: string; model: string } | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [dialogSubmitting, setDialogSubmitting] = useState(false);
  const [pageSizeEditing, setPageSizeEditing] = useState(false);
  const [pageSizeDraft, setPageSizeDraft] = useState(String(SUBMISSION_PAGE_SIZE));
  const pageSizeCancelRef = useRef(false);
  const [usageProduct, setUsageProduct] = useState<Product | null>(null);
  const [usage, setUsage] = useState<ProductUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [usageCountsLoading, setUsageCountsLoading] = useState(false);
  const usageCountsRequestRef = useRef(0);

  const loadUsageCounts = useCallback(async (products: Product[]) => {
    const requestId = ++usageCountsRequestRef.current;
    setUsageCountsLoading(products.length > 0);
    setUsageCounts({});
    if (!products.length) return;
    const params = new URLSearchParams();
    products.forEach((product) => params.append("usageCountProductId", product.id));
    try {
      const response = await fetch(`/api/admin/products?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as { usageCounts?: ProductUsageCount[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Jumlah penggunaan produk gagal dimuat.");
      if (requestId !== usageCountsRequestRef.current) return;
      setUsageCounts(Object.fromEntries((result.usageCounts ?? []).map((count) => [count.product_id, count.reference_count])));
    } catch (countError) {
      if (requestId === usageCountsRequestRef.current) feedback.toast(countError instanceof Error ? countError.message : "Jumlah penggunaan produk gagal dimuat.", "warning");
    } finally {
      if (requestId === usageCountsRequestRef.current) setUsageCountsLoading(false);
    }
  }, [feedback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: sortField, direction: sortDirection });
    if (search) params.set("search", search);
    try {
      const [listResponse, summaryResponse] = await Promise.all([
        fetch(`/api/admin/products?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/admin/products?summary=1", { cache: "no-store" }),
      ]);
      const list = await listResponse.json() as { rows?: Product[]; totalCount?: number; error?: string };
      const summaryResult = await summaryResponse.json() as { summary?: Summary; error?: string };
      if (!listResponse.ok) throw new Error(list.error || "Daftar produk gagal dimuat.");
      if (!summaryResponse.ok) throw new Error(summaryResult.error || "Ringkasan produk gagal dimuat.");
      setRows(list.rows ?? []);
      setTotalCount(list.totalCount ?? 0);
      setSummary(summaryResult.summary ?? null);
      void loadUsageCounts(list.rows ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Daftar produk gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [loadUsageCounts, page, pageSize, search, sortDirection, sortField]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const firstRow = totalCount ? (page - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(page * pageSize, totalCount);
  const sortValue = `${sortField}:${sortDirection}`;

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "Aksi produk gagal diproses.");
    await load();
    onChanged();
  }

  function openCreateDialog() {
    setDialogError("");
    setProductDialog({ mode: "create", brand: "", model: "" });
  }

  function openEditDialog(product: Product) {
    setDialogError("");
    setProductDialog({ mode: "edit", productId: product.id, brand: product.brand, model: product.model });
  }

  async function submitProductDialog() {
    if (!productDialog || dialogSubmitting) return;
    const brand = productDialog.brand.trim();
    const model = productDialog.model.trim();
    if (!brand || !model) {
      setDialogError("Merk dan Tipe wajib diisi.");
      return;
    }
    setDialogSubmitting(true);
    setDialogError("");
    try {
      setActiveAction(productDialog.mode === "create" ? "create" : `edit:${productDialog.productId}`);
      await post(productDialog.mode === "create"
        ? { action: "create", brand, model }
        : { action: "update", productId: productDialog.productId, brand, model });
      feedback.toast(productDialog.mode === "create" ? "Produk baru berhasil ditambahkan." : "Produk berhasil diperbarui.", "success");
      setProductDialog(null);
    } catch (actionError) {
      setDialogError(actionError instanceof Error ? actionError.message : "Aksi produk gagal diproses.");
    } finally {
      setDialogSubmitting(false);
      setActiveAction(null);
    }
  }

  async function setActive(product: Product) {
    const nextActive = !product.active;
    await feedback.confirmAction({
      title: `${nextActive ? "Aktifkan" : "Nonaktifkan"} produk?`,
      description: nextActive ? "Produk kembali tersedia untuk pemilihan baru." : "Produk tetap tersimpan untuk riwayat, tetapi tidak ditawarkan untuk pemilihan baru.",
      confirmLabel: nextActive ? "Aktifkan" : "Nonaktifkan",
      danger: !nextActive,
    }, async () => {
      try {
        setActiveAction(`active:${product.id}`);
        await post({ action: "set-active", productId: product.id, active: nextActive });
        feedback.toast(`Produk berhasil ${nextActive ? "diaktifkan" : "dinonaktifkan"}.`, "success");
        return true;
      } catch (actionError) {
        feedback.toast(actionError instanceof Error ? actionError.message : "Status produk gagal diperbarui.", "error");
        return false;
      } finally {
        setActiveAction(null);
      }
    });
  }

  async function loadUsage(product: Product, usagePage = 1) {
    setUsageLoading(true);
    setUsageError("");
    try {
      const params = new URLSearchParams({ usageProductId: product.id, page: String(usagePage), pageSize: "50" });
      const response = await fetch(`/api/admin/products?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as { usage?: ProductUsage; error?: string };
      if (!response.ok || !result.usage) throw new Error(result.error || "Penggunaan produk gagal dimuat.");
      setUsage(result.usage);
    } catch (usageLoadError) {
      setUsageError(usageLoadError instanceof Error ? usageLoadError.message : "Penggunaan produk gagal dimuat.");
    } finally {
      setUsageLoading(false);
    }
  }

  function openUsage(product: Product) {
    setUsageProduct(product);
    setUsage(null);
    void loadUsage(product);
  }

  function applyPageSize(value: string | number) {
    if (pageSizeCancelRef.current) {
      pageSizeCancelRef.current = false;
      return;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < SUBMISSION_PAGE_SIZE_MIN || parsed > SUBMISSION_PAGE_SIZE_MAX) {
      setPageSizeDraft(String(pageSize));
      setPageSizeEditing(false);
      feedback.toast("Baris per halaman harus 10-1000.", "warning");
      return;
    }
    setPageSize(normalizeSubmissionPageSize(parsed));
    setPageSizeDraft(String(parsed));
    setPage(1);
    setPageSizeEditing(false);
  }

  const compactSummary = useMemo(() => [
    ["Total", summary?.total_count ?? 0],
    ["Aktif", summary?.active_count ?? 0],
    ["Nonaktif", summary?.inactive_count ?? 0],
  ], [summary]);

  return <section className="product-admin" aria-label="Pengelolaan produk">
    <p className="admin-page-description">Kelola master Merk dan Tipe produk.</p>
    <div className="product-summary-grid">
      {compactSummary.map(([label, count]) => <div key={String(label)}><span>{label}</span><strong>{count}</strong></div>)}
    </div>
    <div className="product-toolbar">
      <label className="admin-search">Cari Merk atau Tipe<input autoComplete="off" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari Merk atau Tipe" /></label>
      <label className="product-sort">Urutkan<select value={sortValue} onChange={(event) => {
        const [field, direction] = event.target.value.split(":") as [SortField, SortDirection];
        setSortField(field); setSortDirection(direction); setPage(1);
      }}><option value="brand:asc">Merk A-Z</option><option value="brand:desc">Merk Z-A</option><option value="model:asc">Tipe A-Z</option><option value="model:desc">Tipe Z-A</option></select></label>
      <AsyncButton className="primary-button" loading={activeAction === "create"} loadingText="Menambah..." onClick={openCreateDialog}>Tambah Produk</AsyncButton>
      <AsyncButton className="secondary-button" loading={loading} loadingText="Memuat..." onClick={() => void load()}>Muat ulang</AsyncButton>
    </div>
    {error && <p className="admin-message" role="status">{error}</p>}
    <div className={`admin-table-wrap product-table${loading ? " is-loading" : ""}`}><table><thead><tr><th>Merk</th><th>Tipe</th><th>Status</th><th>Sumber</th><th>Penggunaan</th><th>Aksi</th></tr></thead><tbody>
      {rows.map((product) => <tr key={product.id}><td><strong>{product.brand}</strong></td><td>{product.model}</td><td><span className={`status-pill ${product.active ? "active" : "inactive"}`}>{product.active ? "Aktif" : "Nonaktif"}</span></td><td>{originLabel(product.source_origin)}</td><td><button className="usage-link" type="button" onClick={() => openUsage(product)}>{usageCountsLoading && usageCounts[product.id] === undefined ? "-" : `${usageCounts[product.id] ?? 0} referensi`}</button></td><td className="table-actions"><AsyncButton loading={activeAction === `edit:${product.id}`} loadingText="Menyimpan..." onClick={() => openEditDialog(product)}>Edit</AsyncButton><AsyncButton className={product.active ? "danger-inline" : undefined} loading={activeAction === `active:${product.id}`} loadingText="Menyimpan..." onClick={() => void setActive(product)}>{product.active ? "Nonaktifkan" : "Aktifkan"}</AsyncButton></td></tr>)}
      {!rows.length && <tr><td colSpan={6}>{loading ? "Memuat produk..." : "Produk tidak ditemukan."}</td></tr>}
    </tbody></table></div>
    <div className="submission-pagination" aria-label="Pagination produk">
      <label className="page-size-control">Baris per halaman:
        {pageSizeEditing ? <input autoFocus type="number" min={SUBMISSION_PAGE_SIZE_MIN} max={SUBMISSION_PAGE_SIZE_MAX} value={pageSizeDraft} onChange={(event) => setPageSizeDraft(event.target.value)} onBlur={() => applyPageSize(pageSizeDraft)} onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); applyPageSize(pageSizeDraft); }
          if (event.key === "Escape") { pageSizeCancelRef.current = true; setPageSizeDraft(String(pageSize)); setPageSizeEditing(false); }
        }} /> : <select aria-label="Baris per halaman" value={String(pageSize)} onDoubleClick={() => setPageSizeEditing(true)} onChange={(event) => {
          if (event.target.value === "custom") setPageSizeEditing(true);
          else applyPageSize(event.target.value);
        }}>
          {SUBMISSION_PAGE_SIZE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
          {!SUBMISSION_PAGE_SIZE_OPTIONS.includes(pageSize as (typeof SUBMISSION_PAGE_SIZE_OPTIONS)[number]) && <option value={pageSize}>{pageSize}</option>}
          <option value="custom">Custom...</option>
        </select>}
      </label>
      <span>Menampilkan {firstRow}-{lastRow} dari {totalCount}</span>
      <div className="pagination-buttons"><button disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Sebelumnya</button><span>Halaman {page} dari {pageCount}</span><button disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>Berikutnya</button></div>
    </div>
    {productDialog && <div className="app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !dialogSubmitting) setProductDialog(null); }}>
      <form className="app-dialog product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" onSubmit={(event) => { event.preventDefault(); void submitProductDialog(); }}>
        <h2 id="product-dialog-title">{productDialog.mode === "create" ? "Tambah Produk" : "Edit Produk"}</h2>
        <label>Merk<input autoFocus autoComplete="off" value={productDialog.brand} onChange={(event) => { setProductDialog((current) => current ? { ...current, brand: event.target.value } : current); setDialogError(""); }} placeholder="Masukkan merk" /></label>
        <label>Tipe<input autoComplete="off" value={productDialog.model} onChange={(event) => { setProductDialog((current) => current ? { ...current, model: event.target.value } : current); setDialogError(""); }} placeholder="Masukkan tipe" /></label>
        {dialogError && <p className="app-dialog-error" role="alert">{dialogError}</p>}
        <div className="app-dialog-actions"><button className="secondary-button" type="button" disabled={dialogSubmitting} onClick={() => setProductDialog(null)}>Batal</button><AsyncButton className="primary-button" type="submit" loading={dialogSubmitting} loadingText="Menyimpan...">{productDialog.mode === "create" ? "Tambah Produk" : "Simpan Perubahan"}</AsyncButton></div>
      </form>
    </div>}
    {usageProduct && <div className="app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setUsageProduct(null); }}>
      <section className="app-dialog product-usage-dialog" role="dialog" aria-modal="true" aria-labelledby="product-usage-title">
        <h2 id="product-usage-title">Penggunaan Produk</h2>
        <p className="product-usage-name"><strong>{usageProduct.brand}</strong><span>{usageProduct.model}</span></p>
        <div className="product-usage-content" aria-busy={usageLoading}>
          {usageLoading && !usage && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memuat penggunaan...</p>}
          {usageError && <p className="app-dialog-error" role="alert">{usageError}</p>}
          {usage && <>
          <p className="product-usage-summary">{usage.stationCount} Stasiun · {usage.siteCount} Site · {usage.referenceCount} referensi</p>
          <div className="product-usage-list">
            {usage.rows.map((row) => <div key={`${row.stationName}:${row.siteName}:${row.subtypeName}`}><strong>{row.stationName}</strong><span>{row.siteName} · {row.siteTypeName} · {row.subtypeName}</span><small>{row.referenceCount} referensi</small></div>)}
            {!usage.rows.length && <p>Produk ini belum memiliki penggunaan pada submission aktif.</p>}
          </div>
          {usage.totalCount > usage.pageSize && <div className="pagination-buttons product-usage-pagination"><button disabled={usage.page <= 1 || usageLoading} onClick={() => void loadUsage(usageProduct, usage.page - 1)}>Sebelumnya</button><span>Halaman {usage.page} dari {Math.ceil(usage.totalCount / usage.pageSize)}</span><button disabled={usage.page >= Math.ceil(usage.totalCount / usage.pageSize) || usageLoading} onClick={() => void loadUsage(usageProduct, usage.page + 1)}>Berikutnya</button></div>}
          </>}
        </div>
        <div className="app-dialog-actions"><button className="secondary-button" type="button" onClick={() => setUsageProduct(null)}>Tutup</button></div>
      </section>
    </div>}
  </section>;
}
