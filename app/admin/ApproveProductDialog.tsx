"use client";

import { useState, type FormEvent } from "react";
import AsyncButton from "../components/AsyncButton";

type ApproveProductDialogProps = {
  initialBrand: string;
  initialModel: string;
  error?: string;
  onClose: () => void;
  onSubmit: (values: { brand: string; model: string; note: string }) => Promise<boolean>;
};

export default function ApproveProductDialog({ initialBrand, initialModel, error, onClose, onSubmit }: ApproveProductDialogProps) {
  const [brand, setBrand] = useState(initialBrand);
  const [model, setModel] = useState(initialModel);
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedBrand = brand.trim();
    const trimmedModel = model.trim();
    if (!trimmedBrand || !trimmedModel) {
      setValidationError("Merk dan Tipe wajib diisi.");
      return;
    }
    setValidationError("");
    setLoading(true);
    try {
      const succeeded = await onSubmit({ brand: trimmedBrand, model: trimmedModel, note: note.trim() });
      if (succeeded) onClose();
    } finally {
      setLoading(false);
    }
  }

  return <div className="app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
    <form className="app-dialog product-dialog" role="dialog" aria-modal="true" aria-labelledby="approve-product-dialog-title" onSubmit={(event) => void submit(event)}>
      <h2 id="approve-product-dialog-title">Setujui produk baru</h2>
      <p>Periksa dan lengkapi identitas produk canonical sebelum menyetujui proposal.</p>
      <label>Merk<input autoFocus autoComplete="off" value={brand} onChange={(event) => { setBrand(event.target.value); setValidationError(""); }} /></label>
      <label>Tipe<input autoComplete="off" value={model} onChange={(event) => { setModel(event.target.value); setValidationError(""); }} /></label>
      <label>Catatan pemeriksaan (opsional)<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label>
      {(validationError || error) && <p className="app-dialog-error" role="alert">{validationError || error}</p>}
      <div className="app-dialog-actions">
        <button className="secondary-button" type="button" disabled={loading} onClick={onClose}>Batal</button>
        <AsyncButton className="primary-button" type="submit" loading={loading} loadingText="Menyetujui...">Setujui</AsyncButton>
      </div>
    </form>
  </div>;
}
