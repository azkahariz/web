"use client";

import { useCallback, useEffect, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import { useAppFeedback } from "../components/AppFeedback";

type Product = { id: string; brand: string; model: string; active: boolean };
type DeleteBlocker = { code: string; message: string; count: number };
type DeleteDependencies = {
  currentDirectReferenceCount: number;
  currentCanonicalReferenceCount: number;
  currentSiteCount: number;
  currentSubmissionCount: number;
  archivedDirectReferenceCount: number;
  archivedCanonicalReferenceCount: number;
  resolvedQcProposalCount: number;
  aliasCount: number;
  mergeInboundCount: number;
  mergeOutboundCount: number;
};
type DeletePlan = {
  status: string;
  eligible: boolean;
  preflightToken?: string | null;
  blockers?: DeleteBlocker[];
  dependencies?: DeleteDependencies;
};

const blockerLabels: Record<string, string> = {
  current_references: "Item inventaris aktif",
  archived_references: "Referensi arsip",
  qc_history: "Hasil QC terkait",
  aliases: "Alias produk",
  merge_target: "Produk sumber yang mengarah ke sini",
};

export default function ProductDeleteDialog({ product, onClose, onDeleted, onInspect }: {
  product: Product;
  onClose: () => void;
  onDeleted: () => Promise<void>;
  onInspect: (tab: "summary" | "references" | "qc" | "aliases") => void;
}) {
  const feedback = useAppFeedback();
  const [plan, setPlan] = useState<DeletePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const loadPreflight = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}/delete-preflight`, {
        method: "POST",
        cache: "no-store",
      });
      const result = await response.json() as { preflight?: DeletePlan; error?: string };
      if (!response.ok || !result.preflight) throw new Error(result.error || "Preflight hapus Produk gagal.");
      setPlan(result.preflight);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preflight hapus Produk gagal.");
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPreflight(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPreflight]);

  async function executeDelete() {
    if (!plan?.eligible || !plan.preflightToken || deleting) return;
    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preflightToken: plan.preflightToken }),
      });
      const result = await response.json() as { result?: DeletePlan; error?: string };
      if (!response.ok || result.result?.status !== "deleted") {
        if (result.result) setPlan(result.result);
        setMessage(result.error || "Produk gagal dihapus permanen.");
        return;
      }
      feedback.toast("Produk berhasil dihapus permanen.", "success");
      await onDeleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Produk gagal dihapus permanen.");
    } finally {
      setDeleting(false);
    }
  }

  const blockers = plan?.blockers ?? [];
  const dependencyCounts = plan?.dependencies ? [
    ["Item inventaris aktif", plan.dependencies.currentCanonicalReferenceCount],
    ["Site aktif", plan.dependencies.currentSiteCount],
    ["Submission aktif", plan.dependencies.currentSubmissionCount],
    ["Referensi arsip", plan.dependencies.archivedCanonicalReferenceCount],
    ["Hasil QC terkait", plan.dependencies.resolvedQcProposalCount],
    ["Alias produk", plan.dependencies.aliasCount],
    ["Tujuan penggabungan", plan.dependencies.mergeInboundCount],
  ].filter((entry): entry is [string, number] => Number(entry[1]) > 0) : [];
  const canInspectReferences = blockers.some((blocker) => blocker.code === "current_references" || blocker.code === "archived_references");
  const inspectTab = blockers.some((blocker) => blocker.code === "qc_history") ? "qc"
    : blockers.some((blocker) => blocker.code === "aliases") ? "aliases"
      : canInspectReferences ? "references" : "summary";

  return <div className="app-dialog-backdrop product-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) onClose(); }}>
    <section className="app-dialog product-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="product-delete-title">
      <h2 id="product-delete-title">Hapus Produk Permanen</h2>
      <p className="product-delete-identity"><strong>{product.brand}</strong><span>{product.model}</span></p>
      <div className="product-delete-content" aria-busy={loading}>
        {loading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memeriksa keterkaitan Produk...</p>}
        {!loading && plan?.eligible && <div className="product-delete-ready">
          <p>Produk akan dihapus secara permanen dan tidak dapat dipulihkan melalui aplikasi.</p>
          <p>Tidak ditemukan item inventaris, riwayat QC, alias, arsip, atau hubungan penggabungan yang menggunakan Produk ini.</p>
        </div>}
        {!loading && blockers.length > 0 && <div className="product-delete-blocked">
          <strong>Produk belum dapat dihapus permanen.</strong>
          {dependencyCounts.length > 0 && <dl>{dependencyCounts.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>}
          <ul>{blockers.map((blocker) => <li key={blocker.code}><span>{blocker.message}</span>{blocker.count > 0 && blockerLabels[blocker.code] && <small>{blocker.count} {blockerLabels[blocker.code]}</small>}</li>)}</ul>
        </div>}
        {message && <p className="app-dialog-error" role="alert">{message}</p>}
      </div>
      <div className="app-dialog-actions">
        <button className="secondary-button" type="button" disabled={deleting} onClick={onClose}>Batal</button>
        {!loading && !plan?.eligible && plan?.status !== "not_found" && plan?.status !== "already_deleted" && <button className="secondary-button" type="button" disabled={deleting} onClick={() => onInspect(inspectTab)}>Lihat Keterkaitan</button>}
        {message && !deleting && <button className="secondary-button" type="button" onClick={() => void loadPreflight()}>Periksa lagi</button>}
        <AsyncButton className="danger-button" loading={deleting} loadingText="Menghapus..." disabled={loading || !plan?.eligible || !plan.preflightToken} onClick={() => void executeDelete()}>Hapus Permanen</AsyncButton>
      </div>
    </section>
  </div>;
}
