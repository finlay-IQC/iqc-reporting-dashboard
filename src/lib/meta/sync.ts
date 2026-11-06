import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { graphGet, graphGetAll } from "./graph";
import { dateChunks, insightToRows, type MetaInsightRow } from "./parse";

const INSIGHT_FIELDS = [
  "date_start", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
  "spend", "impressions", "reach", "clicks", "inline_link_clicks", "actions",
].join(",");

/** Meta revises recent results (late conversions), so incremental syncs re-pull this many days. */
export const META_REFRESH_DAYS = 7;
export const META_BACKFILL_DAYS = 90;

async function upsertChunked(admin: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`Saving ${table} failed: ${error.message}`);
  }
}

const dedupe = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((r) => [r.id, r])).values()];

/**
 * Syncs one ad account: account details, campaign/ad set/ad structure and
 * ad-level daily insights for [since, until]. Idempotent.
 */
export async function syncMetaAccount(
  admin: SupabaseClient,
  adAccountId: string,
  range: { since: string; until: string },
) {
  // 1. Account details
  const acct = await graphGet<{ name?: string; currency?: string; timezone_name?: string }>(adAccountId, {
    fields: "name,currency,timezone_name",
  });
  {
    const { error } = await admin
      .from("meta_ad_accounts")
      .update({ name: acct.name ?? null, currency: acct.currency ?? null, timezone: acct.timezone_name ?? null })
      .eq("id", adAccountId);
    if (error) throw new Error(`Updating ad account failed: ${error.message}`);
  }

  // 2. Insights (also yields names for campaigns/ads that have since been deleted)
  const rows: ReturnType<typeof insightToRows>[] = [];
  for (const chunk of dateChunks(range.since, range.until, 30)) {
    const data = await graphGetAll<MetaInsightRow>(`${adAccountId}/insights`, {
      level: "ad",
      time_increment: 1,
      time_range: JSON.stringify(chunk),
      fields: INSIGHT_FIELDS,
      use_unified_attribution_setting: "true",
    });
    rows.push(...data.map((r) => insightToRows(adAccountId, r)));
  }

  // 3. Current structure (statuses, objectives, thumbnails)
  type Campaign = { id: string; name: string; objective?: string; effective_status?: string; created_time?: string };
  type AdSet = { id: string; name: string; campaign_id: string; effective_status?: string };
  type Ad = { id: string; name: string; adset_id?: string; campaign_id: string; effective_status?: string; creative?: { thumbnail_url?: string } };
  const [campaigns, adsets, ads] = await Promise.all([
    graphGetAll<Campaign>(`${adAccountId}/campaigns`, { fields: "id,name,objective,effective_status,created_time" }),
    graphGetAll<AdSet>(`${adAccountId}/adsets`, { fields: "id,name,campaign_id,effective_status" }),
    graphGetAll<Ad>(`${adAccountId}/ads`, { fields: "id,name,adset_id,campaign_id,effective_status,creative{thumbnail_url}" }),
  ]);

  const now = new Date().toISOString();
  // Upserts only touch the columns sent, so manual segment overrides are preserved.
  await upsertChunked(admin, "meta_campaigns", dedupe([
    ...rows.map((r) => ({ ...r.campaign, updated_at: now })),
    ...campaigns.map((c) => ({
      id: c.id, ad_account_id: adAccountId, name: c.name, objective: c.objective ?? null,
      status: c.effective_status ?? null, created_time: c.created_time ?? null, updated_at: now,
    })),
  ].map((c) => ({ objective: null, status: null, created_time: null, ...c }))), "id");
  // Children whose campaign we don't know (e.g. archived) are skipped rather than failing the sync.
  const knownCampaigns = new Set([...rows.map((r) => r.campaign.id), ...campaigns.map((c) => c.id)]);
  await upsertChunked(admin, "meta_adsets", dedupe([
    ...rows.flatMap((r) => (r.adset ? [{ ...r.adset, status: null as string | null, updated_at: now }] : [])),
    ...adsets.filter((s) => knownCampaigns.has(s.campaign_id)).map((s) => ({ id: s.id, campaign_id: s.campaign_id, ad_account_id: adAccountId, name: s.name, status: s.effective_status ?? null, updated_at: now })),
  ]), "id");
  const knownAdsets = new Set([...rows.flatMap((r) => (r.adset ? [r.adset.id] : [])), ...adsets.map((s) => s.id)]);
  await upsertChunked(admin, "meta_ads", dedupe([
    ...rows.map((r) => ({ ...r.ad, status: null as string | null, thumbnail_url: null as string | null, updated_at: now })),
    ...ads.filter((a) => knownCampaigns.has(a.campaign_id)).map((a) => ({
      id: a.id, adset_id: a.adset_id ?? null, campaign_id: a.campaign_id, ad_account_id: adAccountId, name: a.name,
      status: a.effective_status ?? null, thumbnail_url: a.creative?.thumbnail_url ?? null, updated_at: now,
    })),
  ]).map((a) => ({ ...a, adset_id: a.adset_id && knownAdsets.has(a.adset_id) ? a.adset_id : null })), "id");

  // 4. Insights last (they reference campaigns by ID in the reporting views)
  await upsertChunked(admin, "meta_insights_daily", rows.map((r) => ({ ...r.insight, updated_at: now })), "ad_id,date");

  await admin.from("meta_ad_accounts").update({ last_synced_at: now }).eq("id", adAccountId);

  return {
    account: acct.name ?? adAccountId,
    campaigns: knownCampaigns.size,
    ads: new Set([...rows.map((r) => r.ad.id), ...ads.map((a) => a.id)]).size,
    insight_rows: rows.length,
    spend: Math.round(rows.reduce((s, r) => s + r.insight.spend, 0) * 100) / 100,
  };
}
