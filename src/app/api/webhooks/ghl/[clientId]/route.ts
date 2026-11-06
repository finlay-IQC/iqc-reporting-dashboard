import { getCrmAdapter } from "@/lib/crm";
import { verifyWebhookKey } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmConfig } from "@/lib/sync/run";
import { upsertLeads } from "@/lib/sync/upsert-leads";

/**
 * Real-time new leads. In GHL: Automation → Workflow → trigger "Contact Created"
 * → action "Webhook" (POST) to the URL shown in Settings for this client.
 * The URL carries a per-client key; we then re-fetch the contact from the API
 * rather than trusting the payload.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/ghl/[clientId]">) {
  const { clientId } = await ctx.params;
  const key = new URL(request.url).searchParams.get("key");
  if (!/^[0-9a-f-]{36}$/i.test(clientId) || !verifyWebhookKey(clientId, key)) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const admin = createAdminClient();
  const config = await getCrmConfig(admin, clientId);
  if (!config || config.crm_provider !== "ghl") return Response.json({ error: "Client has no GHL connection" }, { status: 404 });

  // Ignore events for a different sub-account (e.g. a copied workflow).
  const p = (payload ?? {}) as Record<string, unknown>;
  const locationId = (p.location as Record<string, unknown> | undefined)?.id ?? p.locationId ?? p.location_id;
  if (typeof locationId === "string" && locationId !== config.crm_account_id) {
    return Response.json({ ok: true, ignored: "different location" });
  }

  try {
    const lead = await (await getCrmAdapter("ghl")).handleWebhook(config, payload);
    if (!lead) return Response.json({ ok: true, ignored: "no contact id in payload" });
    await upsertLeads(admin, [lead]);
    return Response.json({ ok: true, lead: lead.crm_id });
  } catch (e) {
    console.error("GHL webhook failed", clientId, e);
    // 500 lets GHL retry.
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
