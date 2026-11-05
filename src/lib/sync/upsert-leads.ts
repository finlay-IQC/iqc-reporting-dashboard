import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedLead } from "@/lib/crm/types";

/** Idempotent write of normalised leads. Safe to re-run over the same window. */
export async function upsertLeads(admin: SupabaseClient, leads: NormalizedLead[], chunkSize = 500) {
  let written = 0;
  for (let i = 0; i < leads.length; i += chunkSize) {
    const chunk = leads.slice(i, i + chunkSize).map((l) => ({ ...l, synced_at: new Date().toISOString() }));
    const { error } = await admin.from("leads").upsert(chunk, { onConflict: "client_id,crm_provider,crm_id" });
    if (error) throw new Error(`Lead upsert failed: ${error.message}`);
    written += chunk.length;
  }
  return written;
}
