/** Placeholder wordmark — replace with the real IQC logo (drop an SVG in /public). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="grid size-7 place-items-center rounded-md bg-brand text-[13px] font-bold text-brand-ink">IQ</span>
      <span>
        The IQ Collective
        <span className="ml-1.5 font-normal opacity-60">Reporting</span>
      </span>
    </span>
  );
}
