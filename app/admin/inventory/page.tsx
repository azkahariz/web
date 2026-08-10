import { notFound, redirect } from "next/navigation";
import InventoryApp from "../../InventoryApp";
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
  const { data: site } = await supabase.from("sites").select("id, station_id, site_type_id, name").eq("id", siteId).maybeSingle();
  if (!site) notFound();
  const [{ data: station }, { data: siteType }, { data: siteTypeSubtypes }] = await Promise.all([
    supabase.from("stations").select("name").eq("id", site.station_id).maybeSingle(),
    supabase.from("site_types").select("name").eq("id", site.site_type_id).maybeSingle(),
    supabase.from("site_subtypes").select("id, site_type_id, name").eq("site_type_id", site.site_type_id),
  ]);
  if (!station || !siteType) notFound();
  const subtype = getAllowedSiteSubtypes({
    siteName: site.name,
    siteTypeName: siteType.name,
    siteSubtypes: siteTypeSubtypes ?? [],
    getSubtypeName: (row) => row.name,
  }).find((row) => row.id === subtypeId);
  if (!subtype) notFound();
  return <InventoryApp
    account={{ id: admin.id, stationId: site.station_id, stationName: station.name, username: admin.username }}
    adminMode
    initialSite={site.name}
    initialSubtype={subtype.name}
  />;
}
