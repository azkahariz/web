import { redirect } from "next/navigation";
import AdminDashboard from "./AdminDashboard";
import { createSupabaseServerClient } from "../lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/");
  const { data: admin } = await supabase
    .from("super_admins")
    .select("id, username")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!admin) redirect("/");
  return <AdminDashboard username={admin.username} />;
}
