"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { stationEmailForUsername } from "./lib/auth";
import { getSupabaseBrowserClient } from "./lib/supabase/client";
import EyeIcon from "./components/EyeIcon";
import AsyncButton from "./components/AsyncButton";
import FooterAttribution from "./components/FooterAttribution";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("Konfigurasi login belum tersedia.");
      return;
    }
    setSubmitting(true);
    setSuccess(false);
    setError("");
    try {
      const result = await client.auth.signInWithPassword({
        email: stationEmailForUsername(username),
        password,
      });
      if (result.error) setError("Username atau password tidak sesuai.");
      else {
        setSuccess(true);
        router.refresh();
      }
    } catch {
      setError("Login gagal diproses. Periksa koneksi lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
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
          <label>Username<input required disabled={submitting} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <div className="auth-password-field">
            <label htmlFor="login-password">Password</label>
            <span className="password-input-wrap">
              <input id="login-password" required disabled={submitting} type={passwordVisible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <button
                className="password-visibility-button"
                type="button"
                aria-label={passwordVisible ? "Sembunyikan password" : "Tampilkan password"}
                aria-pressed={passwordVisible}
                disabled={submitting}
                onClick={() => setPasswordVisible((current) => !current)}
              >
                <EyeIcon hidden={passwordVisible} />
              </button>
            </span>
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {success && <p className="auth-success" role="status">Login berhasil. Membuka dashboard...</p>}
          <AsyncButton className="primary-button" type="submit" loading={submitting} loadingText="Memverifikasi...">Masuk</AsyncButton>
        </form>
      </section>
      <FooterAttribution />
    </main>
  );
}
