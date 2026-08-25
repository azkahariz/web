"use client";

import { useEffect, useRef, useState } from "react";
import AsyncButton from "../components/AsyncButton";

type ProductOption = { id: string; brand: string; model: string };
type Recommendation = { product: ProductOption; confidence: string; kind: "recommended" | "nearest" };
type ProposalContext = { id: string; brand: string; model: string; siteName: string | null; subtypeName: string | null };

type MergeTargetDialogProps = {
  proposals: ProposalContext[];
  recommendations: Recommendation[];
  products: ProductOption[];
  selectedProduct: ProductOption | null;
  query: string;
  selectedProductId: string;
  loadingProducts: boolean;
  validationMessage: string;
  mixedSelection: boolean;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelectProduct: (product: ProductOption) => void;
  onSubmit: (note: string) => Promise<boolean>;
};

export default function MergeTargetDialog({
  proposals,
  recommendations,
  products,
  selectedProduct,
  query,
  selectedProductId,
  loadingProducts,
  validationMessage,
  mixedSelection,
  onClose,
  onQueryChange,
  onSelectProduct,
  onSubmit,
}: MergeTargetDialogProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const normalizedQuery = query.trim();
  const visibleProducts = normalizedQuery || !recommendations.length ? products : recommendations.map((item) => item.product);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  async function submit() {
    if (!selectedProductId || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(note.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
    <section className="app-dialog qc-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="merge-target-dialog-title">
      <h2 id="merge-target-dialog-title">Gabungkan produk</h2>
      <p>{proposals.length === 1 ? "Periksa usulan dan pilih produk existing tujuan merge." : `${proposals.length} proposal akan digabungkan ke satu produk existing.`}</p>
      <div className="qc-merge-proposal-context" aria-label="Usulan produk yang dipilih">
        {proposals.slice(0, 3).map((proposal) => <div key={proposal.id}><strong>{proposal.brand}</strong><span>{proposal.model}</span>{proposal.siteName && <small>{proposal.siteName}{proposal.subtypeName ? ` · ${proposal.subtypeName}` : ""}</small>}</div>)}
        {proposals.length > 3 && <small>+{proposals.length - 3} proposal lainnya</small>}
      </div>
      {mixedSelection && <p className="qc-merge-warning">Usulan yang dipilih tampak memiliki Merk/Tipe yang berbeda. Periksa kembali sebelum menggabungkan.</p>}
      <label>Produk existing tujuan
        <input ref={searchRef} autoComplete="off" aria-label="Cari produk existing tujuan merge" placeholder="Cari Produk" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      </label>
      {selectedProduct && <p className="qc-merge-selected-target"><strong>Tujuan:</strong> {selectedProduct.brand} - {selectedProduct.model} <button type="button" onClick={() => onQueryChange("")}>Ganti</button></p>}
      {!selectedProduct && <div className="qc-merge-dialog-results" role="listbox" aria-label="Hasil produk tujuan merge">
        {!normalizedQuery && recommendations.length > 0 && <p className="qc-merge-section-label">{recommendations[0]?.kind === "nearest" ? "Kandidat terdekat" : "Disarankan"}</p>}
        {loadingProducts ? <p className="qc-merge-message">Memuat produk...</p> : visibleProducts.map((product) => {
          const recommendation = !normalizedQuery ? recommendations.find((item) => item.product.id === product.id) : null;
          return <button key={product.id} type="button" role="option" aria-selected={selectedProductId === product.id} onClick={() => onSelectProduct(product)}><strong>{product.brand}</strong><span>{product.model}</span>{recommendation && <small>{recommendation.confidence}</small>}</button>;
        })}
        {!loadingProducts && normalizedQuery && !visibleProducts.length && <p className="qc-merge-message">Produk tidak ditemukan.</p>}
      </div>}
      <label>Catatan merge (opsional)<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label>
      {validationMessage && <p className="app-dialog-error" role="alert">{validationMessage}</p>}
      <div className="app-dialog-actions">
        <button className="secondary-button" type="button" disabled={submitting} onClick={onClose}>Batal</button>
        <AsyncButton className="primary-button" type="button" disabled={!selectedProductId} loading={submitting} loadingText="Menggabungkan..." onClick={() => void submit()}>Gabungkan</AsyncButton>
      </div>
    </section>
  </div>;
}
