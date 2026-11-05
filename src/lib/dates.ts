export const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;
export type RangeKey = keyof typeof RANGES;

export type DateWindow = { key: RangeKey; days: number; from: string; to: string; prevFrom: string; prevTo: string };

/** Today's date in London as YYYY-MM-DD. */
function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The last N complete days (yesterday backwards) plus the equal-length window before it.
 * Today is excluded because Meta spend for today is still moving.
 */
export function resolveRange(param: string | string[] | undefined, now = new Date()): DateWindow {
  const key: RangeKey = typeof param === "string" && param in RANGES ? (param as RangeKey) : "30d";
  const days = RANGES[key];
  const to = addDays(londonToday(now), -1);
  const from = addDays(to, -(days - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { key, days, from, to, prevFrom, prevTo };
}

/** UTC instant of 00:00 London time on the given YYYY-MM-DD (handles BST). */
export function londonStartOfDay(iso: string): string {
  const probe = new Date(`${iso}T00:30:00Z`);
  const londonHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(probe),
  );
  return new Date(Date.parse(`${iso}T00:00:00Z`) - londonHour * 3_600_000).toISOString();
}
