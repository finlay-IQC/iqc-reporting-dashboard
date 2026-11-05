const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const gbp2 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("en-GB");

export const money = (v: number | null | undefined, precise = false) =>
  v == null ? "—" : ((precise || Math.abs(v) < 100) && v !== 0 ? gbp2 : gbp0).format(v);
export const count = (v: number | null | undefined) =>
  v == null ? "—" : Math.abs(v) >= 100_000 ? compact.format(v) : int.format(v);
export const pct = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
