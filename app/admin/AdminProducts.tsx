"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import { useAppFeedback } from "../components/AppFeedback";
import {
  productSourceLabel,
  type AdminProductSortDirection,
  type AdminProductSortField,
  type AdminProductStatusFilter,
} from "../lib/admin-product-list";
import { clearProductReferenceSelection, getCurrentPageSelectionState, isProductReferenceSelectable, productReferenceSelectionKey, toggleCurrentPageSelection } from "../lib/product-reference-selection";
import { normalizeSubmissionPageSize, SUBMISSION_PAGE_SIZE, SUBMISSION_PAGE_SIZE_MAX, SUBMISSION_PAGE_SIZE_MIN, SUBMISSION_PAGE_SIZE_OPTIONS } from "../lib/submission-monitoring";
import ProductReferenceMoveDialog, { type MoveReferenceIdentity } from "./ProductReferenceMoveDialog";
import ProductMergeDialog from "./ProductMergeDialog";
import ProductDeleteDialog from "./ProductDeleteDialog";

type Product = { id: string; brand: string; model: string; active: boolean; source_origin: string; usage_count: number; merged_into_product_id?: string; merged_target?: { id: string; brand: string; model: string } };
type Summary = { total_count: number; active_count: number; inactive_count: number };
type ProductUsage = {
  rows: Array<{ stationName: string; siteName: string; siteTypeName: string; subtypeName: string; referenceCount: number }>;
  totalCount: number;
  stationCount: number;
  siteCount: number;
  referenceCount: number;
  page: number;
  pageSize: number;
};
type ProductDependencies = {
  product: { id: string; brand: string; model: string; active: boolean; sourceOrigin: string; mergedIntoProduct?: { id: string; brand: string; model: string; active: boolean } | null };
  preflight: {
    currentDirectReferenceCount: number;
    currentSiteCount: number;
    currentSubmissionCount: number;
    archivedDirectReferenceCount: number;
    resolvedQcProposalCount: number;
    approvedQcCount: number;
    mergedQcCount: number;
    aliasCount: number;
    activeLockCount: number;
  };
  qcProposals: Array<{ proposalId: string; proposedBrand: string; proposedModel: string; status: "APPROVED" | "MERGED"; reviewerName: string | null; reviewedAt: string | null; reviewNote: string | null }>;
  aliases: Array<{ aliasId: string; brand: string; model: string; sourceProposalId: string | null }>;
};
type ProductReference = {
  submissionId: string;
  expectedSubmissionVersion: number;
  stationName: string;
  siteName: string;
  siteTypeName: string;
  siteSubtypeName: string;
  categoryName: string;
  functionCategories: string[];
  itemId: string | null;
  unitCount: number;
  archivedAt: string | null;
  activeLock: boolean;
  lockOwnerDisplayName: string | null;
};
type ProductReferences = { rows: ProductReference[]; totalCount: number; page: number; pageSize: number };
type DependencyTab = "summary" | "references" | "qc" | "aliases";
type DependencyPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  label: string;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
};

function DependencyPagination({ page, pageSize, total, loading, label, onPage, onPageSize }: DependencyPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  return <>
    <div className="product-reference-toolbar">
      <span>Menampilkan {first}–{last} dari {total} {label}</span>
      <label>Baris<select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option></select></label>
    </div>
    {pages > 1 && <div className="pagination-buttons product-usage-pagination" aria-label={`Navigasi halaman ${label}`}><button type="button" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>← Sebelumnya</button><span>Halaman {page} dari {pages}</span><button type="button" disabled={page >= pages || loading} onClick={() => onPage(page + 1)}>Berikutnya →</button></div>}
  </>;
}

function CurrentPageReferenceCheckbox({ checked, indeterminate, disabled, onChange }: { checked: boolean; indeterminate: boolean; disabled: boolean; onChange: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = disabled ? "Tidak ada referensi yang dapat dipilih di halaman ini" : checked ? "Batalkan pilihan referensi di halaman ini" : "Pilih semua referensi di halaman ini";
  const visibleLabel = disabled ? "Tidak ada referensi yang dapat dipilih di halaman ini" : "Pilih semua di halaman ini";

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return <label className="product-reference-check product-reference-check-all" title={label}>
    <input ref={inputRef} type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={onChange} />
    <span>{visibleLabel}</span>
  </label>;
}

export default function AdminProducts({ onChanged }: { onChanged: () => Promise<void> }) {
  const feedback = useAppFeedback();
  const [rows, setRows] = useState<Product[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(SUBMISSION_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<AdminProductStatusFilter>("active");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [sortField, setSortField] = useState<AdminProductSortField>("brand");
  const [sortDirection, setSortDirection] = useState<AdminProductSortDirection>("asc");
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
  const [dependencies, setDependencies] = useState<ProductDependencies | null>(null);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);
  const [dependenciesError, setDependenciesError] = useState("");
  const [dependencyTab, setDependencyTab] = useState<DependencyTab>("summary");
  const [references, setReferences] = useState<ProductReferences | null>(null);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [referencePageSize, setReferencePageSize] = useState(50);
  const [dependencyPage, setDependencyPage] = useState(1);
  const [dependencyPageSize, setDependencyPageSize] = useState(50);
  const [selectedReferences, setSelectedReferences] = useState<Map<string, ProductReference>>(new Map());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [mergeProduct, setMergeProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSourceOptions() {
      try {
        const response = await fetch("/api/admin/products?sources=1", { cache: "no-store", signal: controller.signal });
        const result = await response.json() as { sources?: string[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Pilihan sumber produk gagal dimuat.");
        setSourceOptions(result.sources ?? []);
      } catch (sourceError) {
        if (sourceError instanceof DOMException && sourceError.name === "AbortError") return;
        setError(sourceError instanceof Error ? sourceError.message : "Pilihan sumber produk gagal dimuat.");
      }
    }
    void loadSourceOptions();
    return () => controller.abort();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      status: statusFilter,
      sort: sortField,
      direction: sortDirection,
    });
    if (search) params.set("search", search);
    if (sourceFilter) params.set("source", sourceFilter);
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
      const nextTotalCount = list.totalCount ?? 0;
      setTotalCount(nextTotalCount);
      setPage((current) => Math.min(current, Math.max(1, Math.ceil(nextTotalCount / pageSize))));
      setSummary(summaryResult.summary ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Daftar produk gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortDirection, sortField, sourceFilter, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const firstRow = totalCount ? (page - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(page * pageSize, totalCount);

  function changeSort(field: AdminProductSortField) {
    setPage(1);
    if (sortField === field) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "Aksi produk gagal diproses.");
    await load();
    await onChanged();
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

  async function loadUsage(product: Product, usagePage = 1, usagePageSize = dependencyPageSize) {
    setUsageLoading(true);
    setUsageError("");
    try {
      const params = new URLSearchParams({ usageProductId: product.id, page: String(usagePage), pageSize: String(usagePageSize) });
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

  async function loadDependencies(product: Product) {
    setDependenciesLoading(true);
    setDependenciesError("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}/dependencies`, { cache: "no-store" });
      const result = await response.json() as { dependencies?: ProductDependencies; error?: string };
      if (!response.ok || !result.dependencies) throw new Error(result.error || "Dependency produk gagal dimuat.");
      setDependencies(result.dependencies);
    } catch (dependencyError) {
      setDependenciesError(dependencyError instanceof Error ? dependencyError.message : "Dependency produk gagal dimuat.");
    } finally {
      setDependenciesLoading(false);
    }
  }

  async function loadReferences(product: Product, referencePage = 1, nextPageSize = referencePageSize) {
    setReferencesLoading(true);
    try {
      const params = new URLSearchParams({ page: String(referencePage), pageSize: String(nextPageSize) });
      const response = await fetch(`/api/admin/products/${product.id}/references?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as { references?: ProductReferences; error?: string };
      if (!response.ok || !result.references) throw new Error(result.error || "Referensi produk gagal dimuat.");
      setReferences(result.references);
    } catch (referenceError) {
      setDependenciesError(referenceError instanceof Error ? referenceError.message : "Referensi produk gagal dimuat.");
    } finally {
      setReferencesLoading(false);
    }
  }

  function openUsage(product: Product, initialTab: DependencyTab = "summary") {
    setUsageProduct(product);
    setUsage(null);
    setDependencies(null);
    setDependenciesError("");
    setReferences(null);
    setDependencyTab(initialTab);
    setReferencePageSize(50);
    setDependencyPage(1);
    setDependencyPageSize(50);
    setSelectedReferences(new Map());
    setMoveDialogOpen(false);
    void loadUsage(product);
    void loadDependencies(product);
    if (initialTab === "references") void loadReferences(product, 1, 50);
  }

  function selectDependencyTab(tab: DependencyTab) {
    setDependencyTab(tab);
    if (tab === "references" && usageProduct && !references && !referencesLoading) void loadReferences(usageProduct, 1);
  }

  function changeDependencyPageSize(nextPageSize: number) {
    setDependencyPageSize(nextPageSize);
    setDependencyPage(1);
    if (usageProduct) void loadUsage(usageProduct, 1, nextPageSize);
  }

  function toggleReference(reference: ProductReference) {
    const key = productReferenceSelectionKey(reference);
    setSelectedReferences((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, reference);
      return next;
    });
  }

  const referencePageSelection = useMemo(
    () => getCurrentPageSelectionState(references?.rows ?? [], selectedReferences),
    [references, selectedReferences],
  );

  async function completeReferenceMove() {
    if (!usageProduct) return;
    setSelectedReferences(new Map());
    setMoveDialogOpen(false);
    setReferencePageSize(50);
    await Promise.all([loadReferences(usageProduct, 1, 50), loadDependencies(usageProduct), loadUsage(usageProduct, 1, dependencyPageSize), load(), onChanged()]);
  }

  async function completeProductMerge() {
    setMergeProduct(null);
    setUsageProduct(null);
    await Promise.all([load(), onChanged()]);
  }

  async function completeProductDelete() {
    setDeleteProduct(null);
    await Promise.all([load(), onChanged()]);
  }

  function inspectDeleteBlockers(product: Product, tab: DependencyTab) {
    setDeleteProduct(null);
    openUsage(product, tab);
  }

  const selectedMoveReferences = useMemo(() => [...selectedReferences.values()].flatMap((reference): MoveReferenceIdentity[] => reference.itemId ? [{
    submissionId: reference.submissionId,
    expectedSubmissionVersion: reference.expectedSubmissionVersion,
    itemId: reference.itemId,
  }] : []), [selectedReferences]);

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
      <label className="admin-search">Cari Merk atau Tipe<input autoComplete="off" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari Merk atau Tipe..." /></label>
      <div className="product-filter-grid">
        <label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as AdminProductStatusFilter); setPage(1); }}><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="merged">Digabungkan</option><option value="all">Semua status</option></select></label>
        <label>Sumber<select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(1); }}><option value="">Semua sumber</option>{sourceOptions.map((source) => <option key={source} value={source}>{productSourceLabel(source)}</option>)}</select></label>
      </div>
      <div className="product-toolbar-actions">
        <AsyncButton className="primary-button" loading={activeAction === "create"} loadingText="Menambah..." onClick={openCreateDialog}>Tambah Produk</AsyncButton>
        <AsyncButton className="secondary-button" loading={loading} loadingText="Memuat..." onClick={() => void load()}>Muat ulang</AsyncButton>
      </div>
    </div>
    {error && <p className="admin-message" role="status">{error}</p>}
    <div className={`admin-table-wrap product-table${loading ? " is-loading" : ""}`} aria-busy={loading}><table><thead><tr>
      {([
        ["brand", "Merk"],
        ["model", "Tipe"],
        ["status", "Status"],
        ["source", "Sumber"],
        ["usage", "Penggunaan"],
      ] as const).map(([field, label]) => <th key={field} aria-sort={sortField === field ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
        <button className="sortable-header" type="button" onClick={() => changeSort(field)}>{label}<span aria-hidden="true">{sortField === field ? (sortDirection === "asc" ? "\u25B2" : "\u25BC") : ""}</span></button>
      </th>)}
      <th>Aksi</th>
    </tr></thead><tbody>
      {rows.map((product) => <tr key={product.id}><td><strong>{product.brand}</strong>{product.merged_target && <small className="product-merged-target">Ke {product.merged_target.brand} · {product.merged_target.model}</small>}</td><td>{product.model}</td><td><span className={`status-pill ${product.merged_into_product_id ? "merged" : product.active ? "active" : "inactive"}`}>{product.merged_into_product_id ? "Digabungkan" : product.active ? "Aktif" : "Nonaktif"}</span></td><td>{productSourceLabel(product.source_origin)}</td><td><button className="usage-link" type="button" onClick={() => openUsage(product)}>{product.usage_count ?? 0} referensi</button></td><td className="table-actions">{product.merged_into_product_id ? <button type="button" onClick={() => openUsage(product)}>Lihat Riwayat</button> : <><AsyncButton loading={activeAction === `edit:${product.id}`} loadingText="Menyimpan..." onClick={() => openEditDialog(product)}>Edit</AsyncButton><AsyncButton className={product.active ? "danger-inline" : undefined} loading={activeAction === `active:${product.id}`} loadingText="Menyimpan..." onClick={() => void setActive(product)}>{product.active ? "Nonaktifkan" : "Aktifkan"}</AsyncButton><button className="product-merge-action" type="button" onClick={() => setMergeProduct(product)}>Gabungkan</button><button className="product-delete-action" type="button" disabled={product.active} title={product.active ? "Nonaktifkan Produk terlebih dahulu sebelum menghapus permanen." : "Periksa keterkaitan dan hapus Produk permanen"} onClick={() => setDeleteProduct(product)}>Hapus Permanen</button></>}</td></tr>)}
      {!rows.length && <tr><td colSpan={6}>{loading ? "Memuat produk..." : "Tidak ada Produk yang sesuai dengan filter."}</td></tr>}
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
        <p className="product-usage-name"><strong>{usageProduct.brand}</strong><span>{usageProduct.model}</span>{dependencies && <small>{dependencies.product.mergedIntoProduct ? "Digabungkan" : dependencies.product.active ? "Aktif" : "Nonaktif"} · {productSourceLabel(dependencies.product.sourceOrigin)}</small>}</p>
        {dependencies?.product.mergedIntoProduct && <p className="product-merged-notice">Produk ini telah digabungkan ke <strong>{dependencies.product.mergedIntoProduct.brand}</strong> · {dependencies.product.mergedIntoProduct.model}</p>}
        <div className="product-dependency-tabs" role="tablist" aria-label="Detail dependency produk">
          {[['summary', 'Dependency'], ['references', 'Referensi'], ['qc', 'QC History'], ['aliases', 'Alias']].map(([tab, label]) => <button key={tab} type="button" role="tab" aria-selected={dependencyTab === tab} className={dependencyTab === tab ? "is-active" : ""} onClick={() => selectDependencyTab(tab as DependencyTab)}>{label}</button>)}
        </div>
        <div className="product-usage-content" aria-busy={usageLoading || dependenciesLoading || referencesLoading}>
          {dependencyTab === "summary" && <>
          {dependenciesLoading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memuat dependency produk...</p>}
          {usageLoading && !usage && !dependenciesLoading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memuat penggunaan...</p>}
          {usageError && <p className="app-dialog-error" role="alert">{usageError}</p>}
          {dependenciesError && <p className="app-dialog-error" role="alert">{dependenciesError}</p>}
          {dependencies && <>
            <div className="product-dependency-summary">
              <div><small>Item langsung</small><strong>{dependencies.preflight.currentDirectReferenceCount}</strong><p>Item inventaris yang langsung memilih produk ini</p></div>
              <div><small>Site aktif</small><strong>{dependencies.preflight.currentSiteCount}</strong><p>Site yang saat ini menggunakan produk ini</p></div>
              <div><small>Submission aktif</small><strong>{dependencies.preflight.currentSubmissionCount}</strong><p>Submission aktif yang menggunakan produk ini</p></div>
              <div><small>Hasil QC terkait</small><strong>{dependencies.preflight.resolvedQcProposalCount}</strong><p>Proposal QC yang telah diarahkan ke produk ini</p></div>
              <div><small>Alias produk</small><strong>{dependencies.preflight.aliasCount}</strong><p>Nama alternatif yang mengarah ke produk ini</p></div>
              <div><small>Referensi arsip</small><strong>{dependencies.preflight.archivedDirectReferenceCount}</strong><p>Referensi pada submission yang sudah diarsipkan</p></div>
            </div>
            {dependencies.preflight.activeLockCount > 0 && <p className="product-dependency-lock">{dependencies.preflight.activeLockCount} Submission referensi sedang diedit.</p>}
          </>}
          {usage && <>
          <p className="product-usage-summary">{usage.stationCount} Stasiun · {usage.siteCount} Site · {usage.referenceCount} referensi</p>
          <DependencyPagination page={dependencyPage} pageSize={dependencyPageSize} total={usage.totalCount} loading={usageLoading} label="Site" onPage={(nextPage) => { setDependencyPage(nextPage); void loadUsage(usageProduct, nextPage, dependencyPageSize); }} onPageSize={changeDependencyPageSize} />
          <div className="product-usage-list">
            {usage.rows.map((row) => <div key={`${row.stationName}:${row.siteName}:${row.subtypeName}`}><strong>{row.stationName}</strong><span>{row.siteName} · {row.siteTypeName} · {row.subtypeName}</span><small>{row.referenceCount} referensi</small></div>)}
            {!usage.rows.length && <p>Produk ini belum memiliki penggunaan pada submission aktif.</p>}
          </div>
          </>}
          </>}
          {dependencyTab === "references" && <>
            {!references && referencesLoading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memuat referensi...</p>}
            {dependenciesError && <p className="app-dialog-error" role="alert">{dependenciesError}</p>}
            {references && <><DependencyPagination page={references.page} pageSize={referencePageSize} total={references.totalCount} loading={referencesLoading} label="referensi" onPage={(nextPage) => void loadReferences(usageProduct, nextPage, referencePageSize)} onPageSize={(nextPageSize) => { setReferencePageSize(nextPageSize); void loadReferences(usageProduct, 1, nextPageSize); }} />
              <div className="product-reference-selection-toolbar">
                <CurrentPageReferenceCheckbox checked={referencePageSelection.checked} indeterminate={referencePageSelection.indeterminate} disabled={referencePageSelection.disabled} onChange={() => setSelectedReferences((current) => toggleCurrentPageSelection(references.rows, current))} />
                <div className="product-reference-selection-summary">
                  {selectedReferences.size > 0 && <strong>{selectedReferences.size} item dipilih</strong>}
                </div>
                <div className="product-reference-selection-actions">
                  {selectedReferences.size > 0 && <button className="product-reference-clear-selection" type="button" onClick={() => setSelectedReferences(clearProductReferenceSelection())}>Batalkan semua</button>}
                  <button className="primary-button" type="button" disabled={!selectedReferences.size} onClick={() => setMoveDialogOpen(true)}>Pindahkan Referensi</button>
                </div>
              </div>
              <div className="product-reference-list">{references.rows.map((row) => {
                const eligible = isProductReferenceSelectable(row);
                const key = productReferenceSelectionKey(row);
                return <div className={`product-reference-row${selectedReferences.has(key) ? " is-selected" : ""}`} key={key}>
                  <label className="product-reference-check"><input type="checkbox" aria-label={`Pilih referensi ${row.stationName} ${row.siteName}`} checked={selectedReferences.has(key)} disabled={!eligible} onChange={() => toggleReference(row)} /></label>
                  <div><strong>{row.stationName}</strong><span>{row.siteName} · {row.siteTypeName} · {row.siteSubtypeName}</span><small>Submission v{row.expectedSubmissionVersion} · {[row.categoryName, ...row.functionCategories].filter(Boolean).join(" · ")} · {row.unitCount} unit</small>{row.activeLock && <em>Sedang diedit{row.lockOwnerDisplayName ? `: ${row.lockOwnerDisplayName}` : ""}</em>}{row.archivedAt && <em>Diarsipkan</em>}</div>
                </div>;
              })}{!references.rows.length && <p>Belum ada referensi pada scope ini.</p>}</div></>}
          </>}
          {dependencyTab === "qc" && <div className="product-reference-list">{dependenciesLoading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memuat QC history...</p>}{dependencies?.qcProposals.map((proposal) => <div key={proposal.proposalId}><strong>{proposal.proposedBrand} · {proposal.proposedModel}</strong><span>{proposal.status}{proposal.reviewerName ? ` · ${proposal.reviewerName}` : ""}</span>{proposal.reviewNote && <small>Catatan: {proposal.reviewNote}</small>}</div>)}{dependencies && !dependencies.qcProposals.length && <p>Belum ada proposal QC yang resolved ke produk ini.</p>}</div>}
          {dependencyTab === "aliases" && <div className="product-reference-list">{dependenciesLoading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memuat alias...</p>}{dependencies?.aliases.map((alias) => <div key={alias.aliasId}><strong>{alias.brand}</strong><span>{alias.model}</span>{alias.sourceProposalId && <small>Asal proposal QC</small>}</div>)}{dependencies && !dependencies.aliases.length && <p>Produk ini belum memiliki alias.</p>}</div>}
        </div>
        <div className="app-dialog-actions"><button className="secondary-button" type="button" onClick={() => { setUsageProduct(null); setSelectedReferences(new Map()); }}>Tutup</button></div>
      </section>
    </div>}
    {usageProduct && moveDialogOpen && selectedMoveReferences.length > 0 && <ProductReferenceMoveDialog source={usageProduct} references={selectedMoveReferences} onClose={() => setMoveDialogOpen(false)} onMoved={completeReferenceMove} />}
    {mergeProduct && <ProductMergeDialog source={mergeProduct} onClose={() => setMergeProduct(null)} onMerged={completeProductMerge} />}
    {deleteProduct && <ProductDeleteDialog product={deleteProduct} onClose={() => setDeleteProduct(null)} onDeleted={completeProductDelete} onInspect={(tab) => inspectDeleteBlockers(deleteProduct, tab)} />}
  </section>;
}
