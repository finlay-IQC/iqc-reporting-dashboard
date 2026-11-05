/**
 * The CRM-agnostic lead shape. Every CRM adapter (GHL now, Zoho later) converts
 * its own records into this, and nothing downstream knows which CRM it came from.
 * Mirrors the `leads` table.
 */
export type CrmProvider = "ghl" | "zoho";

export type Lifecycle =
  | "new" | "contacted" | "qualified" | "booked" | "showed" | "won" | "lost" | "unqualified";

export type Channel = "meta_form" | "meta_landing_page" | "other_paid" | "organic" | "unknown";

export type NormalizedLead = {
  client_id: string;
  crm_provider: CrmProvider;
  crm_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  channel: Channel;
  landing_page_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  meta_form_id: string | null;
  meta_lead_id: string | null;
  pipeline_name: string | null;
  stage_name: string | null;
  lifecycle_hint: Lifecycle | null;
  value: number | null;
  crm_created_at: string; // ISO timestamp
  crm_updated_at: string | null;
  raw: unknown;
};

export type CrmClientConfig = {
  id: string;
  slug: string;
  crm_provider: CrmProvider;
  crm_account_id: string; // GHL location ID / Zoho org ID
};

export interface CrmAdapter {
  provider: CrmProvider;
  /** Pages through leads created or updated since `since`, yielding batches. */
  fetchLeads(client: CrmClientConfig, opts: { since: Date }): AsyncIterable<NormalizedLead[]>;
  /** Turns a CRM webhook payload into a lead, or null if the event isn't relevant. */
  parseWebhook?(client: CrmClientConfig, payload: unknown): Promise<NormalizedLead | null>;
}
