import Link from "next/link";
import type { ReactNode } from "react";
import { TableWrap, td, tdNum, th, thNum } from "@/components/ui";
import { count, money, pct } from "@/lib/format";
import type { Totals } from "@/lib/metrics";

export type PerfRow = { key: string; label: ReactNode; href?: string; meta?: ReactNode; t: Totals };

/** Spend → leads → bookings → wins for a list of clients or segments. */
export function PerformanceTable({ rows, firstColumn }: { rows: PerfRow[]; firstColumn: string }) {
  return (
    <TableWrap>
      <table className="w-full">
        <thead className="border-b border-line">
          <tr>
            <th className={th}>{firstColumn}</th>
            <th className={thNum}>Spend</th>
            <th className={thNum}>Leads</th>
            <th className={thNum}>CPL</th>
            <th className={thNum}>Booked</th>
            <th className={thNum}>Book rate</th>
            <th className={thNum}>Cost / booking</th>
            <th className={thNum}>Won</th>
            <th className={thNum}>Won value</th>
            <th className={thNum} title="Share of leads matched to a Meta campaign">Attributed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(({ key, label, href, meta, t }) => (
            <tr key={key} className="hover:bg-surface-2/60">
              <td className={td}>
                <div className="flex items-center gap-2">
                  {href ? (
                    <Link href={href} className="font-medium hover:text-brand">
                      {label}
                    </Link>
                  ) : (
                    <span className="font-medium">{label}</span>
                  )}
                  {meta}
                </div>
              </td>
              <td className={tdNum}>{money(t.spend)}</td>
              <td className={tdNum}>{count(t.leads)}</td>
              <td className={tdNum}>{money(t.cpl, true)}</td>
              <td className={tdNum}>{count(t.booked)}</td>
              <td className={tdNum}>{pct(t.booking_rate)}</td>
              <td className={tdNum}>{money(t.cost_per_booking, true)}</td>
              <td className={tdNum}>{count(t.won)}</td>
              <td className={tdNum}>{money(t.won_value)}</td>
              <td className={tdNum}>{pct(t.attribution_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
