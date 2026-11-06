import type { CrmAdapter, CrmProvider } from "./types";

/** Adapter registry. GHL lands in build step 3; Zoho is added the same way for TFO. */
const adapters: Partial<Record<CrmProvider, () => Promise<CrmAdapter>>> = {
  ghl: () => import("./ghl").then((m) => m.ghlAdapter),
  // zoho: () => import("./zoho").then((m) => m.zohoAdapter),
};

export async function getCrmAdapter(provider: CrmProvider): Promise<CrmAdapter> {
  const load = adapters[provider];
  if (!load) throw new Error(`No CRM adapter registered for "${provider}" yet`);
  return load();
}

export type * from "./types";
