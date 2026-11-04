import { and, eq, gte, inArray, isNull, lt, notExists, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { raiseAlert } from "@/lib/alerts";
import { sendMail } from "@/lib/email";
import { getIntegration } from "@/lib/settings";

export async function platformBlockedRegions(): Promise<string[]> {
  const { value } = await getIntegration("compliance");
  return String(value.blockedRegions ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));
}

/** Hourly: alert the agency (and email super admins once) when a client crosses the budget threshold. */
export async function checkBudgets() {
  const { value } = await getIntegration("compliance");
  const threshold = Number(value.budgetAlertPercent ?? 80) / 100;
  const clients = await db.query.clients.findMany({ where: eq(schema.clients.status, "active") });
  const month = new Date().toISOString().slice(0, 7);
  let raised = 0;
  for (const c of clients) {
    if (!c.tokenBudgetMonthlyUsd) continue;
    const [row] = await db
      .select({ micros: sql<number>`coalesce(sum(${schema.agentRuns.costUsdMicros}),0)` })
      .from(schema.agentRuns)
      .where(and(eq(schema.agentRuns.clientId, c.id), gte(schema.agentRuns.startedAt, sql`date_trunc('month', now())`)));
    const spent = Number(row.micros) / 1e6;
    const share = spent / c.tokenBudgetMonthlyUsd;
    if (share >= 1) {
      const created = await raiseAlert({ clientId: c.id, severity: "critical", type: "budget", dedupeKey: `budget:${c.id}:${month}:exhausted`, message: `${c.name} has used its full $${c.tokenBudgetMonthlyUsd} AI budget for ${month}. AI jobs are paused until the budget is raised.` });
      if (created) {
        raised++;
        await notifySuperAdmins(`AI budget exhausted: ${c.name}`, `${c.name} spent $${spent.toFixed(2)} of $${c.tokenBudgetMonthlyUsd} this month. Raise the budget under Admin → Clients to resume AI jobs.`);
      }
    } else if (share >= threshold) {
      if (await raiseAlert({ clientId: c.id, severity: "warning", type: "budget", dedupeKey: `budget:${c.id}:${month}:threshold`, message: `${c.name} has used ${Math.round(share * 100)}% of its $${c.tokenBudgetMonthlyUsd} monthly AI budget.` })) raised++;
    }
  }
  return { raised };
}

async function notifySuperAdmins(subject: string, text: string) {
  const admins = await db.query.users.findMany({ where: and(eq(schema.users.role, "super_admin"), eq(schema.users.isActive, true)) });
  for (const a of admins) await sendMail({ to: a.email, subject, text, html: `<p>${text}</p>` });
}

/**
 * Daily retention: delete leads that never engaged (no thread, not pushed/replied/meeting)
 * older than the client's window, and raw webhook events past the platform window.
 */
export async function runRetention() {
  const { value } = await getIntegration("compliance");
  const defaultDays = Number(value.retentionDays ?? 365);
  const webhookDays = Number(value.webhookRetentionDays ?? 90);
  const clients = await db.query.clients.findMany();
  let deletedLeads = 0;
  for (const c of clients) {
    const days = c.dataRetentionDays > 0 ? Math.min(c.dataRetentionDays, defaultDays || c.dataRetentionDays) : defaultDays;
    if (!days) continue;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const rows = await db
      .delete(schema.leads)
      .where(
        and(
          eq(schema.leads.clientId, c.id),
          lt(schema.leads.createdAt, cutoff),
          inArray(schema.leads.status, ["new", "rejected", "approved", "bounced"]),
          isNull(schema.leads.campaignId),
          notExists(db.select({ one: sql`1` }).from(schema.threads).where(eq(schema.threads.leadId, schema.leads.id))),
        ),
      )
      .returning({ id: schema.leads.id });
    deletedLeads += rows.length;
    if (rows.length) await db.insert(schema.auditLog).values({ clientId: c.id, action: "retention.leads_deleted", entityType: "lead", diff: { count: rows.length, days } });
  }
  const wh = await db.delete(schema.webhookEvents).where(lt(schema.webhookEvents.receivedAt, new Date(Date.now() - webhookDays * 86_400_000))).returning({ id: schema.webhookEvents.id });
  return { deletedLeads, deletedWebhookEvents: wh.length };
}
