"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import { useAppFeedback } from "../components/AppFeedback";
import { formatReferenceContext } from "../lib/product-reference-context";

type RemoveReferenceOccurrence = {
  submissionId: string;
  expectedSubmissionVersion: number;
  storageCategory: string;
  itemOrdinal: number;
  itemId: string | null;
};

export type RemoveReferenceIdentity = RemoveReferenceOccurrence & (
  { referenceType: "DIRECT" } |
  { referenceType: "QC_RESULT"; proposalId: string; expectedProposalUpdatedAt: string }
);

export type RemoveReferencePreview = RemoveReferenceIdentity & {
  referenceId: string;
  stationName: string;
  siteName: string;
  siteTypeName: string;
  siteSubtypeName: string;
  categories: string[];
};

type Product = { id: string; brand: string; model: string };
type RemovalPlan = {
  status: string;
  source?: Product;
  referenceCount?: number;
  directReferenceCount?: number;
  qcResultCount?: number;
  siteCount?: number;
  submissionCount?: number;
};

export default function ProductReferenceRemoveDialog({ source, references, onClose, onRemoved }: {
  source: Product;
  references: RemoveReferencePreview[];
  onClose: () => void;
  onRemoved: () => Promise<void>;
}) {
  const feedback = useAppFeedback();
  const [plan, setPlan] = useState<RemovalPlan | null>(null);
  const [message, setMessage] = useState("");
  const [preflightLoading, setPreflightLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

  const requestReferences: RemoveReferenceIdentity[] = useMemo(() => references.map((reference) => {
    const occurrence = {
      submissionId: reference.submissionId,
      expectedSubmissionVersion: reference.expectedSubmissionVersion,
      storageCategory: reference.storageCategory,
      itemOrdinal: reference.itemOrdinal,
      itemId: reference.itemId,
    };
    return reference.referenceType === "QC_RESULT"
      ? { ...occurrence, referenceType: "QC_RESULT", proposalId: reference.proposalId, expectedProposalUpdatedAt: reference.expectedProposalUpdatedAt }
      : { ...occurrence, referenceType: "DIRECT" };
  }), [references]);

  const runPreflight = useCallback(async () => {
    setPreflightLoading(true);
    setPlan(null);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${source.id}/remove-preflight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ references: requestReferences }),
      });
      const result = await response.json() as { preflight?: RemovalPlan; message?: string | null; error?: string };
      if (!response.ok || !result.preflight) throw new Error(result.error || "Preflight penghapusan referensi gagal.");
      setPlan(result.preflight);
      setMessage(result.message || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preflight penghapusan referensi gagal.");
    } finally {
      setPreflightLoading(false);
    }
  }, [requestReferences, source.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void runPreflight(), 0);
    return () => window.clearTimeout(timer);
  }, [runPreflight]);

  async function executeRemoval() {
    if (plan?.status !== "ready" || executing) return;
    setExecuting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${source.id}/remove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ references: requestReferences }),
      });
      const result = await response.json() as { result?: RemovalPlan; error?: string };
      if (!response.ok || result.result?.status !== "removed") {
        setPlan(result.result ?? null);
        setMessage(result.error || "Referensi gagal dihapus.");
        return;
      }
      feedback.toast(`${result.result.referenceCount ?? references.length} referensi berhasil dihapus.`, "success");
      await onRemoved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Referensi gagal dihapus.");
    } finally {
      setExecuting(false);
    }
  }

  return <div className="app-dialog-backdrop product-move-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !executing) onClose(); }}>
    <section className="app-dialog product-remove-dialog" role="dialog" aria-modal="true" aria-labelledby="product-remove-title">
      <h2 id="product-remove-title">Hapus Referensi</h2>
      <p className="product-move-source"><small>Produk</small><strong>{source.brand}</strong><span>{source.model}</span></p>
      <div className="product-remove-content" aria-busy={preflightLoading || executing}>
        <p className="product-reference-scope">Periksa kembali occurrence yang akan dilepas dari Produk ini.</p>
        <div className="product-remove-reference-list">
          {references.map((reference, index) => <div key={reference.referenceId}>
            <span>{index + 1}</span>
            <p><strong>{reference.stationName}</strong><span>{formatReferenceContext({ siteName: reference.siteName, siteTypeName: reference.siteTypeName, siteSubtypeName: reference.siteSubtypeName, categories: reference.categories })}</span><small>{reference.referenceType === "QC_RESULT" ? "Hasil QC" : "Item Langsung"} · Submission v{reference.expectedSubmissionVersion}</small></p>
          </div>)}
        </div>
        {preflightLoading && <p className="product-usage-state" role="status"><span className="product-usage-spinner" aria-hidden="true" />Memeriksa referensi terbaru...</p>}
        {plan?.status === "ready" && <div className="product-remove-plan">
          <strong>{plan.referenceCount ?? references.length} referensi siap dihapus</strong>
          <span>{plan.directReferenceCount ?? 0} item langsung · {plan.qcResultCount ?? 0} hasil QC · {plan.submissionCount ?? 0} Submission</span>
        </div>}
        <p className="product-remove-warning">Produk dan Submission tidak akan dihapus. Referensi lain tidak berubah. Riwayat proposal dan hasil QC tetap dipertahankan.</p>
        {message && <p className={plan && plan.status !== "ready" ? "product-move-conflict" : "app-dialog-error"} role="alert">{message}</p>}
      </div>
      <div className="app-dialog-actions"><button className="secondary-button" type="button" disabled={executing} onClick={onClose}>Batal</button><AsyncButton className="danger-button" loading={executing} loadingText="Menghapus..." disabled={plan?.status !== "ready" || preflightLoading} onClick={() => void executeRemoval()}>Hapus {plan?.referenceCount ?? references.length} Referensi</AsyncButton></div>
    </section>
  </div>;
}
