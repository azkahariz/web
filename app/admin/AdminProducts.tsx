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

  async function createProduct() {
    const brand = await feedback.prompt({ title: "Tambah produk", inputLabel: "Merk", required: true, confirmLabel: "Berikutnya" });
    if (!brand) return;
    const model = await feedback.prompt({ title: "Tambah produk", inputLabel: "Tipe", required: true, confirmLabel: "Simpan" });
    if (!model) return;
    await feedback.confirmAction({ title: "Tambah produk?", description: `${brand.trim()} - ${model.trim()}`, confirmLabel: "Tambah" }, async () => {
      try {
        setActiveAction("create");
        await post({ action: "create", brand, model });
        feedback.toast("Produk baru berhasil ditambahkan.", "success");
        return true;
      } catch (actionError) {
        feedback.toast(actionError instanceof Error ? actionError.message : "Produk gagal ditambahkan.", "error");
        return false;
      } finally {
        setActiveAction(null);
      }
    });
  }

  async function editProduct(product: Product) {
    const brand = await feedback.prompt({ title: "Edit produk", inputLabel: "Merk", initialValue: product.brand, required: true, confirmLabel: "Berikutnya" });
    if (!brand) return;
    const model = await feedback.prompt({ title: "Edit produk", inputLabel: "Tipe", initialValue: product.model, required: true, confirmLabel: "Simpan" });
    if (!model) return;
    await feedback.confirmAction({ title: "Simpan perubahan produk?", description: `${brand.trim()} - ${model.trim()}`, confirmLabel: "Simpan" }, async () => {
      try {
        setActiveAction(`edit:${product.id}`);
        await post({ action: "update", productId: product.id, brand, model });
        feedback.toast("Produk berhasil diperbarui.", "success");
        return true;
      } catch (actionError) {
        feedback.toast(actionError instanceof Error ? actionError.message : "Produk gagal diperbarui.", "error");
        return false;
      } finally {
        setActiveAction(null);
      }
    });
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
      <AsyncButton className="primary-button" loading={activeAction === "create"} loadingText="Menambah..." onClick={() => void createProduct()}>Tambah Produk</AsyncButton>
      <AsyncButton className="secondary-button" loading={loading} loadingText="Memuat..." onClick={() => void load()}>Muat ulang</AsyncButton>
    </div>
    {error && <p className="admin-message" role="status">{error}</p>}
    <div className={`admin-table-wrap product-table${loading ? " is-loading" : ""}`}><table><thead><tr><th>Merk</th><th>Tipe</th><th>Status</th><th>Sumber</th><th>Aksi</th></tr></thead><tbody>
      {rows.map((product) => <tr key={product.id}><td><strong>{product.brand}</strong></td><td>{product.model}</td><td><span className={`status-pill ${product.active ? "active" : "inactive"}`}>{product.active ? "Aktif" : "Nonaktif"}</span></td><td>{originLabel(product.source_origin)}</td><td className="table-actions"><AsyncButton loading={activeAction === `edit:${product.id}`} loadingText="Menyimpan..." onClick={() => void editProduct(product)}>Edit</AsyncButton><AsyncButton className={product.active ? "danger-inline" : undefined} loading={activeAction === `active:${product.id}`} loadingText="Menyimpan..." onClick={() => void setActive(product)}>{product.active ? "Nonaktifkan" : "Aktifkan"}</AsyncButton></td></tr>)}
      {!rows.length && <tr><td colSpan={5}>{loading ? "Memuat produk..." : "Produk tidak ditemukan."}</td></tr>}
    </tbody></table></div>
    <div className="submission-pagination" aria-label="Pagination produk">
      <label className="page-size-control">Baris per halaman:<select value={String(pageSize)} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="50">50</option><option value="100">100</option><option value="200">200</option></select></label>
      <span>Menampilkan {firstRow}-{lastRow} dari {totalCount}</span>
      <div className="pagination-buttons"><button disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Sebelumnya</button><span>Halaman {page} dari {pageCount}</span><button disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>Berikutnya</button></div>
    </div>
  </section>;
}
