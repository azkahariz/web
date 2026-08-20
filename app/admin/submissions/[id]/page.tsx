import { notFound, redirect } from "next/navigation";
import InventoryApp from "../../../InventoryApp";
import { adminInventoryMaster } from "../../../lib/admin-inventory-master";
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
  const [{ data: station }, { data: site }, { data: subtype }] = await Promise.all([
    supabase.from("stations").select("name").eq("id", submission.station_id).single(),
    supabase.from("sites").select("name").eq("id", submission.site_id).single(),
    supabase.from("site_subtypes").select("name").eq("id", submission.site_subtype_id).single(),
  ]);
  if (!station || !site || !subtype) notFound();

  return <InventoryApp
    key={submission.id}
    account={{ id: admin.id, stationId: submission.station_id, stationName: station.name, username: admin.username }}
    adminSubmissionId={submission.id}
    adminMode
    runtimeMaster={adminInventoryMaster(submission.station_id, station.name)}
    startInEditMode={edit === "1"}
    initialSite={site.name}
    initialSubtype={subtype.name}
  />;
}
