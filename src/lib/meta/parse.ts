/** Pure conversions from Meta Marketing API responses to our table rows. */

export type MetaAction = { action_type: string; value: string };

export type MetaInsightRow = {
  date_start: string;
  account_id?: string;
  campaign_id: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
};

/**
 * Leads as Meta counts them. "lead" is Meta's combined total (instant forms +
 * pixel leads); fall back to the parts when it's absent so nothing is double counted.
 */
export function metaLeadCount(actions: MetaAction[] | undefined): number {
  if (!actions?.length) return 0;
  const get = (t: string) => {
    const a = actions.find((x) => x.action_type === t);
    return a ? Number(a.value) || 0 : null;
  };
  const combined = get("lead");
  if (combined != null) return combined;
  return (get("onsite_conversion.lead_grouped") ?? 0) + (get("offsite_conversion.fb_pixel_lead") ?? 0);
}

const int = (v: string | undefined) => Math.round(Number(v ?? 0)) || 0;

export function normaliseAccountId(input: string): string | null {
  const digits = input.trim().replace(/^act_/i, "");
  return /^\d{5,25}$/.test(digits) ? `act_${digits}` : null;
}

export function insightToRows(adAccountId: string, r: MetaInsightRow) {
  return {
    insight: {
      ad_id: r.ad_id,
      date: r.date_start,
      ad_account_id: adAccountId,
      campaign_id: r.campaign_id,
      adset_id: r.adset_id ?? null,
      spend: Math.round((Number(r.spend ?? 0) || 0) * 100) / 100,
      impressions: int(r.impressions),
      reach: int(r.reach),
      clicks: int(r.clicks),
      link_clicks: int(r.inline_link_clicks),
      leads: metaLeadCount(r.actions),
    },
    campaign: { id: r.campaign_id, ad_account_id: adAccountId, name: r.campaign_name || r.campaign_id },
    adset: r.adset_id
      ? { id: r.adset_id, campaign_id: r.campaign_id, ad_account_id: adAccountId, name: r.adset_name || r.adset_id }
      : null,
    ad: {
      id: r.ad_id,
      adset_id: r.adset_id ?? null,
      campaign_id: r.campaign_id,
      ad_account_id: adAccountId,
      name: r.ad_name || r.ad_id,
    },
  };
}

/** Split [since, until] (YYYY-MM-DD, inclusive) into windows of at most `days` days. */
export function dateChunks(since: string, until: string, days = 30): { since: string; until: string }[] {
  const out: { since: string; until: string }[] = [];
  const day = 86_400_000;
  let start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  while (start <= end) {
    const stop = Math.min(start + (days - 1) * day, end);
    out.push({ since: new Date(start).toISOString().slice(0, 10), until: new Date(stop).toISOString().slice(0, 10) });
    start = stop + day;
  }
  return out;
}
