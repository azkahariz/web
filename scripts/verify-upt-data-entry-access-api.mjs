import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";

const url = process.env.SUPABASE_URL?.trim();
const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim();

function localRoleToken(role) {
  if (!jwtSecret) return "";
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, iss: "supabase", iat: now, exp: now + 3600 })}`;
  return `${unsigned}.${createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")}`;
}

const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || localRoleToken("anon");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || localRoleToken("service_role");
if (!url || !anonKey || !serviceRoleKey) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY lokal wajib tersedia.");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(url)) throw new Error("Verifier API hanya boleh dijalankan terhadap Supabase lokal.");

const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const stationClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const adminClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID();
const stationUserId = randomUUID();
const adminUserId = randomUUID();
const stationId = randomUUID();
const siteTypeId = randomUUID();
const siteId = randomUUID();
const subtypeId = randomUUID();
const sessionId = randomUUID();
const adminSessionId = randomUUID();
const password = `Verify-${suffix}-A1!`;
const stationEmail = `station-${suffix}@verify.invalid`;
const adminEmail = `admin-${suffix}@verify.invalid`;

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function expectClosed(promise, label) {
  const { error } = await promise;
  assert(error?.code === "42501" && error.message.includes("upt_data_entry_closed"), `${label} tidak ditolak dengan contract akses tertutup.`);
}

let submissionId = null;
try {
  for (const user of [{ id: stationUserId, email: stationEmail }, { id: adminUserId, email: adminEmail }]) {
    const { error } = await service.auth.admin.createUser({ id: user.id, email: user.email, password, email_confirm: true });
    if (error) throw error;
  }
  for (const [table, row] of [
    ["stations", { id: stationId, name: `API Verifier Station ${suffix}` }],
    ["site_types", { id: siteTypeId, name: `API Verifier Type ${suffix}` }],
    ["sites", { id: siteId, station_id: stationId, site_type_id: siteTypeId, name: `API Verifier Site ${suffix}` }],
    ["site_subtypes", { id: subtypeId, site_type_id: siteTypeId, name: `API Verifier Subtype ${suffix}` }],
    ["station_accounts", { auth_user_id: stationUserId, station_id: stationId, username: `api-station-${suffix}` }],
    ["super_admins", { auth_user_id: adminUserId, username: `api-admin-${suffix}` }],
  ]) {
    const { error } = await service.from(table).insert(row);
    if (error) throw error;
  }

  const stationSignIn = await stationClient.auth.signInWithPassword({ email: stationEmail, password });
  const adminSignIn = await adminClient.auth.signInWithPassword({ email: adminEmail, password });
  if (stationSignIn.error) throw stationSignIn.error;
  if (adminSignIn.error) throw adminSignIn.error;

  let result = await adminClient.rpc("set_upt_data_entry_enabled", { p_enabled: true });
  if (result.error) throw result.error;
  result = await stationClient.rpc("open_submission", {
    p_site_id: siteId,
    p_site_subtype_id: subtypeId,
    p_session_id: sessionId,
    p_operator_name: "API Verifier",
  });
  if (result.error) throw result.error;
  const opened = Array.isArray(result.data) ? result.data[0] : result.data;
  assert(opened?.can_edit === true, "Direct API open saat ON gagal.");
  submissionId = opened.submission_id;

  result = await adminClient.rpc("set_upt_data_entry_enabled", { p_enabled: false });
  if (result.error) throw result.error;
  await expectClosed(stationClient.rpc("get_submission_state", { p_site_id: siteId, p_site_subtype_id: subtypeId }), "Direct API form read");
  await expectClosed(stationClient.rpc("open_submission", { p_site_id: siteId, p_site_subtype_id: subtypeId, p_session_id: randomUUID(), p_operator_name: "Blocked" }), "Direct API ensure/open");
  await expectClosed(stationClient.rpc("touch_submission_lock", { p_site_id: siteId, p_site_subtype_id: subtypeId, p_session_id: sessionId, p_operator_name: "Blocked" }), "Direct API heartbeat");
  await expectClosed(stationClient.rpc("save_submission", { p_site_id: siteId, p_site_subtype_id: subtypeId, p_session_id: sessionId, p_expected_version: opened.version, p_payload: { schemaVersion: 1, inventory: { blocked: true } }, p_operator_name: "Blocked" }), "Direct API save");
  await expectClosed(stationClient.rpc("create_product_proposal", { p_site_id: siteId, p_site_subtype_id: subtypeId, p_brand: "Blocked", p_model: "Blocked", p_operator_name: "Blocked", p_note: null }), "Direct API proposal");
  const forbiddenToggle = await stationClient.rpc("set_upt_data_entry_enabled", { p_enabled: true });
  assert(forbiddenToggle.error?.code === "42501", "Station dapat mengubah toggle melalui direct API.");

  const release = await stationClient.rpc("release_submission_lock", { p_site_id: siteId, p_site_subtype_id: subtypeId, p_session_id: sessionId });
  assert(!release.error && release.data === true, "Direct API release lock saat OFF gagal.");
  const adminOpen = await adminClient.rpc("admin_open_submission", { p_submission_id: submissionId, p_session_id: adminSessionId, p_operator_name: "API Verifier Admin" });
  const adminOpened = Array.isArray(adminOpen.data) ? adminOpen.data[0] : adminOpen.data;
  assert(!adminOpen.error && adminOpened?.can_edit === true, "Direct API Admin ikut terblokir saat OFF.");
  await adminClient.rpc("admin_release_submission_lock", { p_submission_id: submissionId, p_session_id: adminSessionId });

  const stored = await service.from("submissions").select("version, payload").eq("id", submissionId).single();
  assert(!stored.error && stored.data.version === opened.version && stored.data.payload?.inventory?.blocked !== true, "Direct API denial mengubah submission.");
  result = await adminClient.rpc("set_upt_data_entry_enabled", { p_enabled: true });
  if (result.error) throw result.error;
} finally {
  await service.from("upt_data_entry_access").update({ enabled: true, updated_by: null }).eq("singleton", true);
  await service.from("admin_audit_log").delete().eq("admin_auth_user_id", adminUserId);
  if (submissionId) await service.from("submissions").delete().eq("id", submissionId);
  await service.from("product_proposals").delete().eq("station_id", stationId);
  await service.from("station_accounts").delete().eq("auth_user_id", stationUserId);
  await service.from("super_admins").delete().eq("auth_user_id", adminUserId);
  await service.from("site_subtypes").delete().eq("id", subtypeId);
  await service.from("sites").delete().eq("id", siteId);
  await service.from("site_types").delete().eq("id", siteTypeId);
  await service.from("stations").delete().eq("id", stationId);
  await service.auth.admin.deleteUser(stationUserId);
  await service.auth.admin.deleteUser(adminUserId);
}

console.log("Verifikasi direct PostgREST akses UPT lulus; data uji lokal telah dibersihkan.");
