import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "./config";

export function createSupabaseAdminClient() {
  const config = getPublicSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config || !secretKey) return null;
  return createClient(config.url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
