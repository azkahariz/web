import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AccountProblem from "./AccountProblem";
import InventoryApp from "./InventoryApp";
import LoginForm from "./LoginForm";
import RuntimeMasterProblem from "./RuntimeMasterProblem";
import FooterAttribution from "./components/FooterAttribution";
import { getPublicSupabaseConfig } from "./lib/supabase/config";
import { createSupabaseServerClient } from "./lib/supabase/server";
import { tryParseStationRuntimeMaster } from "./lib/station-runtime-master";

export const metadata: Metadata = {
  title: "Aloptama Collect | Pendataan Aloptama",
  description: "Pendataan Metadata dan Inventaris Aloptama",
};

export default async function Home() {
  if (!getPublicSupabaseConfig()) {
    return (
      <main className="auth-shell"><section className="auth-panel config-panel">
        <h1>Konfigurasi Supabase belum tersedia</h1>
        <p>Isi <code>NEXT_PUBLIC_SUPABASE_URL</code> dan <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> pada environment lokal atau Vercel.</p>
      </section><FooterAttribution /></main>
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase!.auth.getUser();
  if (!userData.user) return <LoginForm />;

  const { data: admin } = await supabase!
    .from("super_admins")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (admin) redirect("/admin");

  const { data: row, error } = await supabase!
    .from("station_accounts")
    .select("id, station_id, username")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (error || !row) return <AccountProblem message="Akun belum terhubung ke stasiun aktif. Hubungi pengelola aplikasi." />;
  const { data: runtimePayload, error: runtimeError } = await supabase!.rpc("station_runtime_master");
  if (runtimeError || !runtimePayload) return <RuntimeMasterProblem />;
  const runtimeMaster = tryParseStationRuntimeMaster(runtimePayload);
  if (!runtimeMaster) return <RuntimeMasterProblem />;
  if (runtimeMaster.station.id !== row.station_id) return <AccountProblem message="Akun tidak sesuai dengan master stasiun aktif." />;
  return <InventoryApp account={{ id: row.id, stationId: row.station_id, stationName: runtimeMaster.station.name, username: row.username }} runtimeMaster={runtimeMaster} />;
}
