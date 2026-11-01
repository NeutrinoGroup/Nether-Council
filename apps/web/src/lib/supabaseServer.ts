import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SupabaseConfigError extends Error {}

let client: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return null;
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function supabaseServer(): SupabaseClient {
  const instance = getSupabaseServerClient();
  if (!instance) {
    const missing = [
      !(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && "SUPABASE_URL",
      !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY) && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean);
    throw new SupabaseConfigError(`Supabase is not configured: missing ${missing.join(", ")}`);
  }
  return instance;
}

export function resetSupabaseServerForTests(): void {
  client = null;
}
