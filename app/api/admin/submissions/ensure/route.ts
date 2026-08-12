import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { getPublicSupabaseConfig } from "../../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAllowedSiteSubtypes } from "../../../../lib/site-subtypes";

export async function POST(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const config = getPublicSupabaseConfig();
  const sessionClient = bearer && config
    ? createClient(config.url, config.publishableKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    : await createSupabaseServerClient();
  const serviceClient = createSupabaseAdminClient();
  if (!sessionClient || !serviceClient) return NextResponse.json({ error: "Konfigurasi server admin belum tersedia." }, { status: 503 });
  const { data: userData } = await sessionClient.auth.getUser(bearer);
  if (!userData.user) return NextResponse.json({ error: "Belum login." }, { status: 401 });
  const { data: isAdmin } = await sessionClient.rpc("is_super_admin", { p_auth_user_id: userData.user.id });
  if (!isAdmin) return NextResponse.json({ error: "Akses Super Admin diperlukan." }, { status: 403 });

  const body = await request.json() as {
    stationId?: string;
    siteId?: string;
    siteSubtypeId?: string;
    sessionId?: string;
    operatorName?: string;
  };
  if (!body.stationId || !body.siteId || !body.siteSubtypeId || !body.sessionId) {
    return NextResponse.json({ error: "Target edit tidak lengkap." }, { status: 400 });
  }
  const { data: site } = await serviceClient.from("sites")
    .select("id, station_id, site_type_id, name, active")
    .eq("id", body.siteId)
    .eq("station_id", body.stationId)
    .maybeSingle();
  if (!site || !site.active) {
    return NextResponse.json({ error: "Site/Subtipe tidak valid atau tidak aktif." }, { status: 400 });
  }
  const [{ data: siteType }, { data: siteTypeSubtypes }] = await Promise.all([
    serviceClient.from("site_types").select("id, name, active").eq("id", site.site_type_id).maybeSingle(),
    serviceClient.from("site_subtypes").select("id, site_type_id, name, active").eq("site_type_id", site.site_type_id).eq("active", true),
  ]);
  const allowedSubtypes = siteType?.active ? getAllowedSiteSubtypes({
    siteName: site.name,
    siteTypeName: siteType.name,
    siteSubtypes: siteTypeSubtypes ?? [],
    getSubtypeName: (subtype) => subtype.name,
  }) : [];
  if (!allowedSubtypes.some((subtype) => subtype.id === body.siteSubtypeId)) {
    return NextResponse.json({ error: "Subtipe tidak valid untuk variant Site tersebut." }, { status: 400 });
  }

  const { error: ensureError } = await serviceClient.from("submissions").upsert({
    station_id: body.stationId,
    site_id: body.siteId,
    site_subtype_id: body.siteSubtypeId,
  }, { onConflict: "station_id,site_id,site_subtype_id", ignoreDuplicates: true });
  if (ensureError) return NextResponse.json({ error: ensureError.message }, { status: 400 });
  const { data: submission } = await serviceClient.from("submissions")
    .select("id, archived_at")
    .eq("station_id", body.stationId)
    .eq("site_id", body.siteId)
    .eq("site_subtype_id", body.siteSubtypeId)
    .single();
  if (!submission) return NextResponse.json({ error: "Submission tidak dapat dibuka." }, { status: 500 });
  if (submission.archived_at) {
    return NextResponse.json({ error: "Submission ini sedang diarsipkan. Pulihkan melalui tab Submission sebelum mengedit." }, { status: 409 });
  }

  const { data: openRows, error: openError } = await sessionClient.rpc("admin_open_submission", {
    p_submission_id: submission.id,
    p_session_id: body.sessionId,
    p_operator_name: body.operatorName || "Super Admin",
  });
  if (openError) return NextResponse.json({ error: openError.message }, { status: 400 });
  const open = Array.isArray(openRows) ? openRows[0] : openRows;
  return NextResponse.json({ submissionId: submission.id, canEdit: Boolean(open?.can_edit) });
}
