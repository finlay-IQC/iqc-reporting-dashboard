import type { Channel } from "@/lib/crm/types";

/**
 * Attribution helpers shared by every CRM adapter.
 *
 * Recommended Meta "URL parameters" for landing-page ads (see docs/ATTRIBUTION.md):
 *   utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}
 * IDs survive campaign renames; the dashboard looks the names up from Meta.
 */

export type UtmFields = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
};

const META_ID = /^\d{6,25}$/;
const META_SOURCES = new Set(["facebook", "fb", "instagram", "ig", "meta", "facebook_ads", "facebook ads", "an", "msg"]);
const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paid_social", "paidsocial", "paid-social", "social_paid", "cpm", "ads"]);

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  // Unfilled Meta macros like "{{ad.id}}" are useless — treat as missing.
  if (!t || /^\{\{.*\}\}$/.test(t)) return null;
  return t;
};

/** Pulls UTMs and fbclid out of a landing page URL. Tolerates junk input. */
export function parseLandingUrl(url: string | null | undefined): UtmFields {
  const empty: UtmFields = { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, fbclid: null };
  if (!url) return empty;
  let params: URLSearchParams;
  try {
    params = new URL(url, "https://placeholder.invalid").searchParams;
  } catch {
    return empty;
  }
  return {
    utm_source: clean(params.get("utm_source")),
    utm_medium: clean(params.get("utm_medium")),
    utm_campaign: clean(params.get("utm_campaign")),
    utm_content: clean(params.get("utm_content")),
    utm_term: clean(params.get("utm_term")),
    fbclid: clean(params.get("fbclid")),
  };
}

/** Explicit values win over values parsed from the URL. */
export function mergeUtms(explicit: Partial<UtmFields>, fromUrl: UtmFields): UtmFields {
  const pick = (k: keyof UtmFields) => clean(explicit[k] ?? null) ?? fromUrl[k];
  return {
    utm_source: pick("utm_source"),
    utm_medium: pick("utm_medium"),
    utm_campaign: pick("utm_campaign"),
    utm_content: pick("utm_content"),
    utm_term: pick("utm_term"),
    fbclid: pick("fbclid"),
  };
}

/** Meta IDs carried in UTMs using the recommended convention. Names are left for SQL to match. */
export function metaIdsFromUtms(u: UtmFields): { campaign: string | null; adset: string | null; ad: string | null } {
  const id = (v: string | null) => (v && META_ID.test(v) ? v : null);
  return { campaign: id(u.utm_campaign), adset: id(u.utm_term), ad: id(u.utm_content) };
}

export function isMetaSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const s = source.trim().toLowerCase();
  return META_SOURCES.has(s) || s.includes("facebook") || s.includes("instagram");
}

export function classifyChannel(input: {
  hasMetaFormId: boolean;
  utms: UtmFields;
  crmSource?: string | null;
}): Channel {
  const { utms } = input;
  if (input.hasMetaFormId) return "meta_form";
  const crmSource = input.crmSource?.toLowerCase() ?? "";
  if (/lead\s*form|instant\s*form|lead\s*ad/.test(crmSource) && isMetaSource(crmSource)) return "meta_form";
  if (isMetaSource(utms.utm_source) || utms.fbclid) return "meta_landing_page";
  const medium = utms.utm_medium?.toLowerCase();
  if (medium && PAID_MEDIUMS.has(medium)) return "other_paid";
  if (utms.utm_source || crmSource) return "organic";
  return "unknown";
}
