/** Pure aggregation over segment_daily rows. Kept separate from data fetching so it's testable. */

export type DailyRow = {
  date: string;
  client_id: string;
  segment_id: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  meta_leads: number;
  crm_leads: number;
  attributed_leads: number;
  booked: number;
  won: number;
  won_value: number;
};

export type Totals = {
  spend: number;
  impressions: number;
  link_clicks: number;
  meta_leads: number;
  leads: number;
  attributed: number;
  booked: number;
  won: number;
  won_value: number;
  cpl: number | null;
  cost_per_booking: number | null;
  booking_rate: number | null;
  attribution_rate: number | null;
  ctr: number | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function normaliseRow(r: Record<string, unknown>): DailyRow {
  return {
    date: String(r.date),
    client_id: String(r.client_id),
    segment_id: (r.segment_id as string | null) ?? null,
    spend: num(r.spend),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    link_clicks: num(r.link_clicks),
    meta_leads: num(r.meta_leads),
    crm_leads: num(r.crm_leads),
    attributed_leads: num(r.attributed_leads),
    booked: num(r.booked),
    won: num(r.won),
    won_value: num(r.won_value),
  };
}

export function totals(rows: DailyRow[]): Totals {
  const t = rows.reduce(
    (a, r) => {
      a.spend += r.spend;
      a.impressions += r.impressions;
      a.link_clicks += r.link_clicks;
      a.meta_leads += r.meta_leads;
      a.leads += r.crm_leads;
      a.attributed += r.attributed_leads;
      a.booked += r.booked;
      a.won += r.won;
      a.won_value += r.won_value;
      return a;
    },
    { spend: 0, impressions: 0, link_clicks: 0, meta_leads: 0, leads: 0, attributed: 0, booked: 0, won: 0, won_value: 0 },
  );
  return {
    ...t,
    spend: Math.round(t.spend * 100) / 100,
    // No spend → cost metrics are "not applicable", not £0.
    cpl: t.spend > 0 ? ratio(t.spend, t.leads) : null,
    cost_per_booking: t.spend > 0 ? ratio(t.spend, t.booked) : null,
    booking_rate: ratio(t.booked, t.leads),
    attribution_rate: ratio(t.attributed, t.leads),
    ctr: ratio(t.link_clicks, t.impressions),
  };
}

export function groupTotals<K extends string | null>(rows: DailyRow[], key: (r: DailyRow) => K): Map<K, Totals> {
  const groups = new Map<K, DailyRow[]>();
  for (const r of rows) {
    const k = key(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return new Map([...groups].map(([k, g]) => [k, totals(g)]));
}

/** Relative change, or null when there's no baseline. */
export function change(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / previous;
}
