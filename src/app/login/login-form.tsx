"use client";

import { useActionState, useState } from "react";
import { signIn, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  // Controlled so React 19's post-action form reset doesn't wipe the email after a failed attempt.
  const [email, setEmail] = useState("");
  const input = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <label className="block text-sm font-medium">
        Email
        <input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
