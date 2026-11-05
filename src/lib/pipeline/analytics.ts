import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getInstantly } from "@/lib/instantly/client";
import { raiseAlert, clearAlert } from "@/lib/alerts";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Hourly: pull the last 14 days of daily stats for every live campaign and refresh campaign totals. */
export async function syncCampaignAnalytics() {
  const instantly = await getInstantly();
  const campaigns = await db.query.campaigns.findMany({
    where: inArray(schema.campaigns.status, ["active", "pushed", "paused"]),
  });
  const to = day(new Date());
  const from = day(new Date(Date.now() - 13 * 86_400_000));
  let synced = 0;
  for (const c of campaigns) {
    if (!c.instantlyCampaignId) continue;
    const [{ n: volume }] = await db.select({ n: sql<number>`count(*)` }).from(schema.leads).where(eq(schema.leads.campaignId, c.id));
    let rows;
    try {
      rows = await instantly.getCampaignDailyStats(c.instantlyCampaignId, from, to, { volume: Number(volume) / 5 });
    } catch (e) {
      await raiseAlert({ clientId: c.clientId, severity: "warning", type: "campaign", dedupeKey: `analytics:${c.id}`, message: `Analytics sync failed for "${c.name}": ${(e as Error).message}` });
      continue;
    }
    await clearAlert(`analytics:${c.id}`);
    for (const r of rows) {
      await db
        .insert(schema.campaignStatsDaily)
        .values({ clientId: c.clientId, campaignId: c.id, day: r.day, sent: r.sent, opened: r.opened, replied: r.replied, bounced: r.bounced })
        .onConflictDoUpdate({ target: [schema.campaignStatsDaily.campaignId, schema.campaignStatsDaily.day], set: { sent: r.sent, opened: r.opened, replied: r.replied, bounced: r.bounced } });
    }
    const [totals] = await db
      .select({
        sent: sql<number>`coalesce(sum(${schema.campaignStatsDaily.sent}),0)`,
        opened: sql<number>`coalesce(sum(${schema.campaignStatsDaily.opened}),0)`,
        replied: sql<number>`coalesce(sum(${schema.campaignStatsDaily.replied}),0)`,
        bounced: sql<number>`coalesce(sum(${schema.campaignStatsDaily.bounced}),0)`,
      })
      .from(schema.campaignStatsDaily)
      .where(eq(schema.campaignStatsDaily.campaignId, c.id));
    const [{ meetings }] = await db
      .select({ meetings: sql<number>`count(*)` })
      .from(schema.meetings)
      .innerJoin(schema.leads, eq(schema.leads.id, schema.meetings.leadId))
      .where(and(eq(schema.leads.campaignId, c.id), eq(schema.meetings.status, "booked")));
    await db
      .update(schema.campaigns)
      .set({ stats: { sent: Number(totals.sent), opened: Number(totals.opened), replied: Number(totals.replied), bounced: Number(totals.bounced), meetings: Number(meetings) } })
      .where(eq(schema.campaigns.id, c.id));

    // Deliverability guard: bounce rate above 5% over the last 7 days.
    const recent = rows.reduce((a, r) => ({ sent: a.sent + r.sent, bounced: a.bounced + r.bounced }), { sent: 0, bounced: 0 });
    if (recent.sent >= 50 && recent.bounced / recent.sent > 0.05) {
      await raiseAlert({ clientId: c.clientId, severity: "critical", type: "campaign", dedupeKey: `bounce:${c.id}`, message: `"${c.name}" bounced ${((recent.bounced / recent.sent) * 100).toFixed(1)}% of ${recent.sent} emails in the last 7 days. Pause and verify the list.` });
    } else await clearAlert(`bounce:${c.id}`);
    synced++;
  }
  return { synced };
}

/** Sum of daily stats for a client over a window. */
export async function clientTotals(clientId: string, from: Date, to: Date) {
  const [row] = await db
    .select({
      sent: sql<number>`coalesce(sum(${schema.campaignStatsDaily.sent}),0)`,
      opened: sql<number>`coalesce(sum(${schema.campaignStatsDaily.opened}),0)`,
      replied: sql<number>`coalesce(sum(${schema.campaignStatsDaily.replied}),0)`,
      bounced: sql<number>`coalesce(sum(${schema.campaignStatsDaily.bounced}),0)`,
    })
    .from(schema.campaignStatsDaily)
    .where(and(eq(schema.campaignStatsDaily.clientId, clientId), gte(schema.campaignStatsDaily.day, day(from)), sql`${schema.campaignStatsDaily.day} <= ${day(to)}`));
  return { sent: Number(row.sent), opened: Number(row.opened), replied: Number(row.replied), bounced: Number(row.bounced) };
}
