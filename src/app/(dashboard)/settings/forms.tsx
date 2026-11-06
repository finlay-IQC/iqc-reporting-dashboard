"use client";

import { useActionState, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { addSegmentRule, saveClient, syncNow, type ActionState } from "./actions";

const input = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
const label = "block text-sm font-medium";
const help = "mt-1 text-xs font-normal text-ink-3";
const primary = "rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink disabled:opacity-60";

function Result({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-good" : "text-bad"}`}>
      {state.message}
    </p>
  );
}

export function ConnectClientForm({ clients }: { clients: { name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveClient, {});
  const [name, setName] = useState("");
  const updating = clients.some((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-2">
      <label className={label}>
        Client name
        <input name="name" required list="client-names" value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="e.g. Smith Kitchens" />
        <datalist id="client-names">{clients.map((c) => <option key={c.name} value={c.name} />)}</datalist>
        <span className={help}>{updating ? "Existing client — saving updates its connections." : "Pick an existing name to update it."}</span>
      </label>
      <label className={label}>
        Meta ad account ID(s)
        <input name="meta_accounts" className={input} placeholder="act_123456789, act_987654321" autoComplete="off" />
        <span className={help}>Ads Manager → account dropdown. Separate several with commas.</span>
      </label>
      <label className={label}>
        GHL Location ID
        <input name="ghl_location_id" className={input} placeholder="e.g. ve9EPM428h8vShlRW1KT" autoComplete="off" />
        <span className={help}>In the sub-account: Settings → Business Profile.</span>
      </label>
      <label className={label}>
        GHL Private Integration token
        <input name="ghl_token" type="password" className={input} placeholder={updating ? "Leave blank to keep the current token" : "pit-…"} autoComplete="off" />
        <span className={help}>Settings → Private Integrations. Stored encrypted; never shown again.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button disabled={pending} className={primary}>{pending ? "Checking with Meta and GHL…" : updating ? "Update client" : "Add client"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function SyncButtons({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(syncNow, {});
  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="client_id" value={clientId} />
        <button name="full" value="0" disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brand disabled:opacity-60">
          <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden />
          {pending ? "Syncing… (can take a minute)" : "Sync now"}
        </button>
        {!pending && (
          <button name="full" value="1" className="text-xs text-ink-3 hover:text-brand" title="Re-pull the last 90 days from Meta and GHL">
            Full 90-day re-sync
          </button>
        )}
      </form>
      {state.message && <div className="mt-2 max-w-xl"><Result state={state} /></div>}
    </div>
  );
}

export function CopyField({ value, label: text }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} aria-label={text} className="w-full min-w-0 rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-xs text-ink-2" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded-md border border-line p-1.5 hover:border-brand"
        aria-label={`Copy ${text}`}
      >
        {copied ? <Check className="size-3.5 text-good" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </div>
  );
}

export function SegmentRuleForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addSegmentRule, {});
  return (
    <form action={action} className="grid gap-4 border-t border-line p-5 sm:grid-cols-4">
      <label className={label}>
        Client
        <select name="client_id" required className={input}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className={label}>
        Segment
        <input name="segment" required className={input} placeholder="e.g. Partner — Leeds" />
      </label>
      <label className={label}>
        Type
        <select name="kind" className={input} defaultValue="franchise">
          <option value="franchise">Franchise partner</option>
          <option value="recruitment">Recruitment</option>
          <option value="national">National</option>
          <option value="brand">Brand</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className={label}>
        Campaign name contains
        <input name="pattern" required className={input} placeholder="e.g. | Leeds |" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
        <button disabled={pending} className={primary}>Add rule</button>
        <Result state={state} />
      </div>
    </form>
  );
}
