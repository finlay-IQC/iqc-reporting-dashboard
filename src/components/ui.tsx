import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ title, children, actions, className = "" }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Stat tile: label, value, optional delta vs the previous period.
 * `goodWhen` says which direction is good, so a falling CPL reads green.
 */
export function StatTile({
  label,
  value,
  delta,
  goodWhen = "up",
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  goodWhen?: "up" | "down";
  hint?: string;
}) {
  const hasDelta = delta != null && Number.isFinite(delta);
  const up = hasDelta && delta! > 0;
  const flat = hasDelta && Math.abs(delta!) < 0.005;
  const good = flat ? null : up === (goodWhen === "up");
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="tabular mt-1 text-[26px] font-semibold leading-tight tracking-tight">{value}</div>
      <div className="mt-1 flex min-h-5 items-center gap-1.5 text-xs">
        {hasDelta ? (
          <>
            <span
              className={`tabular inline-flex items-center gap-0.5 font-medium ${good == null ? "text-ink-3" : good ? "text-good" : "text-bad"}`}
            >
              {!flat && (up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />)}
              {delta! > 0 ? "+" : ""}
              {(delta! * 100).toFixed(0)}%
            </span>
            <span className="text-ink-3">vs previous period</span>
          </>
        ) : (
          <span className="text-ink-3">{hint ?? "No previous-period data"}</span>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "good" | "bad" | "warn" }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    brand: "bg-brand-soft text-brand",
    good: "bg-good/10 text-good",
    bad: "bg-bad/10 text-bad",
    warn: "bg-warn/10 text-warn",
  };
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/** Horizontally scrollable table wrapper so wide tables never break the page on mobile. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export const th = "whitespace-nowrap px-5 py-2.5 text-left text-xs font-medium text-ink-3";
export const thNum = `${th} text-right`;
export const td = "whitespace-nowrap px-5 py-3 text-sm";
export const tdNum = `${td} tabular text-right`;
