import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

// Photo sharing is optional; missing configuration must not prevent gameplay.
export function getSupabase() {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("Photo sharing is not configured for this site.");
  }

  client = createClient(url, key);
  return client;
}
