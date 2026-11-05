import Link from "next/link";
import { notFound } from "next/navigation";
import { KpiRow } from "@/components/kpi-row";
import { LeadsTable } from "@/components/leads-table";
import { PerformanceTable } from "@/components/performance-table";
import { RangePicker } from "@/components/range-picker";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getClientBySlug, getDaily, getLeads, getSegments } from "@/lib/data/reports";
import { resolveRange } from "@/lib/dates";
import { groupTotals, totals } from "@/lib/metrics";

const kindLabel: Record<string, string> = {
  franchise: "Franchise partner", recruitment: "Recruitment", national: "National", brand: "Brand", other: "Other",
};

export async function generateMetadata({ params }: PageProps<"/clients/[slug]">) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client?.name ?? "Client" };
}

export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[slug]">) {
  const [{ slug }, { range }] = await Promise.all([params, searchParams]);
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const w = resolveRange(range);
  const [segments, rows, prevRows, leads] = await Promise.all([
    getSegments(client.id),
    getDaily({ from: w.from, to: w.to, clientId: client.id }),
    getDaily({ from: w.prevFrom, to: w.prevTo, clientId: client.id }),
    getLeads({ from: w.from, to: w.to, clientId: client.id, limit: 15 }),
  ]);
  const bySegment = groupTotals(rows, (r) => r.segment_id);

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={<>{w.from} to {w.to}{client.is_demo && <> · <Badge>demo data</Badge></>}</>}
        actions={<RangePicker current={w.key} basePath={`/clients/${slug}`} />}
      />
      <div className="space-y-6">
        <KpiRow current={totals(rows)} previous={totals(prevRows)} />

        <Card title="Segments">
          {segments.length === 0 ? (
            <EmptyState title="No segments">Add franchise partners, recruitment and national segments in Settings.</EmptyState>
          ) : (
            <PerformanceTable
              firstColumn="Segment"
              rows={segments.map((s) => ({
                key: s.id,
                label: s.name,
                href: `/leads?client=${client.id}&segment=${s.id}&range=${w.key}`,
                meta: <span className="text-xs text-ink-3">{kindLabel[s.kind] ?? s.kind}</span>,
                t: bySegment.get(s.id) ?? totals([]),
              }))}
            />
          )}
        </Card>

        <Card
          title={`Latest leads (${leads.total} in period)`}
          actions={<Link href={`/leads?client=${client.id}&range=${w.key}`} className="text-xs text-ink-2 hover:text-brand">View all</Link>}
        >
          {leads.rows.length === 0 ? (
            <EmptyState title="No leads in this period" />
          ) : (
            <LeadsTable
              rows={leads.rows}
              showClient={false}
              clientNames={new Map([[client.id, client.name]])}
              segmentNames={new Map(segments.map((s) => [s.id, s.name]))}
            />
          )}
        </Card>
      </div>
    </>
  );
}
