"use client";

import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "./lib/supabase/client";

export default function AccountProblem({ message }: { message: string }) {
  const router = useRouter();
  async function logout() {
    await getSupabaseBrowserClient()?.auth.signOut();
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

