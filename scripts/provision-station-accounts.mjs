import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

if (!supabaseUrl || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY wajib tersedia di .env.local.");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function slugify(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 48) || "stasiun";
}

function uniqueUsername(stationName, used) {
  const base = slugify(stationName);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base.slice(0, 44)}.${suffix++}`;
  used.add(candidate);
  return candidate;
}

function generatePassword() {
  return `${randomBytes(9).toString("base64url")}aA7!`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const [{ data: stations, error: stationError }, { data: accounts, error: accountError }] = await Promise.all([
  supabase.from("stations").select("id, name").eq("active", true).order("name"),
  supabase.from("station_accounts").select("station_id, username"),
]);
if (stationError) throw stationError;
if (accountError) throw accountError;

const existingStationIds = new Set(accounts.map((row) => row.station_id));
const usedUsernames = new Set(accounts.map((row) => row.username.toLowerCase()));
const credentials = [];
let skipped = 0;

for (const station of stations) {
  if (existingStationIds.has(station.id)) {
    skipped += 1;
    continue;
  }
  const username = uniqueUsername(station.name, usedUsernames);
  const password = generatePassword();
  const email = `${username}@stations.aloptama.internal`;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_type: "station" },
  });
  if (authError) throw new Error(`Gagal membuat Auth user untuk ${station.name}: ${authError.message}`);

  const { error: insertError } = await supabase.from("station_accounts").insert({
    auth_user_id: authData.user.id,
    station_id: station.id,
    username,
  });
  if (insertError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw new Error(`Gagal menghubungkan akun ${station.name}: ${insertError.message}`);
  }
  credentials.push({ station: station.name, username, password });
}

const outputDirectory = path.join(projectRoot, "private-output");
const outputPath = path.join(outputDirectory, "station-credentials.csv");
await mkdir(outputDirectory, { recursive: true });
const rows = [["Nama Stasiun", "Username", "Password"], ...credentials.map((row) => [row.station, row.username, row.password])];
await writeFile(outputPath, `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`, "utf8");

console.log(`Provisioning selesai: ${credentials.length} akun baru, ${skipped} akun dilewati.`);
console.log(`Kredensial tersimpan di private-output/station-credentials.csv (diabaikan Git).`);

