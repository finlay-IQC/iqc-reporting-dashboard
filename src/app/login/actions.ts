"use server";

import { redirect } from "next/navigation";
import { supabaseUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

/** Only allow same-site relative redirects after login. */
function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

function loginErrorMessage(code: string | undefined, status: number | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "That email and password don't match an account.";
    case "email_not_confirmed":
      return "This account's email hasn't been confirmed yet. Ask an IQC admin to confirm it in Supabase.";
    case "user_banned":
      return "This account has been disabled.";
    case "over_request_rate_limit":
      return "Too many attempts. Wait a minute and try again.";
  }
  if (!status || status >= 500) {
    const hint = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(supabaseUrl)
      ? "Check the project isn't paused in Supabase."
      : "That doesn't look like a Supabase project URL. It should be exactly https://<project-ref>.supabase.co (Project Settings → Data API). Fix NEXT_PUBLIC_SUPABASE_URL in Vercel and redeploy.";
    return `The login service at ${supabaseUrl} couldn't be reached. ${hint}`;
  }
  if (status === 401 || status === 403) return "The app's Supabase key was rejected. Check NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel.";
  return "Sign-in failed. Please try again.";
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Visible in Vercel → Logs. Never log the password.
    console.error("Login failed", { email, code: error.code, status: error.status, message: error.message });
    return { error: loginErrorMessage(error.code, error.status) };
  }

  redirect(safeNext(formData.get("next")));
}
