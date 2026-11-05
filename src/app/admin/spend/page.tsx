import { asc, gte, sql } from "drizzle-orm";
import { PageHeader, Stat, Table } from "@/components/ui";
import { db, schema } from "@/db";

export const metadata = { title: "AI spend" };

export default async function SpendPage() {
  const clients = await db.query.clients.findMany({ orderBy: asc(schema.clients.name) });
  const month = sql`date_trunc('month', now())`;
  const spend = await db
    .select({ clientId: schema.agentRuns.clientId, usd: sql<number>`coalesce(sum(${schema.agentRuns.costUsdMicros}),0)/1e6`, runs: sql<number>`count(*)`, failed: sql<number>`count(*) filter (where ${schema.agentRuns.status} in ('failed','budget_exceeded'))` })
    .from(schema.agentRuns)
    .where(gte(schema.agentRuns.startedAt, month))
    .groupBy(schema.agentRuns.clientId);
  const bySkill = await db
    .select({ skill: schema.agentRuns.skillKey, usd: sql<number>`coalesce(sum(${schema.agentRuns.costUsdMicros}),0)/1e6`, runs: sql<number>`count(*)` })
    .from(schema.agentRuns)
    .where(gte(schema.agentRuns.startedAt, month))
    .groupBy(schema.agentRuns.skillKey)
    .orderBy(sql`2 desc`);
  const spendBy = new Map(spend.map((s) => [s.clientId, s]));
  const total = spend.reduce((a, s) => a + Number(s.usd), 0);
  const budget = clients.reduce((a, c) => a + c.tokenBudgetMonthlyUsd, 0);
  return (
    <>
      <PageHeader title="AI spend" subtitle="This calendar month, metered per call from token usage." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Spend (month)" value={`$${total.toFixed(2)}`} />
        <Stat label="Total budgets" value={`$${budget}`} />
        <Stat label="Runs" value={spend.reduce((a, s) => a + Number(s.runs), 0)} />
        <Stat label="Failed / over budget" value={spend.reduce((a, s) => a + Number(s.failed), 0)} />
      </div>
      <Table head={["Client", "Budget", "Spent", "Used", "Runs", "Failed"]}>
        {clients.map((c) => {
          const s = spendBy.get(c.id);
          const used = c.tokenBudgetMonthlyUsd ? (Number(s?.usd ?? 0) / c.tokenBudgetMonthlyUsd) * 100 : 0;
          return (
            <tr key={c.id}>
              <td className="px-4 py-2 font-medium">{c.name}</td>
              <td className="px-4 py-2">${c.tokenBudgetMonthlyUsd}</td>
              <td className="px-4 py-2">${Number(s?.usd ?? 0).toFixed(2)}</td>
              <td className="px-4 py-2">
                <div className="h-2 w-32 overflow-hidden rounded bg-zinc-100"><div className={`h-2 ${used >= 100 ? "bg-red-500" : used >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, used)}%` }} /></div>
                <span className="text-xs text-zinc-500">{used.toFixed(0)}%</span>
              </td>
              <td className="px-4 py-2">{Number(s?.runs ?? 0)}</td>
              <td className="px-4 py-2">{Number(s?.failed ?? 0)}</td>
            </tr>
          );
        })}
      </Table>
      <h2 className="mb-2 mt-8 text-sm font-semibold">By skill</h2>
      <Table head={["Skill", "Spent", "Runs"]}>
        {bySkill.map((r) => (
          <tr key={r.skill}><td className="px-4 py-2">{r.skill}</td><td className="px-4 py-2">${Number(r.usd).toFixed(2)}</td><td className="px-4 py-2">{Number(r.runs)}</td></tr>
        ))}
        {bySkill.length === 0 ? <tr><td colSpan={3} className="px-4 py-6 text-center text-zinc-500">No AI runs this month.</td></tr> : null}
      </Table>
    </>
  );
}
