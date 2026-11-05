import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env";

/**
 * Service client for sync jobs. Bypasses RLS — only use in server code that has
 * already authorised the caller (cron secret or admin check).
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secret) throw new Error("SUPABASE_SECRET_KEY / NEXT_PUBLIC_SUPABASE_URL not set");
  return createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
