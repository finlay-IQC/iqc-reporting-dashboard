import { LeadsTable } from "@/components/leads-table";
import { RangePicker } from "@/components/range-picker";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getClients, getLeads, getSegments } from "@/lib/data/reports";
import { resolveRange } from "@/lib/dates";

export const metadata = { title: "Leads" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const sp = await searchParams;
  const w = resolveRange(sp.range);
  const clientId = one(sp.client);
  const segmentId = one(sp.segment);

  const [clients, segments, leads] = await Promise.all([
    getClients(),
    getSegments(),
    getLeads({ from: w.from, to: w.to, clientId, segmentId, limit: 500 }),
  ]);
  const visibleSegments = clientId ? segments.filter((s) => s.client_id === clientId) : segments;
  const select = "rounded-lg border border-line bg-surface px-3 py-1.5 text-sm";

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${leads.total} leads · ${w.from} to ${w.to}${leads.total > leads.rows.length ? ` · showing latest ${leads.rows.length}` : ""}`}
        actions={<RangePicker current={w.key} basePath="/leads" params={{ client: clientId, segment: segmentId }} />}
      />
      <form className="mb-4 flex flex-wrap items-center gap-2" action="/leads">
        <input type="hidden" name="range" value={w.key} />
        <select name="client" defaultValue={clientId ?? ""} className={select} aria-label="Client">
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="segment" defaultValue={segmentId ?? ""} className={select} aria-label="Segment">
          <option value="">All segments</option>
          {visibleSegments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-ink">Apply</button>
      </form>
      <Card>
        {leads.rows.length === 0 ? (
          <EmptyState title="No leads match these filters" />
        ) : (
          <LeadsTable
            rows={leads.rows}
            clientNames={new Map(clients.map((c) => [c.id, c.name]))}
            segmentNames={new Map(segments.map((s) => [s.id, s.name]))}
          />
        )}
      </Card>
    </>
  );
}
