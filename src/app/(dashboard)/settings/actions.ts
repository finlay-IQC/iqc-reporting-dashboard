"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getCrmAdapter } from "@/lib/crm";
import { encryptSecret } from "@/lib/crypto";
import { graphGet } from "@/lib/meta/graph";
import { normaliseAccountId } from "@/lib/meta/parse";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncClient } from "@/lib/sync/run";

export type ActionState = { ok?: boolean; message?: string };

async function requireAdmin() {
  const user = await getCurrentUser();
  if (user.role !== "admin") throw new Error("Only admins can change settings.");
  return user;
}

const fail = (message: string): ActionState => ({ ok: false, message });
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/**
 * Creates or updates a client and its connections. Credentials are checked
 * against Meta and GHL *before* anything is saved, so a typo never leaves a
 * half-configured client behind.
 */
export async function saveClient(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const name = String(form.get("name") ?? "").trim();
    const slug = slugify(name);
    if (!name || !slug) return fail("Enter a client name.");

    const rawAccounts = String(form.get("meta_accounts") ?? "").split(/[\s,]+/).filter(Boolean);
    const accounts = rawAccounts.map(normaliseAccountId);
    const bad = rawAccounts.filter((_, i) => !accounts[i]);
    if (bad.length) return fail(`These don't look like Meta ad account IDs: ${bad.join(", ")}. Use the number from Ads Manager, e.g. act_123456789.`);
    const accountIds = [...new Set(accounts as string[])];

    const locationId = String(form.get("ghl_location_id") ?? "").trim();
    const ghlToken = String(form.get("ghl_token") ?? "").trim();
    if (ghlToken && !locationId) return fail("Add the GHL Location ID as well as the token.");

    const admin = createAdminClient();
    const { data: existing } = await admin.from("clients").select("id").eq("slug", slug).maybeSingle();

    // ── Validate Meta access
    const accountNames: string[] = [];
    for (const id of accountIds) {
      const { data: owner } = await admin.from("meta_ad_accounts").select("client_id").eq("id", id).maybeSingle();
      if (owner && owner.client_id !== existing?.id) return fail(`${id} is already linked to another client.`);
      try {
        const a = await graphGet<{ name?: string }>(id, { fields: "name" });
        accountNames.push(a.name ?? id);
      } catch (e) {
        return fail(`Meta: ${errorText(e)}`);
      }
    }

    // ── Validate GHL access
    let ghlName: string | null = null;
    if (ghlToken) {
      try {
        ghlName = await (await getCrmAdapter("ghl")).testConnection({ id: "test", slug, crm_provider: "ghl", crm_account_id: locationId, token: ghlToken });
      } catch (e) {
        return fail(`GoHighLevel: ${errorText(e)}`);
      }
    }

    // ── Save
    const clientRow = { name, slug, ...(ghlToken ? { crm_provider: "ghl" as const, crm_account_id: locationId } : {}) };
    const { data: client, error } = existing
      ? await admin.from("clients").update(clientRow).eq("id", existing.id).select("id").single()
      : await admin.from("clients").insert(clientRow).select("id").single();
    if (error || !client) return fail(`Saving client failed: ${error?.message}`);

    const { data: seg } = await admin.from("segments").select("id").eq("client_id", client.id).eq("is_default", true).maybeSingle();
    if (!seg) await admin.from("segments").insert({ client_id: client.id, name: "All campaigns", kind: "other", is_default: true });

    if (accountIds.length) {
      const { error: accErr } = await admin.from("meta_ad_accounts").upsert(
        accountIds.map((id, i) => ({ id, client_id: client.id, name: accountNames[i], is_active: true })),
        { onConflict: "id" },
      );
      if (accErr) return fail(`Saving ad accounts failed: ${accErr.message}`);
    }

    if (ghlToken) {
      const { error: connErr } = await admin.from("crm_connections").upsert(
        {
          client_id: client.id,
          provider: "ghl",
          account_id: locationId,
          token_ciphertext: encryptSecret(ghlToken),
          token_hint: ghlToken.slice(-4),
          status: "ok",
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id" },
      );
      if (connErr) return fail(`Saving GHL connection failed: ${connErr.message}`);
    }

    revalidatePath("/", "layout");
    const parts = [
      accountNames.length ? `Meta: ${accountNames.join(", ")}` : null,
      ghlName ? `GHL: ${ghlName}` : null,
    ].filter(Boolean);
    return { ok: true, message: `${existing ? "Updated" : "Added"} ${name}${parts.length ? ` (${parts.join(" · ")})` : ""}. Now press “Sync now” to pull the last 90 days.` };
  } catch (e) {
    return fail(errorText(e));
  }
}

export async function syncNow(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const clientId = String(form.get("client_id") ?? "");
    const full = form.get("full") === "1";
    const admin = createAdminClient();
    const r = await syncClient(admin, clientId, { full });
    revalidatePath("/", "layout");

    const problems = [
      ...r.meta.filter((m) => !m.ok).map((m) => `Meta ${m.account}: ${"error" in m ? m.error : ""}`),
      ...(r.crm && !r.crm.ok ? [`GHL: ${r.crm.error}`] : []),
    ];
    if (problems.length) return fail(problems.join(" · "));

    const spend = r.meta.reduce((s, m) => s + (m.ok ? Number(m.stats.spend) : 0), 0);
    const leads = r.crm?.ok ? r.crm.stats.leads : null;
    const bits = [
      r.meta.length ? `Meta: £${spend.toFixed(2)} spend across ${r.meta.length} account${r.meta.length > 1 ? "s" : ""}` : "No Meta accounts",
      r.crm ? `GHL: ${leads} lead${leads === 1 ? "" : "s"}` : "No GHL connection",
    ];
    return { ok: true, message: `Synced. ${bits.join(" · ")}.` };
  } catch (e) {
    return fail(errorText(e));
  }
}

export async function addSegmentRule(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const clientId = String(form.get("client_id") ?? "");
    const segmentName = String(form.get("segment") ?? "").trim();
    const kind = String(form.get("kind") ?? "other");
    const pattern = String(form.get("pattern") ?? "").trim();
    if (!clientId || !segmentName || !pattern) return fail("Choose a client and fill in the segment name and the text to match.");

    const admin = createAdminClient();
    let { data: seg } = await admin.from("segments").select("id").eq("client_id", clientId).eq("name", segmentName).maybeSingle();
    if (!seg) {
      const ins = await admin.from("segments").insert({ client_id: clientId, name: segmentName, kind }).select("id").single();
      if (ins.error) return fail(ins.error.message);
      seg = ins.data;
    }
    const { error } = await admin.from("segment_rules").insert({ segment_id: seg!.id, match_type: "campaign_name_contains", pattern });
    if (error) return fail(error.message);
    revalidatePath("/", "layout");
    return { ok: true, message: `Campaigns containing “${pattern}” now report under ${segmentName}.` };
  } catch (e) {
    return fail(errorText(e));
  }
}

export async function deleteSegmentRule(form: FormData) {
  await requireAdmin();
  await createAdminClient().from("segment_rules").delete().eq("id", String(form.get("rule_id") ?? ""));
  revalidatePath("/", "layout");
}

export async function updateStageMapping(form: FormData) {
  await requireAdmin();
  const lifecycle = String(form.get("lifecycle") ?? "");
  const allowed = ["new", "contacted", "qualified", "booked", "showed", "won", "lost", "unqualified"];
  if (!allowed.includes(lifecycle)) return;
  await createAdminClient().from("stage_mappings").update({ lifecycle }).eq("id", String(form.get("mapping_id") ?? ""));
  revalidatePath("/", "layout");
}

export async function removeDemoData() {
  await requireAdmin();
  await createAdminClient().from("clients").delete().eq("is_demo", true);
  revalidatePath("/", "layout");
}
