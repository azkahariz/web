import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const accounts = [
  ["malik", "Malik"],
  ["haryas", "Haryas"],
  ["hendri", "Hendri"],
  ["agha", "Agha"],
  ["imam", "Imam"],
  ["ofan", "Ofan"],
  ["rachel", "Rachel"],
  ["rafi", "Rafi"],
  ["simon", "Simon"],
  ["vian", "Vian"],
  ["yogas", "Yogas"],
  ["eko", "Eko"],
];

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = new Set(process.argv.slice(2));
const targetArg = [...args].find((arg) => arg.startsWith("--target="));
const target = targetArg?.slice("--target=".length);
const apply = args.has("--apply");
const productionConfirmed = args.has("--confirm-production=PROVISION_SUPER_ADMINS");

if (target !== "local" && target !== "remote") {
  throw new Error("Pilih target secara eksplisit: --target=local atau --target=remote.");
}
if (target === "remote" && apply && !productionConfirmed) {
  throw new Error("Provisioning remote membutuhkan --confirm-production=PROVISION_SUPER_ADMINS.");
}

const localUrl = process.env.SUPABASE_LOCAL_URL?.trim() || "http://127.0.0.1:54321";
const remoteUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const url = target === "local" ? localUrl : remoteUrl;
const secretKey = target === "local"
  ? process.env.SUPABASE_LOCAL_SECRET_KEY?.trim()
  : process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !secretKey) {
  throw new Error(target === "local"
    ? "SUPABASE_LOCAL_SECRET_KEY wajib tersedia untuk target local."
    : "NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY wajib tersedia untuk target remote.");
}

const client = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const credentialFilename = target === "remote"
  ? "super-admin-credentials-production.csv"
  : "super-admin-credentials.csv";
const credentialRelativePath = `private-output/${credentialFilename}`;

async function listAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

function temporaryPassword() {
  return `${randomBytes(18).toString("base64url")}aA7!`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const [adminWithDisplayName, authUsers] = await Promise.all([
  client.from("super_admins").select("id, auth_user_id, username, display_name, active"),
  listAuthUsers(),
]);
const adminResult = adminWithDisplayName.error?.code === "42703"
  ? await client.from("super_admins").select("id, auth_user_id, username, active")
  : adminWithDisplayName;
if (adminResult.error) throw adminResult.error;
const adminRows = adminResult.data ?? [];

const adminByUsername = new Map(adminRows.map((admin) => [admin.username.trim().toLowerCase(), admin]));
const authByEmail = new Map(authUsers.map((user) => [user.email?.trim().toLowerCase(), user]));
const credentials = [];
let created = 0;
let linked = 0;
let updated = 0;
let existing = 0;

for (const [username, displayName] of accounts) {
  const email = `${username}@stations.aloptama.internal`;
  const admin = adminByUsername.get(username);
  if (admin) {
    existing += 1;
    if (admin.display_name !== displayName) {
      if (apply) {
        const { error } = await client.from("super_admins").update({ display_name: displayName }).eq("id", admin.id);
        if (error) throw error;
      }
      updated += 1;
    }
    continue;
  }

  const authUser = authByEmail.get(email);
  if (authUser) {
    if (apply) {
      const { error } = await client.from("super_admins").insert({
        auth_user_id: authUser.id,
        username,
        display_name: displayName,
      });
      if (error) throw error;
    }
    linked += 1;
    continue;
  }

  if (!apply) {
    created += 1;
    continue;
  }

  const password = temporaryPassword();
  const { data: authData, error: authError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_type: "super_admin", display_name: displayName },
  });
  if (authError) throw authError;
  const { error: insertError } = await client.from("super_admins").insert({
    auth_user_id: authData.user.id,
    username,
    display_name: displayName,
  });
  if (insertError) {
    await client.auth.admin.deleteUser(authData.user.id);
    throw insertError;
  }
  credentials.push([displayName, username, email, password]);
  created += 1;
}

if (apply && credentials.length) {
  const outputDirectory = path.join(projectRoot, "private-output");
  const outputPath = path.join(outputDirectory, credentialFilename);
  await mkdir(outputDirectory, { recursive: true });
  let previousRows = "";
  try {
    const previous = await readFile(outputPath, "utf8");
    previousRows = previous.replace(/^\uFEFF?Nama,Username,Internal Login Identity,Temporary Password\r?\n/, "").trim();
  } catch {
    // File belum ada; hanya credential baru pada run ini yang akan ditulis.
  }
  const newRows = credentials.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const rows = [previousRows, newRows].filter(Boolean).join("\r\n");
  await writeFile(outputPath, `\uFEFFNama,Username,Internal Login Identity,Temporary Password\r\n${rows}\r\n`, "utf8");
}

console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`Target: ${target}`);
console.log(`Existing: ${existing}`);
console.log(`Create: ${created}`);
console.log(`Link existing Auth user: ${linked}`);
console.log(`Update display name: ${updated}`);
if (apply && credentials.length) {
  console.log(`Credential baru tersimpan di ${credentialRelativePath}.`);
}
