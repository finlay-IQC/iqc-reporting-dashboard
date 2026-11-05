import { StatTile } from "@/components/ui";
import { count, money } from "@/lib/format";
import { change, type Totals } from "@/lib/metrics";

export function KpiRow({ current, previous }: { current: Totals; previous: Totals }) {
  const hasPrev = previous.spend > 0 || previous.leads > 0;
  const d = (a: number | null, b: number | null) => (hasPrev ? change(a, b) : null);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatTile label="Ad spend" value={money(current.spend)} delta={d(current.spend, previous.spend)} goodWhen="up" />
      <StatTile label="Leads" value={count(current.leads)} delta={d(current.leads, previous.leads)} />
      <StatTile label="Cost per lead" value={money(current.cpl, true)} delta={d(current.cpl, previous.cpl)} goodWhen="down" />
      <StatTile
        label="Booked appointments"
        value={count(current.booked)}
        delta={d(current.booked, previous.booked)}
      />
      <StatTile
        label="Cost per booking"
        value={money(current.cost_per_booking, true)}
        delta={d(current.cost_per_booking, previous.cost_per_booking)}
        goodWhen="down"
      />
    </div>
  );
}
