import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCrmAdapter } from "@/lib/crm";
import { suggestLifecycle } from "@/lib/crm/stages";
import type { CrmClientConfig, CrmProvider } from "@/lib/crm/types";
import { decryptSecret } from "@/lib/crypto";
import { META_BACKFILL_DAYS, META_REFRESH_DAYS, syncMetaAccount } from "@/lib/meta/sync";
import { upsertLeads } from "./upsert-leads";

const DAY = 86_400_000;
const londonDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));


/** Wraps a unit of work in a sync_runs row so every run is visible in Settings. */
async function recorded<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  source: string,
  clientId: string,
  work: () => Promise<T>,
): Promise<{ ok: true; stats: T } | { ok: false; error: string }> {
  const { data: run } = await admin.from("sync_runs").insert({ source, client_id: clientId }).select("id").single();
  try {
    const stats = await work();
    await admin.from("sync_runs").update({ status: "success", finished_at: new Date().toISOString(), stats }).eq("id", run?.id);
    return { ok: true, stats };
  } catch (e) {
    const error = errorText(e);
    console.error(`Sync failed: ${source} ${clientId}`, error);
    await admin.from("sync_runs").update({ status: "error", finished_at: new Date().toISOString(), error }).eq("id", run?.id);
    return { ok: false, error };
  }
}

// ─── Meta ───────────────────────────────────────────────────────────────────

export async function syncClientMeta(admin: SupabaseClient, clientId: string, opts: { full?: boolean } = {}) {
  const { data: accounts, error } = await admin
    .from("meta_ad_accounts")
    .select("id, last_synced_at")
    .eq("client_id", clientId)
    .eq("is_active", true);
  if (error) throw error;
  const results = [];
  for (const a of accounts ?? []) {
    const days = opts.full || !a.last_synced_at ? META_BACKFILL_DAYS : META_REFRESH_DAYS;
    const now = new Date();
    const range = { since: londonDate(new Date(now.getTime() - (days - 1) * DAY)), until: londonDate(now) };
    results.push({ account: a.id, ...(await recorded(admin, "meta", clientId, () => syncMetaAccount(admin, a.id, range))) });
  }
  return results;
}

// ─── CRM ────────────────────────────────────────────────────────────────────

export async function getCrmConfig(admin: SupabaseClient, clientId: string): Promise<CrmClientConfig | null> {
  const { data, error } = await admin
    .from("crm_connections")
    .select("provider, account_id, token_ciphertext, clients!inner(id, slug)")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const client = data.clients as unknown as { id: string; slug: string };
  return {
    id: client.id,
    slug: client.slug,
    crm_provider: data.provider as CrmProvider,
    crm_account_id: data.account_id,
    token: decryptSecret(data.token_ciphertext),
  };
}

/** Adds a mapping for any CRM stage we haven't seen, using a best guess. Never overwrites edits. */
export async function ensureStageMappings(admin: SupabaseClient, clientId: string, stages: { pipeline_name: string; stage_name: string }[]) {
  const { data: existing } = await admin.from("stage_mappings").select("pipeline_name, stage_name").eq("client_id", clientId);
  const key = (p: string | null, s: string) => `${(p ?? "").toLowerCase()}|${s.toLowerCase()}`;
  const have = new Set((existing ?? []).map((m) => key(m.pipeline_name, m.stage_name)));
  const add = new Map<string, { client_id: string; pipeline_name: string; stage_name: string; lifecycle: string }>();
  for (const s of stages) {
    const k = key(s.pipeline_name, s.stage_name);
    // Unrecognised names are still listed (as "new") so they can be corrected in Settings.
    const lifecycle = suggestLifecycle(s.stage_name) ?? "new";
    if (!have.has(k)) add.set(k, { client_id: clientId, pipeline_name: s.pipeline_name, stage_name: s.stage_name, lifecycle });
  }
  if (add.size) {
    const { error } = await admin.from("stage_mappings").insert([...add.values()]);
    if (error) throw new Error(`Saving stage mappings failed: ${error.message}`);
  }
  return add.size;
}

export const CRM_BACKFILL_DAYS = 90;

export async function syncClientCrm(admin: SupabaseClient, clientId: string, opts: { full?: boolean } = {}) {
  const config = await getCrmConfig(admin, clientId);
  if (!config) return null;
  const adapter = await getCrmAdapter(config.crm_provider);

  const result = await recorded(admin, config.crm_provider, clientId, async () => {
    const { data: conn } = await admin.from("crm_connections").select("last_synced_at").eq("client_id", clientId).single();
    // Incremental: re-read a day of overlap so nothing slips between runs.
    const since =
      opts.full || !conn?.last_synced_at
        ? new Date(Date.now() - CRM_BACKFILL_DAYS * DAY)
        : new Date(new Date(conn.last_synced_at).getTime() - DAY);

    const stageNames = await adapter.fetchStageNames(config);
    const mappingsAdded = await ensureStageMappings(admin, clientId, stageNames);
    const { leads, stages } = await adapter.fetchLeads(config, { since });
    const written = await upsertLeads(admin, leads);

    let stagesUpdated = 0;
    for (let i = 0; i < stages.length; i += 1000) {
      const { data, error } = await admin.rpc("apply_lead_stages", { p_client_id: clientId, p_rows: stages.slice(i, i + 1000) });
      if (error) throw new Error(`Updating lead stages failed: ${error.message}`);
      stagesUpdated += Number(data) || 0;
    }
    return {
      since: since.toISOString(),
      leads: written,
      attributed_to_meta: leads.filter((l) => l.meta_campaign_id || l.meta_ad_id || l.meta_adset_id || l.utm_campaign).length,
      older_leads_stage_updated: stagesUpdated,
      stage_mappings_added: mappingsAdded,
    };
  });

  await admin
    .from("crm_connections")
    .update(
      result.ok
        ? { status: "ok", last_error: null, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        : { status: "error", last_error: result.error, updated_at: new Date().toISOString() },
    )
    .eq("client_id", clientId);
  return result;
}

// ─── Everything ─────────────────────────────────────────────────────────────

export async function syncClient(admin: SupabaseClient, clientId: string, opts: { full?: boolean } = {}) {
  const meta = await syncClientMeta(admin, clientId, opts);
  const crm = await syncClientCrm(admin, clientId, opts);
  return { meta, crm };
}

/**
 * Syncs every active client, stopping cleanly before the function time limit.
 * Clients synced least recently go first, so a timeout never starves anyone.
 */
export async function syncAll(admin: SupabaseClient, budgetMs = 240_000) {
  const started = Date.now();
  const { data: clients, error } = await admin.from("clients").select("id, name").eq("is_active", true).eq("is_demo", false);
  if (error) throw error;

  const { data: lastRuns } = await admin.from("sync_runs").select("client_id, started_at").order("started_at", { ascending: false }).limit(500);
  const last = new Map<string, string>();
  for (const r of lastRuns ?? []) if (r.client_id && !last.has(r.client_id)) last.set(r.client_id, r.started_at);
  const ordered = [...(clients ?? [])].sort((a, b) => (last.get(a.id) ?? "").localeCompare(last.get(b.id) ?? ""));

  const done: { client: string; meta: unknown; crm: unknown }[] = [];
  const skipped: string[] = [];
  for (const c of ordered) {
    if (Date.now() - started > budgetMs) {
      skipped.push(c.name);
      continue;
    }
    const r = await syncClient(admin, c.id);
    done.push({ client: c.name, ...r });
  }
  return { done, skipped, ms: Date.now() - started };
}
