import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normaliseRow, type DailyRow } from "@/lib/metrics";
import { londonStartOfDay } from "@/lib/dates";

// Every getter authorises first (Data Access Layer pattern), then queries as the
// user so RLS is the second line of defence.

export type Client = {
  id: string;
  name: string;
  slug: string;
  crm_provider: "ghl" | "zoho" | null;
  crm_account_id: string | null;
  is_active: boolean;
  is_demo: boolean;
};
export type Segment = { id: string; client_id: string; name: string; kind: string; is_default: boolean };

const PAGE = 1000; // Supabase's default max rows per request

async function db() {
  await getCurrentUser();
  return createClient();
}

export async function getClients(): Promise<Client[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, slug, crm_provider, crm_account_id, is_active, is_demo")
    .order("is_demo")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, slug, crm_provider, crm_account_id, is_active, is_demo")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSegments(clientId?: string): Promise<Segment[]> {
  const supabase = await db();
  let q = supabase.from("segments").select("id, client_id, name, kind, is_default").order("is_default").order("name");
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** segment_daily rows in [from, to], paged past the 1000-row cap. */
export async function getDaily(opts: { from: string; to: string; clientId?: string }): Promise<DailyRow[]> {
  const supabase = await db();
  const rows: DailyRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("segment_daily")
      .select("*")
      .gte("date", opts.from)
      .lte("date", opts.to)
      .order("date")
      .order("client_id")
      .order("segment_id")
      .range(offset, offset + PAGE - 1);
    if (opts.clientId) q = q.eq("client_id", opts.clientId);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []).map(normaliseRow));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export type LeadRow = {
  id: string;
  client_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  channel: string | null;
  stage_name: string | null;
  lifecycle: string;
  value: number | null;
  crm_created_at: string;
  segment_id: string | null;
  attributed_campaign_name: string | null;
  attributed_ad_name: string | null;
  attribution_method: string;
};

export async function getLeads(opts: {
  from: string;
  to: string;
  clientId?: string;
  segmentId?: string;
  limit?: number;
}): Promise<{ rows: LeadRow[]; total: number }> {
  const supabase = await db();
  // Dates are London calendar days, matching segment_daily.
  const nextDay = new Date(Date.parse(`${opts.to}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  let q = supabase
    .from("lead_attribution")
    .select(
      "id, client_id, first_name, last_name, email, phone, source, channel, stage_name, lifecycle, value, crm_created_at, segment_id, attributed_campaign_name, attributed_ad_name, attribution_method",
      { count: "exact" },
    )
    .gte("crm_created_at", londonStartOfDay(opts.from))
    .lt("crm_created_at", londonStartOfDay(nextDay))
    .order("crm_created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (opts.segmentId) q = q.eq("segment_id", opts.segmentId);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as LeadRow[], total: count ?? 0 };
}

export async function getSettingsData() {
  const supabase = await db();
  const [accounts, rules, mappings, runs] = await Promise.all([
    supabase.from("meta_ad_accounts").select("id, client_id, name, currency, default_segment_id, is_active, last_synced_at").order("name"),
    supabase.from("segment_rules").select("id, segment_id, ad_account_id, match_type, pattern, priority").order("priority"),
    supabase.from("stage_mappings").select("id, client_id, pipeline_name, stage_name, lifecycle").order("client_id").order("pipeline_name", { nullsFirst: true }).order("stage_name"),
    supabase.from("sync_runs").select("id, source, client_id, status, started_at, finished_at, error, stats").order("started_at", { ascending: false }).limit(15),
  ]);
  for (const r of [accounts, rules, mappings, runs]) if (r.error) throw r.error;
  return { accounts: accounts.data ?? [], rules: rules.data ?? [], mappings: mappings.data ?? [], runs: runs.data ?? [] };
}

export type ConnectionStatus = {
  client_id: string;
  provider: string;
  account_id: string;
  token_hint: string | null;
  status: "untested" | "ok" | "error";
  last_error: string | null;
  last_synced_at: string | null;
};

/**
 * CRM connection health (never the token). The table is service-only, so read
 * it with the admin client after the auth check. `null` = the table doesn't
 * exist yet (database update not run) or the secret key is missing.
 */
export async function getConnections(): Promise<ConnectionStatus[] | null> {
  await getCurrentUser();
  if (!(process.env.SUPABASE_SECRET_KEY ?? "").trim()) return null;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data, error } = await createAdminClient()
    .from("crm_connections")
    .select("client_id, provider, account_id, token_hint, status, last_error, last_synced_at");
  if (error?.code === "PGRST205" || error?.code === "42P01") return null;
  if (error) throw error;
  return (data ?? []) as ConnectionStatus[];
}

/** Which server-side settings exist (values never leave the server). */
export async function getSetupChecks() {
  await getCurrentUser();
  const has = (k: string, min = 1) => (process.env[k] ?? "").trim().length >= min;
  return {
    secretKey: has("SUPABASE_SECRET_KEY"),
    encryptionKey: has("TOKEN_ENCRYPTION_KEY", 32),
    metaToken: has("META_ACCESS_TOKEN"),
    cronSecret: has("CRON_SECRET", 16),
  };
}
