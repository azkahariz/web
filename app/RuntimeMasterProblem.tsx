"use client";

import { useRouter } from "next/navigation";
import FooterAttribution from "./components/FooterAttribution";

export default function RuntimeMasterProblem() {
  const router = useRouter();
  return (
    <main className="auth-shell"><section className="auth-panel config-panel">
      <h1>Master data gagal dimuat</h1>
      <p>Data Site dan kategori dari server belum dapat dimuat. Coba muat ulang.</p>
      <button className="secondary-button" onClick={() => router.refresh()}>Muat ulang</button>
    </section><FooterAttribution /></main>
  );
}
