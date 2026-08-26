"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import { useAppFeedback } from "../components/AppFeedback";

export type MoveReferenceIdentity = {
  referenceType: "DIRECT";
  submissionId: string;
  expectedSubmissionVersion: number;
  itemId: string;
} | {
  referenceType: "QC_RESULT";
  proposalId: string;
  expectedProposalUpdatedAt: string;
};

type Product = { id: string; brand: string; model: string; active: boolean; source_origin: string };
type MovePlan = {
  status: string;
  source?: { id: string; brand: string; model: string };
  target?: { id: string; brand: string; model: string };
  referenceCount?: number;
  directReferenceCount?: number;
  qcResultCount?: number;
  unitCount?: number;
  siteCount?: number;
  submissionCount?: number;
};

export default function ProductReferenceMoveDialog({ source, references, onClose, onMoved }: {
  source: Product;
  references: MoveReferenceIdentity[];
  onClose: () => void;
  onMoved: (target: Product) => Promise<void>;
}) {
  const feedback = useAppFeedback();
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<Product[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [target, setTarget] = useState<Product | null>(null);
  const [plan, setPlan] = useState<MovePlan | null>(null);
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
      const response = await fetch(`/api/admin/products/${source.id}/move-preflight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetProductId: nextTarget.id, references }),
      });
      const result = await response.json() as { preflight?: MovePlan; message?: string | null; error?: string };
      if (!response.ok || !result.preflight) throw new Error(result.error || "Preflight pemindahan referensi gagal.");
      setPlan(result.preflight);
      setMessage(result.message || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preflight pemindahan referensi gagal.");
    } finally {
      setPreflightLoading(false);
    }
  }, [references, source.id]);

  async function executeMove() {
    if (!target || plan?.status !== "ready" || executing) return;
    setExecuting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${source.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetProductId: target.id, references }),
      });
      const result = await response.json() as { result?: MovePlan; error?: string };
      if (!response.ok || result.result?.status !== "moved") {
        setPlan(result.result ?? null);
        setMessage(result.error || "Referensi gagal dipindahkan.");
        return;
      }
      feedback.toast(`${result.result.referenceCount ?? references.length} referensi berhasil dipindahkan.`, "success");
      await onMoved(target);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Referensi gagal dipindahkan.");
    } finally {
      setExecuting(false);
    }
  }

  return <div className="app-dialog-backdrop product-move-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !executing) onClose(); }}>
    <section className="app-dialog product-move-dialog" role="dialog" aria-modal="true" aria-labelledby="product-move-title">
      <h2 id="product-move-title">Pindahkan Referensi</h2>
      <p className="product-move-source"><small>Dari</small><strong>{source.brand}</strong><span>{source.model}</span></p>
      <div className="product-move-content">
        <label className="admin-search">Cari Produk tujuan<input autoFocus autoComplete="off" value={queryInput} onChange={(event) => { setQueryInput(event.target.value); setTarget(null); setPlan(null); setMessage(""); }} placeholder="Cari Merk atau Tipe" /></label>
        {targetsLoading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memuat Produk tujuan...</p>}
        {!targetsLoading && <div className="product-move-targets" aria-label="Produk tujuan">
          {targets.map((product) => <button key={product.id} type="button" className={target?.id === product.id ? "is-selected" : ""} onClick={() => void runPreflight(product)}><strong>{product.brand}</strong><span>{product.model}</span></button>)}
          {!targets.length && <p>Produk aktif tidak ditemukan.</p>}
        </div>}
        {preflightLoading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memeriksa referensi terbaru...</p>}
        {plan?.status === "ready" && plan.target && <div className="product-move-plan">
          <p><small>Ke</small><strong>{plan.target.brand}</strong><span>{plan.target.model}</span></p>
          <dl><div><dt>Referensi</dt><dd>{plan.referenceCount}</dd></div><div><dt>Langsung</dt><dd>{plan.directReferenceCount ?? 0}</dd></div><div><dt>Hasil QC</dt><dd>{plan.qcResultCount ?? 0}</dd></div><div><dt>Site</dt><dd>{plan.siteCount}</dd></div></dl>
          <p className="product-move-warning">Referensi langsung memperbarui Merk dan Tipe pada item terpilih. Hasil QC hanya diarahkan ke Produk tujuan. Data unit, nomor seri, kondisi, tahun, catatan, dan metadata lainnya tidak berubah.</p>
        </div>}
        {message && <p className={plan && plan.status !== "ready" ? "product-move-conflict" : "app-dialog-error"} role="alert">{message}</p>}
      </div>
      <div className="app-dialog-actions"><button className="secondary-button" type="button" disabled={executing} onClick={onClose}>Batal</button><AsyncButton className="primary-button" loading={executing} loadingText="Memindahkan..." disabled={plan?.status !== "ready" || preflightLoading} onClick={() => void executeMove()}>Pindahkan {plan?.referenceCount ?? references.length} Item</AsyncButton></div>
    </section>
  </div>;
}
