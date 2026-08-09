import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  const config = getPublicSupabaseConfig();
  if (!config) return null;
  browserClient ??= createBrowserClient(config.url, config.publishableKey);
  return browserClient;
}

