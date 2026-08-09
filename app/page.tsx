import type { Metadata } from "next";
import rawData from "./data.generated.json";
import AccountProblem from "./AccountProblem";
import InventoryApp from "./InventoryApp";
import LoginForm from "./LoginForm";
import { getPublicSupabaseConfig } from "./lib/supabase/config";
import { createSupabaseServerClient } from "./lib/supabase/server";
import type { DataSet } from "./types/inventory";

export const metadata: Metadata = {
  title: "Aloptama Collect | Pendataan Aloptama",
  description: "Pendataan Metadata dan Inventaris Aloptama",
};

const data = rawData as DataSet;

export default async function Home() {
  if (!getPublicSupabaseConfig()) {
    return (
      <main className="auth-shell"><section className="auth-panel config-panel">
        <h1>Konfigurasi Supabase belum tersedia</h1>
        <p>Isi <code>NEXT_PUBLIC_SUPABASE_URL</code> dan <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> pada environment lokal atau Vercel.</p>
      </section></main>
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase!.auth.getUser();
  if (!userData.user) return <LoginForm />;

  const { data: row, error } = await supabase!
    .from("station_accounts")
    .select("id, station_id, username")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (error || !row) return <AccountProblem message="Akun belum terhubung ke stasiun aktif. Hubungi pengelola aplikasi." />;
  const station = data.stationSites.find((item) => item.stationId === row.station_id);
  if (!station) return <AccountProblem message="Data stasiun akun tidak ditemukan pada master aplikasi." />;
  return <InventoryApp account={{ id: row.id, stationId: row.station_id, stationName: station.station, username: row.username }} />;
}
