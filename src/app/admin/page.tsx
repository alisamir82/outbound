import { count, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { Card, PageHeader, Stat } from "@/components/ui";

export default async function AdminOverview() {
  const [[clientCount], [activeCount], [userCount], [leadCount], recent] = await Promise.all([
    db.select({ n: count() }).from(schema.clients),
    db.select({ n: count() }).from(schema.clients).where(eq(schema.clients.status, "active")),
    db.select({ n: count() }).from(schema.users),
    db.select({ n: count() }).from(schema.leads),
    db
      .select({
        id: schema.auditLog.id,
        action: schema.auditLog.action,
        createdAt: schema.auditLog.createdAt,
        actor: schema.users.name,
        client: schema.clients.name,
      })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.auditLog.actorUserId, schema.users.id))
      .leftJoin(schema.clients, eq(schema.auditLog.clientId, schema.clients.id))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(15),
  ]);
  const spend = await db
    .select({ usd: sql<number>`coalesce(sum(${schema.agentRuns.costUsdMicros}),0)/1e6` })
    .from(schema.agentRuns)
    .where(sql`${schema.agentRuns.startedAt} >= date_trunc('month', now())`);

  return (
    <>
      <PageHeader title="Overview" subtitle="Platform-wide health" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Clients" value={clientCount.n} />
        <Stat label="Active" value={activeCount.n} />
        <Stat label="Users" value={userCount.n} />
        <Stat label="Leads" value={leadCount.n} />
        <Stat label="AI spend (month)" value={`$${Number(spend[0]?.usd ?? 0).toFixed(2)}`} />
      </div>
      <Card title="Recent activity">
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing yet. <Link href="/admin/clients/new" className="underline">Create the first client</Link>.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex justify-between py-2">
                <span>
                  <span className="font-medium">{r.actor ?? "system"}</span> · {r.action}
                  {r.client ? <span className="text-zinc-500"> · {r.client}</span> : null}
                </span>
                <time className="text-zinc-500">{r.createdAt.toLocaleString()}</time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
