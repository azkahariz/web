import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
const baseUrl = process.env.ADMIN_VERIFY_BASE_URL?.trim() || "http://127.0.0.1:3000";
if (!url || !publishableKey || !secretKey) throw new Error("Environment Supabase wajib tersedia.");

const credentialText = await readFile(path.join(projectRoot, "private-output", "super-admin-credentials.csv"), "utf8");
const credentialLine = credentialText.replace(/^\uFEFF/, "").trim().split(/\r?\n/)[1];
if (!credentialLine) throw new Error("Credential Super Admin lokal tidak tersedia untuk API verification.");
const [adminUsername, adminPassword] = credentialLine.split(",");
const service = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const publicAdmin = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
const publicStation = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = randomUUID().slice(0, 8);
const stationName = `VERIFY ADMIN API ${suffix}`;
const stationUsername = `verify.admin.api.${suffix}`;
const initialPassword = `Initial-${randomUUID()}aA7!`;
let stationId;
let accountId;
let authUserId;

try {
  const { data: station, error: stationError } = await service.from("stations").insert({ name: stationName }).select("id").single();
  if (stationError) throw stationError;
  stationId = station.id;
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email: `${stationUsername}@stations.aloptama.internal`, password: initialPassword, email_confirm: true,
  });
  if (authError) throw authError;
  authUserId = authData.user.id;
  const { data: account, error: accountError } = await service.from("station_accounts").insert({
    auth_user_id: authUserId, station_id: stationId, username: stationUsername,
  }).select("id").single();
  if (accountError) throw accountError;
  accountId = account.id;

  const stationLogin = await publicStation.auth.signInWithPassword({
    email: `${stationUsername}@stations.aloptama.internal`, password: initialPassword,
  });
  if (stationLogin.error) throw stationLogin.error;
  const denied = await fetch(`${baseUrl}/api/admin/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${stationLogin.data.session.access_token}` },
    body: JSON.stringify({ action: "reset-password", accountId }),
  });
  if (denied.status !== 403) throw new Error(`Station User seharusnya mendapat 403, bukan ${denied.status}.`);

  const adminLogin = await publicAdmin.auth.signInWithPassword({
    email: `${adminUsername}@stations.aloptama.internal`, password: adminPassword,
  });
  if (adminLogin.error) throw adminLogin.error;
  const reset = await fetch(`${baseUrl}/api/admin/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminLogin.data.session.access_token}` },
    body: JSON.stringify({ action: "reset-password", accountId }),
  });
  const resetBody = await reset.json();
  if (!reset.ok || !resetBody.temporaryPassword) throw new Error(resetBody.error || "Admin reset password gagal.");
  const relogin = await publicStation.auth.signInWithPassword({
    email: `${stationUsername}@stations.aloptama.internal`, password: resetBody.temporaryPassword,
  });
  if (relogin.error) throw new Error("Password baru tidak dapat digunakan.");
} finally {
  if (accountId) {
    await service.from("admin_audit_log").delete().eq("target_id", accountId);
    await service.from("station_accounts").delete().eq("id", accountId);
  }
  if (authUserId) await service.auth.admin.deleteUser(authUserId);
  if (stationId) await service.from("stations").delete().eq("id", stationId);
}

console.log("Verifikasi API admin lulus; Station User ditolak, reset password admin berhasil, dan fixture dibersihkan.");
