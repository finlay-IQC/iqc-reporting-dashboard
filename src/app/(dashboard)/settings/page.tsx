import { Badge, Card, EmptyState, PageHeader, TableWrap, td, th } from "@/components/ui";
import { getClients, getSegments, getSettingsData } from "@/lib/data/reports";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Settings" };

const matchLabel: Record<string, string> = {
  campaign_name_contains: "Campaign name contains",
  campaign_name_prefix: "Campaign name starts with",
  campaign_id: "Campaign ID is",
};

export default async function SettingsPage() {
  const [clients, segments, { accounts, rules, mappings, runs }] = await Promise.all([getClients(), getSegments(), getSettingsData()]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const segmentName = new Map(segments.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="How ad accounts, campaigns and CRM stages map onto clients and segments. Editing from the UI comes in a later step — for now, edit these tables in Supabase."
      />
      <div className="space-y-6">
        <Card title="Meta ad accounts">
          {accounts.length === 0 ? <EmptyState title="No ad accounts connected" /> : (
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-line"><tr>
                  <th className={th}>Account</th><th className={th}>Client</th><th className={th}>Default segment</th><th className={th}>Last synced</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td className={td}><div className="font-medium">{a.name ?? a.id}</div><div className="font-mono text-xs text-ink-3">{a.id}</div></td>
                      <td className={td}>{clientName.get(a.client_id)}</td>
                      <td className={td}>{(a.default_segment_id && segmentName.get(a.default_segment_id)) || <span className="text-ink-3">Client default</span>}</td>
                      <td className={`${td} text-ink-2`}>{a.last_synced_at ? dateTime(a.last_synced_at) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card title="Segment rules">
          <p className="border-b border-line px-5 py-3 text-xs text-ink-2">
            Campaigns go to the first matching rule (lowest priority number), then the ad account&apos;s default segment, then the client&apos;s default.
          </p>
          {rules.length === 0 ? <EmptyState title="No rules yet" /> : (
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-line"><tr>
                  <th className={th}>Priority</th><th className={th}>Rule</th><th className={th}>Segment</th><th className={th}>Ad account</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td className={`${td} tabular`}>{r.priority}</td>
                      <td className={td}>{matchLabel[r.match_type]} <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{r.pattern}</code></td>
                      <td className={td}>{segmentName.get(r.segment_id)}</td>
                      <td className={`${td} font-mono text-xs text-ink-2`}>{r.ad_account_id ?? "Any"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card title="CRM stage mapping">
          {mappings.length === 0 ? <EmptyState title="No stage mappings">Unmapped stages count as “new”.</EmptyState> : (
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-line"><tr>
                  <th className={th}>Client</th><th className={th}>Pipeline</th><th className={th}>CRM stage</th><th className={th}>Counts as</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {mappings.map((m) => (
                    <tr key={m.id}>
                      <td className={td}>{clientName.get(m.client_id)}</td>
                      <td className={`${td} text-ink-2`}>{m.pipeline_name ?? "Any"}</td>
                      <td className={td}>{m.stage_name}</td>
                      <td className={td}><Badge>{m.lifecycle}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card title="Recent syncs">
          {runs.length === 0 ? <EmptyState title="No syncs have run yet" /> : (
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-line"><tr>
                  <th className={th}>Source</th><th className={th}>Client</th><th className={th}>Started</th><th className={th}>Status</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className={td}>{r.source}</td>
                      <td className={td}>{(r.client_id && clientName.get(r.client_id)) || "All"}</td>
                      <td className={`${td} text-ink-2`}>{dateTime(r.started_at)}</td>
                      <td className={td}>
                        <Badge tone={r.status === "success" ? "good" : r.status === "error" ? "bad" : "neutral"}>{r.status}</Badge>
                        {r.error && <div className="mt-1 max-w-md truncate text-xs text-bad" title={r.error}>{r.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
