import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
const username = (process.env.SUPER_ADMIN_USERNAME?.trim().toLowerCase() || "superadmin")
  .replace(/[^a-z0-9._-]+/g, "-");
if (!supabaseUrl || !secretKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY wajib tersedia.");

const client = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: existing, error: existingError } = await client.from("super_admins").select("id").ilike("username", username).maybeSingle();
if (existingError) throw existingError;

let created = 0;
let existingCount = 0;
if (existing) {
  existingCount = 1;
} else {
  const password = `${randomBytes(14).toString("base64url")}aA7!`;
  const email = `${username}@stations.aloptama.internal`;
  const { data: authData, error: authError } = await client.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { account_type: "super_admin" },
  });
  if (authError) throw authError;
  const { error: insertError } = await client.from("super_admins").insert({ auth_user_id: authData.user.id, username });
  if (insertError) {
    await client.auth.admin.deleteUser(authData.user.id);
    throw insertError;
  }
  const outputDirectory = path.join(projectRoot, "private-output");
  const outputPath = path.join(outputDirectory, "super-admin-credentials.csv");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `\uFEFFUsername,Password Awal\r\n${username},${password}\r\n`, "utf8");
  created = 1;
}

if (!created) {
  const outputPath = path.join(projectRoot, "private-output", "super-admin-credentials.csv");
  try { await access(outputPath); } catch { /* Password existing memang tidak dapat dipulihkan. */ }
}
console.log(`Created: ${created}`);
console.log(`Existing: ${existingCount}`);
console.log("Credential baru, jika dibuat, tersimpan di private-output/super-admin-credentials.csv.");
