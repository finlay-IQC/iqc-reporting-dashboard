import { headers } from "next/headers";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, TableWrap, td, th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { webhookKey } from "@/lib/crypto";
import { getClients, getConnections, getSegments, getSettingsData, getSetupChecks } from "@/lib/data/reports";
import { dateTime } from "@/lib/format";
import { deleteSegmentRule, removeDemoData, updateStageMapping } from "./actions";
import { ConnectClientForm, CopyField, SegmentRuleForm, SyncButtons } from "./forms";

export const metadata = { title: "Settings" };
// "Sync now" runs as a Server Action on this page; give it room for a 90-day backfill.
export const maxDuration = 300;

const LIFECYCLES = ["new", "contacted", "qualified", "booked", "showed", "won", "lost", "unqualified"];

function safeWebhookKey(clientId: string): string | null {
  try {
    return webhookKey(clientId);
  } catch {
    return null; // TOKEN_ENCRYPTION_KEY not set yet — the checklist says so
  }
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-label="Done" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-label="To do" />}
      <span className={ok ? "text-ink-2" : ""}>{children}</span>
    </li>
  );
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const [clients, segments, { accounts, rules, mappings, runs }, connections, checks] = await Promise.all([
    getClients(),
    getSegments(),
    getSettingsData(),
    getConnections(),
    getSetupChecks(),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const segmentName = new Map(segments.map((s) => [s.id, s.name]));
  const conn = new Map((connections ?? []).map((c) => [c.client_id, c]));
  const dbUpdated = connections !== null || !checks.secretKey;
  const realClients = clients.filter((c) => !c.is_demo);
  const hasDemo = clients.some((c) => c.is_demo);
  const ready = checks.secretKey && checks.encryptionKey && checks.metaToken && checks.cronSecret && dbUpdated;
  const code = (s: string) => <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">{s}</code>;

  return (
    <>
      <PageHeader title="Settings" subtitle="Connect clients to Meta and GoHighLevel, and control how campaigns and CRM stages are reported." />
      <div className="space-y-6">
        {isAdmin && !ready && (
          <Card title="Setup checklist">
            <ul className="space-y-2 p-5">
              <Check ok={checks.secretKey}>{code("SUPABASE_SECRET_KEY")} set in Vercel (Supabase → Project Settings → API Keys → secret key)</Check>
              <Check ok={checks.encryptionKey}>{code("TOKEN_ENCRYPTION_KEY")} set in Vercel — any random string of 32+ characters, e.g. from a password generator. Keep a copy: changing it means re-entering GHL tokens.</Check>
              <Check ok={checks.metaToken}>{code("META_ACCESS_TOKEN")} set in Vercel — the Meta System User token</Check>
              <Check ok={checks.secretKey && dbUpdated}>Database update run in Supabase: paste {code("supabase/migrations/20261106000000_crm_connections.sql")} into the SQL Editor and click Run</Check>
              <Check ok={checks.cronSecret}>{code("CRON_SECRET")} set in Vercel — any random string of 16+ characters; lets the daily auto-sync run</Check>
            </ul>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-3">After adding variables in Vercel, redeploy for them to take effect.</p>
          </Card>
        )}

        {isAdmin && (
          <Card title="Connect a client">
            <ConnectClientForm clients={realClients} />
          </Card>
        )}

        <Card title="Clients and connections">
          {realClients.length === 0 ? (
            <EmptyState title="No live clients yet">Use “Connect a client” above to add one.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {realClients.map((c) => {
                const accts = accounts.filter((a) => a.client_id === c.id);
                const crm = conn.get(c.id);
                const key = crm ? safeWebhookKey(c.id) : null;
                return (
                  <li key={c.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="text-xs font-medium text-ink-3">Meta</div>
                        {accts.length === 0 ? (
                          <div className="text-ink-3">No ad accounts</div>
                        ) : (
                          accts.map((a) => (
                            <div key={a.id}>
                              {a.name ?? a.id} <span className="font-mono text-xs text-ink-3">{a.id}</span>
                              <div className="text-xs text-ink-3">{a.last_synced_at ? `Synced ${dateTime(a.last_synced_at)}` : "Not synced yet"}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 space-y-1 text-sm">
                      <div className="text-xs font-medium text-ink-3">GoHighLevel</div>
                      {crm ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={crm.status === "ok" ? "good" : crm.status === "error" ? "bad" : "neutral"}>{crm.status === "ok" ? "connected" : crm.status}</Badge>
                            <span className="font-mono text-xs text-ink-3">{crm.account_id} · token …{crm.token_hint}</span>
                          </div>
                          <div className="text-xs text-ink-3">{crm.last_synced_at ? `Synced ${dateTime(crm.last_synced_at)}` : "Not synced yet"}</div>
                          {crm.last_error && <div className="text-xs text-bad">{crm.last_error}</div>}
                          {key && (
                            <div className="pt-2">
                              <div className="mb-1 text-xs text-ink-3">Instant new leads — paste into a GHL workflow webhook (trigger: Contact Created):</div>
                              <CopyField label="webhook URL" value={`${origin}/api/webhooks/ghl/${c.id}?key=${key}`} />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-ink-3">Not connected</div>
                      )}
                    </div>
                    {isAdmin && <SyncButtons clientId={c.id} />}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Segment rules">
          <p className="border-b border-line px-5 py-3 text-xs text-ink-2">
            Campaigns go to the first matching rule, then the ad account&apos;s default segment, then the client&apos;s default (“All campaigns”).
            Use rules to split one ad account into franchise partners, recruitment, national and so on.
          </p>
          {rules.length === 0 ? (
            <EmptyState title="No rules yet" />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-line">
                  <tr><th className={th}>Client</th><th className={th}>Campaign name contains</th><th className={th}>Segment</th><th className={th} /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rules.map((r) => {
                    const seg = segments.find((s) => s.id === r.segment_id);
                    return (
                      <tr key={r.id}>
                        <td className={td}>{seg ? clientName.get(seg.client_id) : "—"}</td>
                        <td className={td}><code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{r.pattern}</code>{r.match_type !== "campaign_name_contains" && <span className="ml-2 text-xs text-ink-3">({r.match_type})</span>}</td>
                        <td className={td}>{segmentName.get(r.segment_id)}</td>
                        <td className={`${td} text-right`}>
                          {isAdmin && (
                            <form action={deleteSegmentRule}>
                              <input type="hidden" name="rule_id" value={r.id} />
                              <button className="text-xs text-ink-3 hover:text-bad">Remove</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
          {isAdmin && clients.length > 0 && <SegmentRuleForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} />}
        </Card>

        <Card title="CRM stage mapping">
          <p className="border-b border-line px-5 py-3 text-xs text-ink-2">
            Each CRM stage counts as a step in the funnel. New stages are guessed automatically on each sync — check them here. Stages not listed count as “new”.
          </p>
          {mappings.length === 0 ? (
            <EmptyState title="No stages yet">They appear after the first GHL sync.</EmptyState>
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-line">
                  <tr><th className={th}>Client</th><th className={th}>Pipeline</th><th className={th}>CRM stage</th><th className={th}>Counts as</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mappings.map((m) => (
                    <tr key={m.id}>
                      <td className={td}>{clientName.get(m.client_id)}</td>
                      <td className={`${td} text-ink-2`}>{m.pipeline_name ?? "Any"}</td>
                      <td className={td}>{m.stage_name}</td>
                      <td className={td}>
                        {isAdmin ? (
                          <form action={updateStageMapping} className="flex items-center gap-2">
                            <input type="hidden" name="mapping_id" value={m.id} />
                            <select name="lifecycle" defaultValue={m.lifecycle} aria-label={`Funnel step for ${m.stage_name}`} className="rounded-md border border-line bg-surface px-2 py-1 text-sm">
                              {LIFECYCLES.map((l) => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <button className="text-xs text-ink-3 hover:text-brand">Save</button>
                          </form>
                        ) : (
                          <Badge>{m.lifecycle}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card title="Recent syncs">
          {runs.length === 0 ? (
            <EmptyState title="No syncs have run yet" />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-line">
                  <tr><th className={th}>Source</th><th className={th}>Client</th><th className={th}>Started</th><th className={th}>Result</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {runs.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className={td}>{r.source}</td>
                      <td className={td}>{(r.client_id && clientName.get(r.client_id)) || "—"}</td>
                      <td className={`${td} text-ink-2`}>{dateTime(r.started_at)}</td>
                      <td className={td}>
                        <Badge tone={r.status === "success" ? "good" : r.status === "error" ? "bad" : "neutral"}>{r.status}</Badge>
                        {r.error && <div className="mt-1 max-w-lg whitespace-normal text-xs text-bad">{r.error}</div>}
                        {r.stats && r.status === "success" && (
                          <div className="mt-1 max-w-lg whitespace-normal text-xs text-ink-3">
                            {Object.entries(r.stats as Record<string, unknown>)
                              .filter(([k]) => k !== "since" && k !== "note")
                              .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        {isAdmin && hasDemo && (
          <Card title="Demo data">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-ink-2">The demo client is still loaded. Remove it once your real clients are syncing.</p>
              <form action={removeDemoData}>
                <button className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-bad hover:text-bad">Remove demo data</button>
              </form>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
