"use client";

import { useRouter } from "next/navigation";
import FooterAttribution from "./components/FooterAttribution";
import { logoutCurrentBrowser } from "./lib/local-logout";
import { getSupabaseBrowserClient } from "./lib/supabase/client";
import { UPT_DATA_ENTRY_CLOSED_DESCRIPTION, UPT_DATA_ENTRY_CLOSED_TITLE } from "./lib/upt-data-entry-access";

export default function StationDataEntryClosed() {
  const router = useRouter();

  async function logout() {
    const client = getSupabaseBrowserClient();
    if (client) await logoutCurrentBrowser({ signOut: (options) => client.auth.signOut(options) });
    router.replace("/");
    router.refresh();
  }

  return <main className="auth-shell">
    <section className="auth-panel config-panel">
      <p className="eyebrow">AKSES PENGISIAN UPT</p>
      <h1>{UPT_DATA_ENTRY_CLOSED_TITLE}</h1>
      <p>{UPT_DATA_ENTRY_CLOSED_DESCRIPTION}</p>
      <div className="closed-entry-actions">
        <button className="secondary-button" type="button" onClick={() => router.refresh()}>Periksa kembali</button>
        <button className="secondary-button" type="button" onClick={logout}>Keluar</button>
      </div>
    </section>
    <FooterAttribution />
  </main>;
}
