import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Report, ReportContent } from "@/db/schema";
import { proposeOptimisations } from "@/lib/ai/optimise";
import { writeReportNarrative } from "@/lib/ai/report";
import { sendMail } from "@/lib/email";
import { getInstantly } from "@/lib/instantly/client";
import { clientTotals } from "./analytics";
import { healthSummary } from "./health";

/** ISO week key in the client's timezone, e.g. 2026-W45. */
export function weekKey(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); // YYYY-MM-DD
  const date = new Date(parts + "T00:00:00Z");
  const dayNum = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function localHourAndDay(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, weekday: "short", hour: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, hour: Number(p.hour) % 24 };
}

/**
 * Hourly tick: for every active client whose local time is Monday 07:00-08:59 and who has
 * no report for this ISO week yet, generate the weekly report (and proposals), then email it.
 */
export async function weeklyReportTick(force?: { clientId: string }) {
  const clients = await db.query.clients.findMany({ where: eq(schema.clients.status, "active") });
  const now = new Date();
  let generated = 0;
  for (const client of clients) {
    const key = weekKey(now, client.timezone);
    if (force && force.clientId !== client.id) continue;
    if (!force) {
      const { weekday, hour } = localHourAndDay(now, client.timezone);
      if (weekday !== "Mon" || hour < 7 || hour > 8) continue;
      if (client.lastWeeklyReportKey === key) continue;
    }
    await generateWeeklyReport(client.id, force ? `${key}-${Date.now()}` : key);
    generated++;
  }
  return { generated };
}

export async function generateWeeklyReport(clientId: string, key: string): Promise<Report> {
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
  if (!client) throw new Error("client not found");
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86_400_000);
  const prevStart = new Date(start.getTime() - 7 * 86_400_000);

  const [totals, previous, meetingsNow, meetingsPrev, leadsAdded, spend, campaignRows, classRows, health] = await Promise.all([
    clientTotals(clientId, start, end),
    clientTotals(clientId, prevStart, start),
    db.select({ n: sql<number>`count(*)` }).from(schema.meetings).where(and(eq(schema.meetings.clientId, clientId), gte(schema.meetings.createdAt, start))),
    db.select({ n: sql<number>`count(*)` }).from(schema.meetings).where(and(eq(schema.meetings.clientId, clientId), gte(schema.meetings.createdAt, prevStart), lt(schema.meetings.createdAt, start))),
    db.select({ n: sql<number>`count(*)` }).from(schema.leads).where(and(eq(schema.leads.clientId, clientId), gte(schema.leads.createdAt, start))),
    db.select({ usd: sql<number>`coalesce(sum(${schema.agentRuns.costUsdMicros}),0)/1e6` }).from(schema.agentRuns).where(and(eq(schema.agentRuns.clientId, clientId), gte(schema.agentRuns.startedAt, start))),
    db
      .select({
        id: schema.campaigns.id,
        name: schema.campaigns.name,
        status: schema.campaigns.status,
        sent: sql<number>`coalesce(sum(${schema.campaignStatsDaily.sent}),0)`,
        replied: sql<number>`coalesce(sum(${schema.campaignStatsDaily.replied}),0)`,
      })
      .from(schema.campaigns)
      .leftJoin(schema.campaignStatsDaily, and(eq(schema.campaignStatsDaily.campaignId, schema.campaigns.id), gte(schema.campaignStatsDaily.day, start.toISOString().slice(0, 10))))
      .where(and(eq(schema.campaigns.clientId, clientId), inArray(schema.campaigns.status, ["active", "pushed", "paused"])))
      .groupBy(schema.campaigns.id),
    db
      .select({ c: schema.messages.classification, n: sql<number>`count(*)` })
      .from(schema.messages)
      .where(and(eq(schema.messages.clientId, clientId), eq(schema.messages.direction, "inbound"), gte(schema.messages.sentAt, start)))
      .groupBy(schema.messages.classification),
    healthSummary(),
  ]);

  const campaignMeetings = await db
    .select({ campaignId: schema.leads.campaignId, n: sql<number>`count(*)` })
    .from(schema.meetings)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.meetings.leadId))
    .where(and(eq(schema.meetings.clientId, clientId), gte(schema.meetings.createdAt, start)))
    .groupBy(schema.leads.campaignId);
  const meetingsBy = new Map(campaignMeetings.map((m) => [m.campaignId, Number(m.n)]));

  const data: Omit<ReportContent, "highlights" | "narrative" | "nextSteps"> = {
    period: { start: start.toISOString(), end: end.toISOString() },
    totals: { ...totals, meetings: Number(meetingsNow[0].n), leadsAdded: Number(leadsAdded[0].n), aiSpendUsd: Number(spend[0].usd) },
    previous: { ...previous, meetings: Number(meetingsPrev[0].n) },
    campaigns: campaignRows.map((c) => ({ id: c.id, name: c.name, status: c.status, sent: Number(c.sent), replied: Number(c.replied), replyRate: Number(c.sent) ? (Number(c.replied) / Number(c.sent)) * 100 : 0, meetings: meetingsBy.get(c.id) ?? 0 })),
    classifications: Object.fromEntries(classRows.filter((r) => r.c).map((r) => [r.c as string, Number(r.n)])),
    health,
  };
  const narrative = await writeReportNarrative(clientId, client.name, data);
  const content: ReportContent = { ...data, ...narrative };

  const [report] = await db
    .insert(schema.reports)
    .values({ clientId, weekKey: key, periodStart: start, periodEnd: end, content })
    .onConflictDoUpdate({ target: [schema.reports.clientId, schema.reports.weekKey], set: { content, periodStart: start, periodEnd: end } })
    .returning();
  await db.update(schema.clients).set({ lastWeeklyReportKey: key }).where(eq(schema.clients.id, clientId));

  await generateProposals(clientId, report.id);
  await emailReport(client.id, client.name, report);
  return report;
}

async function generateProposals(clientId: string, reportId: string) {
  const campaigns = await db.query.campaigns.findMany({ where: and(eq(schema.campaigns.clientId, clientId), inArray(schema.campaigns.status, ["active", "pushed"])), with: { icp: true } });
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  for (const c of campaigns) {
    const open = await db.query.optimizationProposals.findFirst({ where: and(eq(schema.optimizationProposals.campaignId, c.id), eq(schema.optimizationProposals.status, "proposed")) });
    if (open) continue; // do not pile up proposals the client has not decided on
    const daily = await db.query.campaignStatsDaily.findMany({ where: and(eq(schema.campaignStatsDaily.campaignId, c.id), gte(schema.campaignStatsDaily.day, since)), orderBy: schema.campaignStatsDaily.day });
    const classRows = await db
      .select({ c: schema.messages.classification, n: sql<number>`count(*)` })
      .from(schema.messages)
      .innerJoin(schema.threads, eq(schema.threads.id, schema.messages.threadId))
      .where(and(eq(schema.threads.campaignId, c.id), eq(schema.messages.direction, "inbound")))
      .groupBy(schema.messages.classification);
    const proposals = await proposeOptimisations({ campaign: c, icp: c.icp?.spec ?? null, daily, classifications: Object.fromEntries(classRows.filter((r) => r.c).map((r) => [r.c as string, Number(r.n)])) });
    if (proposals.length) await db.insert(schema.optimizationProposals).values(proposals.map((p) => ({ clientId, campaignId: c.id, reportId, ...p })));
  }
}

async function emailReport(clientId: string, clientName: string, report: Report) {
  const admins = await db.query.users.findMany({ where: and(eq(schema.users.clientId, clientId), eq(schema.users.role, "client_admin"), eq(schema.users.isActive, true)) });
  if (!admins.length) return;
  const c = report.content;
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/app/reports/${report.id}`;
  const text = [`Weekly outbound report for ${clientName}`, "", ...c.highlights.map((h) => `• ${h}`), "", c.narrative, "", "Next steps:", ...c.nextSteps.map((s) => `- ${s}`), "", `Full report: ${url}`].join("\n");
  const html = `<h2>Weekly outbound report for ${clientName}</h2><ul>${c.highlights.map((h) => `<li>${h}</li>`).join("")}</ul><p>${c.narrative}</p><h3>Next steps</h3><ol>${c.nextSteps.map((s) => `<li>${s}</li>`).join("")}</ol><p><a href="${url}">Open the full report</a></p>`;
  for (const a of admins) await sendMail({ to: a.email, subject: `Weekly outbound report: ${c.totals.meetings} meetings, ${c.totals.replied} replies`, text, html });
  await db.update(schema.reports).set({ emailedAt: new Date() }).where(eq(schema.reports.id, report.id));
}

/** Applies an approved proposal to the campaign (and Instantly in live mode). */
export async function applyProposal(proposalId: string) {
  const p = await db.query.optimizationProposals.findFirst({ where: eq(schema.optimizationProposals.id, proposalId), with: { campaign: true } });
  if (!p || p.status !== "approved") return;
  try {
    const ch = p.change;
    if (ch.kind === "targeting") {
      const campaign = p.campaign;
      if (!campaign?.icpId) throw new Error("campaign has no ICP");
      const icp = await db.query.icps.findFirst({ where: eq(schema.icps.id, campaign.icpId) });
      if (!icp) throw new Error("ICP not found");
      const list = new Set(icp.spec[ch.field]);
      ch.remove.forEach((v) => list.delete(v));
      ch.add.forEach((v) => list.add(v));
      await db.update(schema.icps).set({ spec: { ...icp.spec, [ch.field]: [...list] }, version: icp.version + 1 }).where(eq(schema.icps.id, icp.id));
    } else {
      const campaign = p.campaign;
      if (!campaign) throw new Error("campaign not found");
      const seq = campaign.sequence.map((s) => ({ ...s }));
      if (!seq[ch.step]) throw new Error("step not found");
      if (ch.kind === "subject_line") seq[ch.step].subject = ch.to;
      if (ch.kind === "body") seq[ch.step].body = ch.to;
      if (ch.kind === "timing") seq[ch.step].delayDays = ch.toDays;
      await db.update(schema.campaigns).set({ sequence: seq }).where(eq(schema.campaigns.id, campaign.id));
      if (campaign.instantlyCampaignId) await (await getInstantly()).updateCampaignSequence(campaign.instantlyCampaignId, seq);
    }
    await db.update(schema.optimizationProposals).set({ status: "applied", appliedAt: new Date(), error: null }).where(eq(schema.optimizationProposals.id, proposalId));
  } catch (e) {
    await db.update(schema.optimizationProposals).set({ status: "failed", error: (e as Error).message }).where(eq(schema.optimizationProposals.id, proposalId));
    throw e;
  }
}

export async function latestReport(clientId: string) {
  return db.query.reports.findFirst({ where: eq(schema.reports.clientId, clientId), orderBy: desc(schema.reports.createdAt) });
}
