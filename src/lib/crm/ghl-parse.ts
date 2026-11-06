/**
 * Pure GHL → NormalizedLead conversion. GHL's attribution fields vary by how a
 * contact arrived (funnel form, Facebook lead ad integration, API), so every
 * lookup tolerates several spellings. The raw contact is kept on the lead so
 * mappings can be refined against real data.
 */
import { classifyChannel, mergeUtms, metaIdsFromUtms, parseLandingUrl } from "@/lib/attribution";
import type { CrmStage, Lifecycle, NormalizedLead } from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Case/punctuation-insensitive field lookup: "utm_campaign", "utmCampaign", "UTM Campaign" all match. */
function pick(o: Obj | null | undefined, ...keys: string[]): string | null {
  if (!o) return null;
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
  const index = new Map(Object.entries(o).map(([k, v]) => [norm(k), v]));
  for (const k of keys) {
    const v = index.get(norm(k));
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

const META_ID = /^\d{10,25}$/;
const metaId = (v: string | null) => (v && META_ID.test(v) ? v : null);

/** First-touch attribution: what originally produced the lead. */
export function firstAttribution(contact: Obj): Obj {
  if (isObj(contact.attributionSource)) return contact.attributionSource;
  if (Array.isArray(contact.attributions)) {
    const list = contact.attributions.filter(isObj);
    return list.find((a) => a.isFirst === true) ?? list[0] ?? {};
  }
  return {};
}

export function lastAttribution(contact: Obj): Obj {
  if (isObj(contact.lastAttributionSource)) return contact.lastAttributionSource;
  if (Array.isArray(contact.attributions)) {
    const list = contact.attributions.filter(isObj);
    return list.find((a) => a.isLast === true) ?? {};
  }
  return {};
}

export function opportunityLifecycle(status: string | null | undefined): Lifecycle | null {
  switch ((status ?? "").toLowerCase()) {
    case "won": return "won";
    case "lost":
    case "abandoned": return "lost";
    default: return null;
  }
}

export type GhlOpportunity = {
  id: string;
  contactId: string;
  pipelineId: string | null;
  pipelineStageId: string | null;
  status: string | null;
  monetaryValue: number | null;
  updatedAt: string | null;
};

export function parseOpportunity(o: unknown): GhlOpportunity | null {
  if (!isObj(o)) return null;
  const contactId = pick(o, "contactId") ?? (isObj(o.contact) ? pick(o.contact, "id") : null);
  const id = pick(o, "id");
  if (!id || !contactId) return null;
  const value = Number(o.monetaryValue ?? o.monetary_value);
  return {
    id,
    contactId,
    pipelineId: pick(o, "pipelineId"),
    pipelineStageId: pick(o, "pipelineStageId"),
    status: pick(o, "status"),
    monetaryValue: Number.isFinite(value) && value > 0 ? value : null,
    updatedAt: pick(o, "updatedAt", "lastStatusChangeAt", "lastStageChangeAt", "createdAt"),
  };
}

/** When a contact has several deals, the most recently updated one represents them. */
export function latestByContact(opps: GhlOpportunity[]): Map<string, GhlOpportunity> {
  const out = new Map<string, GhlOpportunity>();
  for (const o of opps) {
    const prev = out.get(o.contactId);
    if (!prev || (o.updatedAt ?? "") > (prev.updatedAt ?? "")) out.set(o.contactId, o);
  }
  return out;
}

export type StageLookup = Map<string, { pipeline_name: string; stage_name: string }>; // key: stageId

export function opportunityToStage(o: GhlOpportunity, stages: StageLookup): CrmStage {
  const s = o.pipelineStageId ? stages.get(o.pipelineStageId) : undefined;
  return {
    crm_id: o.contactId,
    pipeline_name: s?.pipeline_name ?? null,
    stage_name: s?.stage_name ?? null,
    lifecycle_hint: opportunityLifecycle(o.status),
    value: o.monetaryValue,
  };
}

export function contactToLead(
  clientId: string,
  contact: unknown,
  opp: GhlOpportunity | undefined,
  stages: StageLookup,
): NormalizedLead | null {
  if (!isObj(contact)) return null;
  const id = pick(contact, "id");
  const created = pick(contact, "dateAdded", "createdAt", "date_created");
  if (!id || !created) return null;

  const first = firstAttribution(contact);
  const last = lastAttribution(contact);
  const landing = pick(first, "url", "pageUrl", "landingPageUrl", "page_url") ?? pick(last, "url", "pageUrl");
  const utms = mergeUtms(
    {
      utm_source: pick(first, "utmSource", "utm_source"),
      utm_medium: pick(first, "utmMedium", "utm_medium"),
      utm_campaign: pick(first, "utmCampaign", "utm_campaign", "campaign"),
      utm_content: pick(first, "utmContent", "utm_content"),
      utm_term: pick(first, "utmTerm", "utm_term", "utmKeyword"),
      fbclid: pick(first, "fbclid", "fbClickId"),
    },
    parseLandingUrl(landing),
  );
  const fromUtms = metaIdsFromUtms(utms);
  const formId = metaId(pick(first, "fbFormId", "facebookFormId", "leadFormId", "formId"));
  const crmSource = pick(contact, "source") ?? pick(first, "sessionSource", "medium");
  const stage = opp ? opportunityToStage(opp, stages) : null;

  return {
    client_id: clientId,
    crm_provider: "ghl",
    crm_id: id,
    first_name: pick(contact, "firstName", "first_name"),
    last_name: pick(contact, "lastName", "last_name"),
    email: pick(contact, "email"),
    phone: pick(contact, "phone"),
    source: crmSource,
    channel: classifyChannel({ hasMetaFormId: !!formId, utms, crmSource }),
    landing_page_url: landing,
    ...utms,
    meta_campaign_id: metaId(pick(first, "campaignId", "utmCampaignId", "fbCampaignId")) ?? fromUtms.campaign,
    meta_adset_id: metaId(pick(first, "adSetId", "adsetId", "adGroupId", "utmAdsetId", "fbAdsetId")) ?? fromUtms.adset,
    meta_ad_id: metaId(pick(first, "adId", "utmAdId", "fbAdId")) ?? fromUtms.ad,
    meta_form_id: formId,
    meta_lead_id: metaId(pick(first, "fbLeadId", "leadgenId", "leadId")),
    pipeline_name: stage?.pipeline_name ?? null,
    stage_name: stage?.stage_name ?? null,
    lifecycle_hint: stage?.lifecycle_hint ?? null,
    value: stage?.value ?? null,
    crm_created_at: new Date(created).toISOString(),
    crm_updated_at: (() => {
      const u = pick(contact, "dateUpdated", "updatedAt");
      return u ? new Date(u).toISOString() : null;
    })(),
    raw: contact,
  };
}
