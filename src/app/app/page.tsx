import { and, count, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, LinkButton, PageHeader, Stat } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClientScope } from "@/lib/session";

export default async function ClientDashboard() {
  const { clientId } = await requireClientScope();
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
  if (!client) notFound();
  const [[leads], [toReview], [icps], [campaigns], [meetings]] = await Promise.all([
    db.select({ n: count() }).from(schema.leads).where(eq(schema.leads.clientId, clientId)),
    db.select({ n: count() }).from(schema.leads).where(and(eq(schema.leads.clientId, clientId), eq(schema.leads.status, "new"))),
    db.select({ n: count() }).from(schema.icps).where(eq(schema.icps.clientId, clientId)),
    db.select({ n: count() }).from(schema.campaigns).where(and(eq(schema.campaigns.clientId, clientId), inArray(schema.campaigns.status, ["active", "pushed", "paused"]))),
    db.select({ n: count() }).from(schema.leads).where(and(eq(schema.leads.clientId, clientId), eq(schema.leads.status, "meeting"))),
  ]);
  const steps = [
    { key: "profile", label: "Complete company profile", done: client.onboarding.profile, href: null },
    { key: "icp", label: "Create your first Ideal Customer Profile", done: client.onboarding.icp || icps.n > 0, href: "/app/icps/new" },
    { key: "knowledgeBase", label: "Upload case studies and sales material", done: client.onboarding.knowledgeBase, href: null },
    { key: "calendar", label: "Connect your calendar", done: client.onboarding.calendar, href: null },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <>
      <PageHeader title={client.name} subtitle="Outbound dashboard" actions={<LinkButton href="/app/icps/new">New ICP</LinkButton>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="ICPs" value={icps.n} />
        <Stat label="Leads" value={leads.n} />
        <Stat label="Awaiting review" value={toReview.n} />
        <Stat label="Live campaigns" value={campaigns.n} />
        <Stat label="Meetings booked" value={meetings.n} />
      </div>
      {toReview.n > 0 ? (
        <Card className="mb-6">
          <p className="text-sm">
            <strong>{toReview.n}</strong> leads are waiting for your approval.{" "}
            <Link href="/app/leads?status=new" className="underline">
              Review them
            </Link>
            .
          </p>
        </Card>
      ) : null}
      {remaining > 0 ? (
        <Card title={`Getting started · ${steps.length - remaining}/${steps.length} done`}>
          <ol className="space-y-2 text-sm">
            {steps.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className={s.done ? "text-emerald-600" : "text-zinc-300"}>●</span>
                {s.done ? (
                  <span className="text-zinc-400 line-through">{s.label}</span>
                ) : s.href ? (
                  <Link href={s.href} className="underline">
                    {s.label}
                  </Link>
                ) : (
                  <>
                    <span>{s.label}</span>
                    <span className="text-xs text-zinc-400">(next phase)</span>
                  </>
                )}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </>
  );
}
