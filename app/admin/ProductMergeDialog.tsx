"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import { useAppFeedback } from "../components/AppFeedback";

type Product = { id: string; brand: string; model: string; active: boolean; source_origin: string };
type MergePlan = {
  status: string;
  preflightToken?: string;
  source?: { id: string; brand: string; model: string; active: boolean };
  target?: { id: string; brand: string; model: string; active: boolean };
  targetResolved?: boolean;
  referenceCount?: number;
  unitCount?: number;
  siteCount?: number;
  submissionCount?: number;
  sourceAliasCount?: number;
};

export default function ProductMergeDialog({ source, onClose, onMerged }: {
  source: Product;
  onClose: () => void;
  onMerged: (target: Product) => Promise<void>;
}) {
  const feedback = useAppFeedback();
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<Product[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [target, setTarget] = useState<Product | null>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [message, setMessage] = useState("");
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const requestIdRef = useRef(0);
  const queryRef = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = queryInput.trim();
      if (queryRef.current === nextQuery) return;
      queryRef.current = nextQuery;
      setTargetsLoading(true);
      setQuery(nextQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const params = new URLSearchParams({ page: "1", pageSize: "50", sort: "brand", direction: "asc", activeOnly: "1", excludeProductId: source.id });
    if (query) params.set("search", query);
    void fetch(`/api/admin/products?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { rows?: Product[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Produk tujuan gagal dimuat.");
        if (requestId === requestIdRef.current) setTargets(result.rows ?? []);
      })
      .catch((error) => {
        if (requestId === requestIdRef.current) setMessage(error instanceof Error ? error.message : "Produk tujuan gagal dimuat.");
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setTargetsLoading(false);
      });
  }, [query, source.id]);

  const runPreflight = useCallback(async (nextTarget: Product) => {
    setTarget(nextTarget);
    setPlan(null);
    setMessage("");
    setPreflightLoading(true);
    try {
      const response = await fetch(`/api/admin/products/${source.id}/merge-preflight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetProductId: nextTarget.id }),
      });
      const result = await response.json() as { preflight?: MergePlan; message?: string | null; error?: string };
      if (!response.ok || !result.preflight) throw new Error(result.error || "Preflight merge Produk gagal.");
      setPlan(result.preflight);
      setMessage(result.message || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preflight merge Produk gagal.");
    } finally {
      setPreflightLoading(false);
    }
  }, [source.id]);

  async function executeMerge() {
    if (!target || plan?.status !== "ready" || !plan.preflightToken || executing) return;
    setExecuting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${source.id}/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetProductId: target.id, preflightToken: plan.preflightToken }),
      });
      const result = await response.json() as { result?: MergePlan; error?: string };
      if (!response.ok || result.result?.status !== "merged") {
        setPlan(result.result ?? null);
        setMessage(result.error || "Produk gagal digabungkan.");
        return;
      }
      const canonicalTarget = result.result.target
        ? { ...target, id: result.result.target.id, brand: result.result.target.brand, model: result.result.target.model }
        : target;
      feedback.toast(`${result.result.referenceCount ?? 0} item berhasil dialihkan ke ${canonicalTarget.brand} / ${canonicalTarget.model}.`, "success");
      await onMerged(canonicalTarget);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Produk gagal digabungkan.");
    } finally {
      setExecuting(false);
    }
  }

  return <div className="app-dialog-backdrop product-move-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !executing) onClose(); }}>
    <section className="app-dialog product-move-dialog product-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="product-merge-title">
      <h2 id="product-merge-title">Gabungkan Produk</h2>
      <p className="product-move-source"><small>Produk sumber</small><strong>{source.brand}</strong><span>{source.model}</span></p>
      <div className="product-move-content">
        <label className="admin-search">Cari Produk tujuan<input autoFocus autoComplete="off" value={queryInput} onChange={(event) => { setQueryInput(event.target.value); setTarget(null); setPlan(null); setMessage(""); }} placeholder="Cari Merk atau Tipe" /></label>
        {targetsLoading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memuat Produk tujuan...</p>}
        {!targetsLoading && <div className="product-move-targets" aria-label="Produk tujuan">
          {targets.map((product) => <button key={product.id} type="button" className={target?.id === product.id ? "is-selected" : ""} onClick={() => void runPreflight(product)}><strong>{product.brand}</strong><span>{product.model}</span></button>)}
          {!targets.length && <p>Produk aktif tidak ditemukan.</p>}
        </div>}
        {preflightLoading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memeriksa dependency terbaru...</p>}
        {plan?.status === "ready" && plan.target && <div className="product-move-plan product-merge-plan">
          <p><small>Produk tujuan</small><strong>{plan.target.brand}</strong><span>{plan.target.model}</span></p>
          {plan.targetResolved && <small className="product-merge-resolved">Pilihan sebelumnya juga sudah digabungkan. Sistem memakai Produk tujuan terakhir.</small>}
          <dl><div><dt>Item</dt><dd>{plan.referenceCount}</dd></div><div><dt>Unit</dt><dd>{plan.unitCount}</dd></div><div><dt>Site</dt><dd>{plan.siteCount}</dd></div><div><dt>Submission</dt><dd>{plan.submissionCount}</dd></div><div><dt>Alias sumber</dt><dd>{plan.sourceAliasCount}</dd></div></dl>
          <p className="product-merge-warning"><strong>Tindakan ini tidak dapat dibatalkan dari UI.</strong> Semua referensi aktif Produk sumber akan dipindahkan, Produk sumber dinonaktifkan sebagai riwayat, dan nama lamanya menjadi alias Produk tujuan. Submission arsip dan riwayat QC tidak diubah.</p>
        </div>}
        {message && <p className={plan && plan.status !== "ready" ? "product-move-conflict" : "app-dialog-error"} role="alert">{message}</p>}
      </div>
      <div className="app-dialog-actions"><button className="secondary-button" type="button" disabled={executing} onClick={onClose}>Batal</button><AsyncButton className="danger-button" loading={executing} loadingText="Menggabungkan..." disabled={plan?.status !== "ready" || preflightLoading} onClick={() => void executeMerge()}>Gabungkan Produk</AsyncButton></div>
    </section>
  </div>;
}
