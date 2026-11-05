import { Logo } from "@/components/logo";

/** Shown until the Supabase env vars are configured, instead of a crash. */
export function SetupScreen() {
  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <Logo className="text-lg" />
      <h1 className="mt-8 text-xl font-semibold">Connect Supabase to finish setup</h1>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink-2">
        <li>Create a Supabase project in an EU region.</li>
        <li>Run the SQL in <code className="font-mono">supabase/migrations/</code>, then optionally <code className="font-mono">supabase/seed.sql</code> for demo data.</li>
        <li>
          Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (see <code className="font-mono">.env.example</code>) and redeploy.
        </li>
      </ol>
      <p className="mt-4 text-sm text-ink-2">Full steps are in the README.</p>
    </main>
  );
}
