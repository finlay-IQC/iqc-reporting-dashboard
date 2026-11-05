import { signOut } from "@/app/actions";
import { Logo } from "@/components/logo";

export const metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-sm text-center">
        <Logo className="justify-center text-base" />
        <h1 className="mt-6 text-lg font-semibold">You&apos;re signed in, but don&apos;t have access yet</h1>
        <p className="mt-2 text-sm text-ink-2">Ask an IQC admin to add your account to the dashboard.</p>
        <form action={signOut}>
          <button className="mt-5 text-sm font-medium text-brand">Sign out</button>
        </form>
      </div>
    </main>
  );
}
