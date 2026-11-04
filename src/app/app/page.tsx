import { count, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, PageHeader, Stat } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

export default async function ClientDashboard({ searchParams }: PageProps<"/app">) {
  const sp = await searchParams;
  const { clientId } = await requireClientScope(typeof sp.as === "string" ? sp.as : null);
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
  if (!client) notFound();
  const [[leads], [icps]] = await Promise.all([
    db.select({ n: count() }).from(schema.leads).where(eq(schema.leads.clientId, clientId)),
    db.select({ n: count() }).from(schema.icps).where(eq(schema.icps.clientId, clientId)),
  ]);
  const steps = [
    { key: "profile", label: "Complete company profile", done: client.onboarding.profile },
    { key: "knowledgeBase", label: "Upload case studies and sales material", done: client.onboarding.knowledgeBase },
    { key: "calendar", label: "Connect your calendar", done: client.onboarding.calendar },
    { key: "icp", label: "Create your first Ideal Customer Profile", done: client.onboarding.icp },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <>
      <PageHeader title={client.name} subtitle="Outbound dashboard" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="ICPs" value={icps.n} />
        <Stat label="Leads" value={leads.n} />
        <Stat label="Campaigns" value={0} />
        <Stat label="Meetings booked" value={0} />
      </div>
      {remaining > 0 ? (
        <Card title={`Getting started · ${steps.length - remaining}/${steps.length} done`}>
          <ol className="space-y-2 text-sm">
            {steps.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className={s.done ? "text-emerald-600" : "text-zinc-300"}>●</span>
                <span className={s.done ? "text-zinc-400 line-through" : ""}>{s.label}</span>
                {!s.done ? <span className="text-xs text-zinc-400">(coming in the next phase)</span> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </>
  );
}
