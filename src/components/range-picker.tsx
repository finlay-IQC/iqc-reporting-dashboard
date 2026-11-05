import Link from "next/link";
import { RANGES, type RangeKey } from "@/lib/dates";

const labels: Record<RangeKey, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days" };

/** Date-range tabs. Server-rendered links so the range lives in the URL and is shareable. */
export function RangePicker({ current, basePath, params = {} }: { current: RangeKey; basePath: string; params?: Record<string, string | undefined> }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="tablist" aria-label="Date range">
      {(Object.keys(RANGES) as RangeKey[]).map((key) => {
        const entries: [string, string | undefined][] = [...Object.entries(params), ["range", key]];
        const qs = new URLSearchParams(entries.filter((e): e is [string, string] => !!e[1]));
        const active = key === current;
        return (
          <Link
            key={key}
            role="tab"
            aria-selected={active}
            href={`${basePath}?${qs}`}
            className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-brand text-brand-ink font-medium" : "text-ink-2 hover:text-ink"}`}
          >
            {labels[key]}
          </Link>
        );
      })}
    </div>
  );
}
