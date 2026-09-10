"use client";

import { useCallback, useEffect, useState } from "react";
import AsyncButton from "../components/AsyncButton";
import { useAppFeedback } from "../components/AppFeedback";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { parseUptDataEntryStatus, type UptDataEntryStatus } from "../lib/upt-data-entry-access";

export default function UptDataEntryAccessControl() {
  const feedback = useAppFeedback();
  const [status, setStatus] = useState<UptDataEntryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("Konfigurasi Supabase belum tersedia.");
      setLoading(false);
      return;
    }
    const { data, error: rpcError } = await client.rpc("get_upt_data_entry_status");
    const parsed = rpcError ? null : parseUptDataEntryStatus(data);
    if (!parsed) setError("Status akses pengisian belum dapat dimuat.");
    else setStatus(parsed);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function changeAccess() {
    if (!status || updating) return;
    const nextEnabled = !status.enabled;
    const confirmed = await feedback.confirm({
      title: nextEnabled ? "Buka kembali pengisian UPT?" : "Tutup pengisian UPT?",
      description: nextEnabled
        ? "Station User dapat kembali membuka form, memperoleh lock, dan menyimpan data."
        : "Seluruh Station User akan langsung ditolak pada operasi pengisian berikutnya. Super Admin tetap dapat mengelola data. Data yang sudah tersimpan tidak akan dihapus.",
      confirmLabel: nextEnabled ? "Buka Pengisian" : "Tutup Pengisian",
      danger: !nextEnabled,
    });
    if (!confirmed) return;

    const client = getSupabaseBrowserClient();
    if (!client) return;
    setUpdating(true);
    setError("");
    const { data, error: rpcError } = await client.rpc("set_upt_data_entry_enabled", { p_enabled: nextEnabled });
    const parsed = rpcError ? null : parseUptDataEntryStatus(data);
    if (!parsed) {
      setError("Perubahan status gagal disimpan. Status sebelumnya tetap ditampilkan.");
      feedback.toast("Status akses pengisian gagal diubah.", "error");
    } else {
      setStatus(parsed);
      await load();
      feedback.toast(nextEnabled ? "Pengisian UPT telah dibuka." : "Pengisian UPT telah ditutup.", "success");
    }
    setUpdating(false);
  }

  return <section className="upt-access-control" aria-labelledby="upt-access-heading" aria-busy={loading || updating}>
    <div>
      <div className="admin-section-heading">
        <h3 id="upt-access-heading">Akses Pengisian UPT</h3>
        {status && <span className={`upt-access-status ${status.enabled ? "is-open" : "is-closed"}`}>{status.enabled ? "DIBUKA" : "DITUTUP"}</span>}
      </div>
      <p>{status?.enabled
        ? "Station User dapat membuka form dan menyimpan pengisian."
        : status ? "Station User tetap dapat login, tetapi form dan seluruh mutasi pengisian diblokir." : "Memuat status akses authoritative..."}</p>
      {status && <small>Terakhir diubah {new Date(status.updatedAt).toLocaleString("id-ID")}</small>}
      {error && <p className="upt-access-error" role="alert">{error}</p>}
    </div>
    <div className="upt-access-actions">
      {error && <AsyncButton className="secondary-button" type="button" loading={loading} loadingText="Memuat..." onClick={() => void load()}>Coba lagi</AsyncButton>}
      {status && <AsyncButton className={status.enabled ? "danger-button" : "primary-button"} type="button" loading={updating} loadingText="Menyimpan..." onClick={() => void changeAccess()}>{status.enabled ? "Tutup Pengisian" : "Buka Pengisian"}</AsyncButton>}
    </div>
  </section>;
}
