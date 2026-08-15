"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import { useAppFeedback } from "../components/AppFeedback";

type Product = { id: string; brand: string; model: string; active: boolean; source_origin: string };
type Summary = { total_count: number; active_count: number; inactive_count: number };
type SortField = "brand" | "model";
type SortDirection = "asc" | "desc";

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
  const [pageSize, setPageSize] = useState(50);
  const [sortField, setSortField] = useState<SortField>("brand");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [productDialog, setProductDialog] = useState<{ mode: "create" | "edit"; productId?: string; brand: string; model: string } | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [dialogSubmitting, setDialogSubmitting] = useState(false);
  const [customPageSize, setCustomPageSize] = useState(false);
  const [pageSizeDraft, setPageSizeDraft] = useState("500");
  const [pageSizeError, setPageSizeError] = useState("");

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
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Daftar produk gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortDirection, sortField]);

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
    <div className={`admin-table-wrap product-table${loading ? " is-loading" : ""}`}><table><thead><tr><th>Merk</th><th>Tipe</th><th>Status</th><th>Sumber</th><th>Aksi</th></tr></thead><tbody>
      {rows.map((product) => <tr key={product.id}><td><strong>{product.brand}</strong></td><td>{product.model}</td><td><span className={`status-pill ${product.active ? "active" : "inactive"}`}>{product.active ? "Aktif" : "Nonaktif"}</span></td><td>{originLabel(product.source_origin)}</td><td className="table-actions"><AsyncButton loading={activeAction === `edit:${product.id}`} loadingText="Menyimpan..." onClick={() => openEditDialog(product)}>Edit</AsyncButton><AsyncButton className={product.active ? "danger-inline" : undefined} loading={activeAction === `active:${product.id}`} loadingText="Menyimpan..." onClick={() => void setActive(product)}>{product.active ? "Nonaktifkan" : "Aktifkan"}</AsyncButton></td></tr>)}
      {!rows.length && <tr><td colSpan={5}>{loading ? "Memuat produk..." : "Produk tidak ditemukan."}</td></tr>}
    </tbody></table></div>
    <div className="submission-pagination" aria-label="Pagination produk">
      <label className="page-size-control">Tampilkan:<select value={customPageSize ? "custom" : String(pageSize)} onChange={(event) => {
        if (event.target.value === "custom") { setCustomPageSize(true); setPageSizeDraft(String(pageSize)); setPageSizeError(""); return; }
        setCustomPageSize(false); setPageSizeError(""); setPageSize(Number(event.target.value)); setPage(1);
      }}><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="400">400</option><option value="custom">Custom</option></select></label>
      {customPageSize && <label className="page-size-control">Jumlah per halaman:<input aria-label="Jumlah per halaman" type="number" min={10} max={1000} step={1} value={pageSizeDraft} onChange={(event) => { setPageSizeDraft(event.target.value); setPageSizeError(""); }} /><button type="button" onClick={() => {
        if (!/^\d+$/.test(pageSizeDraft)) { setPageSizeError("Masukkan bilangan bulat 10-1000."); return; }
        const value = Number(pageSizeDraft);
        if (value < 10 || value > 1000) { setPageSizeError("Jumlah harus antara 10 dan 1000."); return; }
        setPageSize(value); setPage(1); setPageSizeError("");
      }}>Terapkan</button></label>}
      {pageSizeError && <span className="page-size-error" role="alert">{pageSizeError}</span>}
      <span>Menampilkan {firstRow}-{lastRow} dari {totalCount}</span>
      <div className="pagination-buttons"><button disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Sebelumnya</button><span>Halaman {page} dari {pageCount}</span><button disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>Berikutnya</button></div>
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
  </section>;
}
