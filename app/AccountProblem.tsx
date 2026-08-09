"use client";

import { useRouter } from "next/navigation";
import { logoutCurrentBrowser } from "./lib/local-logout";
import { getSupabaseBrowserClient } from "./lib/supabase/client";

export default function AccountProblem({ message }: { message: string }) {
  const router = useRouter();
  async function logout() {
    const client = getSupabaseBrowserClient();
    if (client) await logoutCurrentBrowser({ signOut: (options) => client.auth.signOut(options) });
    router.replace("/");
    router.refresh();
  }
  return (
    <main className="auth-shell"><section className="auth-panel config-panel">
      <h1>Akun stasiun belum siap</h1>
      <p>{message}</p>
      <button className="secondary-button" onClick={logout}>Keluar</button>
    </section></main>
  );
}
