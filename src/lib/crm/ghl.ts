import "server-only";
import {
  contactToLead,
  latestByContact,
  opportunityToStage,
  parseOpportunity,
  type GhlOpportunity,
  type StageLookup,
} from "./ghl-parse";
import type { CrmAdapter, CrmClientConfig, NormalizedLead } from "./types";

/**
 * GoHighLevel (LeadConnector) API v2 with a sub-account Private Integration
 * token. Scopes needed: contacts.readonly, opportunities.readonly,
 * locations.readonly.
 */
const BASE = () => (process.env.GHL_API_URL || "https://services.leadconnectorhq.com").replace(/\/+$/, "");
const API_VERSION = "2021-07-28";
const PAGE = 100;
const MAX_PAGES = 100; // 10k records per pull — plenty for a sub-account's recent leads

export class GhlApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function explain(status: number, body: string): string {
  if (status === 401) return "GHL rejected the token — check the Private Integration token for this sub-account.";
  if (status === 403) return "GHL token is missing a scope. It needs contacts.readonly, opportunities.readonly and locations.readonly.";
  if (status === 404) return "GHL location not found — check the Location ID.";
  if (status === 429) return "GHL rate limit hit — the next sync will catch up.";
  return `GHL API error ${status}: ${body.slice(0, 300)}`;
}

async function ghl<T>(client: CrmClientConfig, path: string, init: { method?: string; body?: unknown } = {}, attempt = 0): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${client.token}`,
      Version: API_VERSION,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.ok) return (await res.json()) as T;
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * (attempt + 1);
    await new Promise((r) => setTimeout(r, Math.min(wait, 15_000)));
    return ghl<T>(client, path, init, attempt + 1);
  }
  throw new GhlApiError(explain(res.status, await res.text().catch(() => "")), res.status);
}

const loc = (c: CrmClientConfig) => encodeURIComponent(c.crm_account_id);

async function stageLookup(client: CrmClientConfig): Promise<StageLookup> {
  type R = { pipelines?: { id: string; name: string; stages?: { id: string; name: string }[] }[] };
  const r = await ghl<R>(client, `/opportunities/pipelines?locationId=${loc(client)}`);
  const out: StageLookup = new Map();
  for (const p of r.pipelines ?? []) for (const s of p.stages ?? []) out.set(s.id, { pipeline_name: p.name, stage_name: s.name });
  return out;
}

async function allOpportunities(client: CrmClientConfig, extra = ""): Promise<GhlOpportunity[]> {
  type R = { opportunities?: unknown[]; meta?: { total?: number; nextPage?: number | null } };
  const out: GhlOpportunity[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await ghl<R>(client, `/opportunities/search?location_id=${loc(client)}&limit=${PAGE}&page=${page}${extra}`);
    const batch = (r.opportunities ?? []).map(parseOpportunity).filter((o): o is GhlOpportunity => !!o);
    out.push(...batch);
    if ((r.opportunities?.length ?? 0) < PAGE || r.meta?.nextPage === null) break;
  }
  return out;
}

/** Contacts added since `since`, newest first. */
async function contactsSince(client: CrmClientConfig, since: Date): Promise<unknown[]> {
  type R = { contacts?: { dateAdded?: string }[]; total?: number };
  const out: unknown[] = [];
  let filtered = true;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = {
      locationId: client.crm_account_id,
      page,
      pageLimit: PAGE,
      sort: [{ field: "dateAdded", direction: "desc" }],
      ...(filtered ? { filters: [{ field: "dateAdded", operator: "range", value: { gte: since.toISOString() } }] } : {}),
    };
    let r: R;
    try {
      r = await ghl<R>(client, "/contacts/search", { method: "POST", body });
    } catch (e) {
      // If GHL rejects the date filter, fall back to sorted paging and stop at the cutoff.
      if (filtered && page === 1 && e instanceof GhlApiError && (e.status === 400 || e.status === 422)) {
        filtered = false;
        page = 0;
        continue;
      }
      throw e;
    }
    const batch = r.contacts ?? [];
    const inWindow = batch.filter((c) => !c.dateAdded || new Date(c.dateAdded) >= since);
    out.push(...inWindow);
    if (batch.length < PAGE || inWindow.length < batch.length) break;
  }
  return out;
}

export const ghlAdapter: CrmAdapter = {
  provider: "ghl",

  async testConnection(client) {
    const r = await ghl<{ location?: { name?: string } }>(client, `/locations/${loc(client)}`);
    return r.location?.name ?? client.crm_account_id;
  },

  async fetchStageNames(client) {
    return [...(await stageLookup(client)).values()];
  },

  async fetchLeads(client, { since }) {
    const [stages, opps, contacts] = await Promise.all([stageLookup(client), allOpportunities(client), contactsSince(client, since)]);
    const byContact = latestByContact(opps);
    return {
      leads: contacts
        .map((c) => contactToLead(client.id, c, byContact.get(String((c as { id?: string }).id)), stages))
        .filter((l): l is NormalizedLead => !!l),
      stages: [...byContact.values()].map((o) => opportunityToStage(o, stages)),
    };
  },

  async handleWebhook(client, payload) {
    // GHL workflow webhooks send flat contact fields; accept the common id spellings.
    const p = (payload ?? {}) as Record<string, unknown>;
    const contactId = [p.contact_id, p.contactId, (p.contact as Record<string, unknown> | undefined)?.id, p.id].find(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (!contactId) return null;
    const [{ contact }, stages, opps] = await Promise.all([
      ghl<{ contact?: unknown }>(client, `/contacts/${encodeURIComponent(contactId)}`),
      stageLookup(client),
      allOpportunities(client, `&contact_id=${encodeURIComponent(contactId)}`),
    ]);
    return contactToLead(client.id, contact, latestByContact(opps).get(contactId), stages);
  },
};
