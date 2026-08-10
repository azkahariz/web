import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { stationEmailForUsername } from "../../../lib/auth";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { getPublicSupabaseConfig } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function password() {
  return `${randomBytes(12).toString("base64url")}aA7!`;
}

function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 48) || "stasiun";
}

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

  const body = await request.json() as { action?: string; accountId?: string; stationId?: string; active?: boolean };
  if (body.action === "set-active" && body.accountId && typeof body.active === "boolean") {
    const { error } = await serviceClient.from("station_accounts").update({ active: body.active }).eq("id", body.accountId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await serviceClient.from("admin_audit_log").insert({
      admin_auth_user_id: userData.user.id,
      action: body.active ? "ENABLE_STATION_ACCOUNT" : "DISABLE_STATION_ACCOUNT",
      target_type: "station_account",
      target_id: body.accountId,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reset-password" && body.accountId) {
    const { data: account } = await serviceClient.from("station_accounts").select("auth_user_id, username").eq("id", body.accountId).single();
    if (!account) return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
    const temporaryPassword = password();
    const { error } = await serviceClient.auth.admin.updateUserById(account.auth_user_id, { password: temporaryPassword });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await serviceClient.from("admin_audit_log").insert({
      admin_auth_user_id: userData.user.id,
      action: "RESET_STATION_PASSWORD",
      target_type: "station_account",
      target_id: body.accountId,
      metadata: {},
    });
    return NextResponse.json({ ok: true, username: account.username, temporaryPassword });
  }

  if (body.action === "provision" && body.stationId) {
    const { data: existing } = await serviceClient.from("station_accounts").select("id").eq("station_id", body.stationId).maybeSingle();
    if (existing) return NextResponse.json({ error: "Stasiun sudah mempunyai akun." }, { status: 409 });
    const { data: station } = await serviceClient.from("stations").select("name").eq("id", body.stationId).single();
    if (!station) return NextResponse.json({ error: "Stasiun tidak ditemukan." }, { status: 404 });
    const base = slugify(station.name);
    const { data: usedRows } = await serviceClient.from("station_accounts").select("username").ilike("username", `${base}%`);
    const used = new Set((usedRows ?? []).map((row) => row.username.toLowerCase()));
    let username = base;
    let suffix = 2;
    while (used.has(username)) username = `${base.slice(0, 44)}.${suffix++}`;
    const temporaryPassword = password();
    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email: stationEmailForUsername(username), password: temporaryPassword, email_confirm: true,
      user_metadata: { account_type: "station" },
    });
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });
    const { data: account, error: insertError } = await serviceClient.from("station_accounts").insert({
      auth_user_id: authData.user.id, station_id: body.stationId, username,
    }).select("id").single();
    if (insertError) {
      await serviceClient.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
    await serviceClient.from("admin_audit_log").insert({
      admin_auth_user_id: userData.user.id,
      action: "PROVISION_STATION_ACCOUNT",
      target_type: "station_account",
      target_id: account.id,
      metadata: { station_id: body.stationId, username },
    });
    return NextResponse.json({ ok: true, username, temporaryPassword });
  }

  return NextResponse.json({ error: "Aksi tidak valid." }, { status: 400 });
}
