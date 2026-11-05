import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getClients } from "@/lib/data/reports";

export const metadata = { title: "Clients" };

const crmLabel = { ghl: "GoHighLevel", zoho: "Zoho CRM" } as const;

export default async function ClientsPage() {
  const clients = await getClients();
  return (
    <>
      <PageHeader title="Clients" subtitle="Every account reporting into the dashboard" />
      {clients.length === 0 ? (
        <Card><EmptyState title="No clients yet" /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.slug}`} className="rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                {c.is_demo && <Badge>demo</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <Badge tone={c.crm_provider ? "brand" : "neutral"}>{c.crm_provider ? crmLabel[c.crm_provider] : "No CRM"}</Badge>
                {!c.is_active && <Badge tone="warn">inactive</Badge>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
