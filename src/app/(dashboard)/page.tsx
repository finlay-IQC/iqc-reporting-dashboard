import Link from "next/link";
import { KpiRow } from "@/components/kpi-row";
import { PerformanceTable } from "@/components/performance-table";
import { RangePicker } from "@/components/range-picker";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getClients, getDaily, getSegments } from "@/lib/data/reports";
import { resolveRange } from "@/lib/dates";
import { groupTotals, totals } from "@/lib/metrics";

export const metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const { range } = await searchParams;
  const w = resolveRange(range);
  const [clients, segments, rows, prevRows] = await Promise.all([
    getClients(),
    getSegments(),
    getDaily({ from: w.from, to: w.to }),
    getDaily({ from: w.prevFrom, to: w.prevTo }),
  ]);

  const byClient = groupTotals(rows, (r) => r.client_id);
  const bySegment = groupTotals(rows, (r) => r.segment_id);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`All clients · ${w.from} to ${w.to}`}
        actions={<RangePicker current={w.key} basePath="/" />}
      />

      {clients.length === 0 ? (
        <Card>
          <EmptyState title="No clients yet">
            Add a client in Supabase (or load <code className="font-mono">supabase/seed.sql</code> for demo data), then connect Meta and the CRM.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          <KpiRow current={totals(rows)} previous={totals(prevRows)} />

          <Card title="By client">
            <PerformanceTable
              firstColumn="Client"
              rows={clients.map((c) => ({
                key: c.id,
                label: c.name,
                href: `/clients/${c.slug}?range=${w.key}`,
                meta: c.is_demo ? <Badge>demo</Badge> : null,
                t: byClient.get(c.id) ?? totals([]),
              }))}
            />
          </Card>

          <Card title="By segment" actions={<Link href="/settings" className="text-xs text-ink-2 hover:text-brand">Edit segment rules</Link>}>
            <PerformanceTable
              firstColumn="Segment"
              rows={segments
                .filter((s) => bySegment.has(s.id))
                .map((s) => ({
                  key: s.id,
                  label: s.name,
                  meta: <span className="text-xs text-ink-3">{clientName.get(s.client_id)}</span>,
                  t: bySegment.get(s.id)!,
                }))
                .sort((a, b) => b.t.spend - a.t.spend)}
            />
          </Card>
        </div>
      )}
    </>
  );
}
