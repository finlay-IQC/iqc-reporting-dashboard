import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { Logo } from "@/components/logo";
import { Nav } from "@/components/nav";
import { SetupScreen } from "@/components/setup-screen";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  if (!isSupabaseConfigured()) return <SetupScreen />;
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 items-center justify-between gap-4 bg-sidebar px-4 py-3 text-white md:sticky md:top-0 md:h-screen md:w-60 md:flex-col md:items-stretch md:justify-start md:px-4 md:py-5">
        <Logo className="text-sm" />
        <div className="md:mt-8 md:flex-1">
          <Nav />
        </div>
        <div className="hidden border-t border-white/10 pt-4 md:block">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-sidebar-ink">{user.email}</div>
          <form action={signOut}>
            <button className="mt-3 inline-flex items-center gap-1.5 text-xs text-sidebar-ink hover:text-white">
              <LogOut className="size-3.5" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
