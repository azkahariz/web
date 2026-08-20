import { notFound, redirect } from "next/navigation";
import InventoryApp from "../../../InventoryApp";
import { loadAdminRuntimeMaster } from "../../../lib/admin-inventory-master";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export default async function AdminSubmissionPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
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

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, station_id, site_id, site_subtype_id")
    .eq("id", id)
    .maybeSingle();
  if (!submission) notFound();
  const runtimeMaster = await loadAdminRuntimeMaster(supabase, submission.station_id).catch(() => null);
  if (!runtimeMaster) notFound();
  const runtimeSite = runtimeMaster.stationSites.find((row) => row.siteId === submission.site_id);
  if (!runtimeSite) notFound();

  return <InventoryApp
    key={submission.id}
    account={{ id: admin.id, stationId: runtimeMaster.station.id, stationName: runtimeMaster.station.name, username: admin.username }}
    adminSubmissionId={submission.id}
    adminMode
    runtimeMaster={runtimeMaster}
    startInEditMode={edit === "1"}
    initialSiteId={runtimeSite.siteId}
    initialSubtypeId={submission.site_subtype_id}
  />;
}
