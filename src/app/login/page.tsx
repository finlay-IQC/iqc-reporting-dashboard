import { Logo } from "@/components/logo";
import { SetupScreen } from "@/components/setup-screen";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  if (!isSupabaseConfigured()) return <SetupScreen />;
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <Logo className="text-base" />
        <div className="mt-6 rounded-xl border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mb-5 mt-1 text-sm text-ink-2">Lead and campaign reporting for IQC clients.</p>
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </div>
        <p className="mt-4 text-center text-xs text-ink-3">Access is by invitation. Contact IQC if you need an account.</p>
      </div>
    </main>
  );
}
