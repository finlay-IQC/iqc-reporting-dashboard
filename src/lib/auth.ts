import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string; role: "admin" | "viewer"; name: string };

/**
 * The signed-in head-office user. Redirects to /login if signed out, and to
 * /no-access if they have a Supabase login but aren't listed in app_users.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  const { data: row } = await supabase
    .from("app_users")
    .select("role, display_name")
    .eq("user_id", claims.sub)
    .maybeSingle();
  if (!row) redirect("/no-access");

  const email = typeof claims.email === "string" ? claims.email : "";
  return { id: claims.sub, email, role: row.role, name: row.display_name || email.split("@")[0] };
});
