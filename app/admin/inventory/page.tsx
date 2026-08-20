import { notFound, redirect } from "next/navigation";
import InventoryApp from "../../InventoryApp";
import { loadAdminRuntimeMaster } from "../../lib/admin-inventory-master";
import { getAllowedSiteSubtypes } from "../../lib/site-subtypes";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function AdminInventoryPage({ searchParams }: {
  searchParams: Promise<{ siteId?: string; subtypeId?: string }>;
}) {
  const { siteId, subtypeId } = await searchParams;
  if (!siteId || !subtypeId) notFound();
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/");
  const { data: admin } = await supabase.from("super_admins")
    .select("id, username")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!admin) redirect("/");
  const { data: site } = await supabase.from("sites").select("id, station_id, site_type_id, name, active").eq("id", siteId).maybeSingle();
  if (!site?.active) notFound();
  const runtimeMaster = await loadAdminRuntimeMaster(supabase, site.station_id).catch(() => null);
  if (!runtimeMaster) notFound();
  const runtimeSite = runtimeMaster.stationSites.find((row) => row.siteId === site.id);
  if (!runtimeSite) notFound();
  const subtype = getAllowedSiteSubtypes({
    siteName: runtimeSite.site,
    siteTypeName: runtimeSite.siteType,
    siteSubtypes: runtimeMaster.siteSubtypes.filter((row) => row.siteTypeId === runtimeSite.siteTypeId),
    getSubtypeName: (row) => row.subtype,
  }).find((row) => row.subtypeId === subtypeId);
  if (!subtype) notFound();
  return <InventoryApp
    account={{ id: admin.id, stationId: runtimeMaster.station.id, stationName: runtimeMaster.station.name, username: admin.username }}
    adminMode
    runtimeMaster={runtimeMaster}
    initialSiteId={runtimeSite.siteId}
    initialSubtypeId={subtype.subtypeId}
  />;
}
