"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { stationEmailForUsername } from "./lib/auth";
import { getSupabaseBrowserClient } from "./lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setSubmitting(true);
    setError("");
    const result = await client.auth.signInWithPassword({
      email: stationEmailForUsername(username),
      password,
    });
    if (result.error) setError("Username atau password tidak sesuai.");
    else router.refresh();
    setSubmitting(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">AC</div>
          <div><p className="eyebrow">PENDATAAN ALOPTAMA</p><h1>Aloptama Collect</h1></div>
        </div>
        <form onSubmit={submit}>
          <div><p className="kicker">AKUN STASIUN</p><h2>Masuk untuk melanjutkan</h2></div>
          <label>Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={submitting}>{submitting ? "Memeriksa..." : "Masuk"}</button>
        </form>
      </section>
    </main>
  );
}
