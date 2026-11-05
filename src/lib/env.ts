// Trim (and strip stray quotes) so a value pasted into Vercel with a trailing
// newline or "quotes" still works.
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

/** Also strips a pasted API path (".../rest/v1/", ".../auth/v1") and trailing slashes. */
export function normaliseSupabaseUrl(v: string | undefined): string {
  return clean(v).replace(/\/(rest|auth|storage|realtime|functions|graphql)\/v1\/?.*$/i, "").replace(/\/+$/, "");
}

export const supabaseUrl = normaliseSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabasePublishableKey = clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

/** False until the Supabase env vars are set — the app shows a setup screen instead of crashing. */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}
