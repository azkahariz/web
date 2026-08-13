export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

export function resolveRemoteDatabaseUrl(environment = process.env) {
  const url = environment.SUPABASE_DB_POOLER_URL?.trim() || environment.SUPABASE_DB_URL?.trim();
  if (!url) {
    throw new Error("SUPABASE_DB_POOLER_URL tidak tersedia. Isi Session Pooler connection string di .env.local atau set environment variable secara eksplisit.");
  }
  const parsed = new URL(url);
  if (isLocalHost(parsed.hostname)) {
    throw new Error("Connection sync:master harus menunjuk database remote; URL localhost tidak diizinkan.");
  }
  return url;
}

export function databaseIsLocal(databaseUrl) {
  return isLocalHost(new URL(databaseUrl).hostname);
}
