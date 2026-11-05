import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ReplyClassification } from "@/db/schema";
import { enqueue } from "@/lib/queue";

/** Tolerant view over Instantly webhook payloads (field names vary by event and version). */
export type InboundReply = {
  leadEmail: string;
  emailAccount: string | null;
  instantlyCampaignId: string | null;
  messageId: string | null;
  subject: string | null;
  text: string;
  html: string | null;
  isAutoReply: boolean;
  receivedAt: Date;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseInstantlyPayload(eventType: string, p: Record<string, unknown>): InboundReply | null {
  const leadEmail = str(p.lead_email) ?? str(p.lead) ?? str(p.email) ?? str((p.lead_data as Record<string, unknown> | undefined)?.email);
  if (!leadEmail) return null;
  const text = str(p.reply_text) ?? str(p.text) ?? str(p.reply_text_snippet) ?? str(p.body) ?? "";
  const html = str(p.reply_html) ?? str(p.html);
  return {
    leadEmail: leadEmail.toLowerCase(),
    emailAccount: str(p.email_account) ?? str(p.eaccount) ?? str(p.from_email),
    instantlyCampaignId: str(p.campaign_id) ?? str(p.campaign),
    messageId: str(p.uuid) ?? str(p.email_id) ?? str(p.message_id) ?? str(p.id),
    subject: str(p.reply_subject) ?? str(p.subject),
    text: text || (html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""),
    html,
    isAutoReply: eventType === "auto_reply_received",
    receivedAt: p.timestamp ? new Date(String(p.timestamp)) : new Date(),
  };
}

export async function processWebhookEvent(eventId: string) {
  const ev = await db.query.webhookEvents.findFirst({ where: eq(schema.webhookEvents.id, eventId) });
  if (!ev || ev.processedAt) return;
  try {
    const type = ev.eventType;
    if (type === "reply_received" || type === "auto_reply_received") {
      const parsed = parseInstantlyPayload(type, ev.payload);
      if (!parsed) throw new Error("payload has no lead email");
      await ingestInboundReply(parsed);
    } else if (type === "lead_unsubscribed") {
      await markLead(ev.payload, "unsubscribed", "unsubscribe");
    } else if (type === "email_bounced") {
      await markLead(ev.payload, "bounced", "bounce");
    } else if (type === "email_sent" || type === "email_opened") {
      await bumpStat(ev.payload, type === "email_sent" ? "sent" : "opened");
    }
    await db.update(schema.webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(schema.webhookEvents.id, eventId));
  } catch (e) {
    await db.update(schema.webhookEvents).set({ error: (e as Error).message }).where(eq(schema.webhookEvents.id, eventId));
    throw e;
  }
}

async function findLead(email: string, instantlyCampaignId: string | null) {
  const campaign = instantlyCampaignId
    ? await db.query.campaigns.findFirst({ where: eq(schema.campaigns.instantlyCampaignId, instantlyCampaignId) })
    : null;
  const lead = await db.query.leads.findFirst({
    where: campaign
      ? and(eq(schema.leads.clientId, campaign.clientId), sql`lower(${schema.leads.email}) = ${email.toLowerCase()}`)
      : sql`lower(${schema.leads.email}) = ${email.toLowerCase()}`,
  });
  return { lead, campaign: campaign ?? (lead?.campaignId ? await db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, lead.campaignId) }) : null) };
}

/**
 * Creates/updates the thread and stores the inbound message, then queues the reply agent.
 * Also used by the "simulate reply" dev tool, so it must not depend on webhook rows.
 */
export async function ingestInboundReply(r: InboundReply): Promise<{ threadId: string; messageId: string } | null> {
  const { lead, campaign } = await findLead(r.leadEmail, r.instantlyCampaignId);
  if (!lead) {
    console.warn(`[inbox] reply from unknown lead ${r.leadEmail}`);
    return null;
  }
  const result = await db.transaction(async (tx) => {
    let thread = await tx.query.threads.findFirst({ where: eq(schema.threads.leadId, lead.id) });
    if (!thread) {
      [thread] = await tx
        .insert(schema.threads)
        .values({ clientId: lead.clientId, leadId: lead.id, campaignId: campaign?.id ?? lead.campaignId, subject: r.subject, emailAccount: r.emailAccount })
        .returning();
    }
    const [message] = await tx
      .insert(schema.messages)
      .values({
        threadId: thread.id,
        clientId: lead.clientId,
        direction: "inbound",
        sender: "lead",
        subject: r.subject,
        bodyText: r.text,
        bodyHtml: r.html,
        instantlyMessageId: r.messageId,
        sentAt: r.receivedAt,
      })
      .onConflictDoNothing()
      .returning();
    if (!message) return null; // duplicate webhook
    await tx
      .update(schema.threads)
      .set({ status: "open", lastInboundAt: r.receivedAt, lastEventAt: new Date(), emailAccount: r.emailAccount ?? thread.emailAccount, subject: thread.subject ?? r.subject })
      .where(eq(schema.threads.id, thread.id));
    if (lead.status === "pushed" || lead.status === "approved") await tx.update(schema.leads).set({ status: "replied" }).where(eq(schema.leads.id, lead.id));
    if (campaign) await tx.update(schema.campaigns).set({ stats: sql`jsonb_set(${schema.campaigns.stats}, '{replied}', (coalesce((${schema.campaigns.stats}->>'replied')::int,0) + 1)::text::jsonb)` }).where(eq(schema.campaigns.id, campaign.id));
    return { threadId: thread.id, messageId: message.id };
  });
  if (result && !r.isAutoReply) {
    await enqueue("agent/reply", { threadId: result.threadId, inboundMessageId: result.messageId }, { jobId: `reply-${result.messageId}` });
  } else if (result && r.isAutoReply) {
    await db.update(schema.threads).set({ lastClassification: "out_of_office" satisfies ReplyClassification }).where(eq(schema.threads.id, result.threadId));
  }
  return result;
}

async function markLead(p: Record<string, unknown>, status: "unsubscribed" | "bounced", reason: string) {
  const email = (str(p.lead_email) ?? str(p.email) ?? "").toLowerCase();
  if (!email) return;
  const { lead, campaign } = await findLead(email, str(p.campaign_id));
  if (!lead) return;
  await db.update(schema.leads).set({ status }).where(eq(schema.leads.id, lead.id));
  await db.insert(schema.suppressions).values({ clientId: lead.clientId, value: email, reason }).onConflictDoNothing();
  await db.update(schema.threads).set({ status: status === "unsubscribed" ? "unsubscribed" : "closed" }).where(eq(schema.threads.leadId, lead.id));
  if (campaign && status === "bounced") await bumpStat(p, "bounced");
}

async function bumpStat(p: Record<string, unknown>, key: "sent" | "opened" | "bounced") {
  const id = str(p.campaign_id);
  if (!id) return;
  await db
    .update(schema.campaigns)
    .set({ stats: sql`jsonb_set(${schema.campaigns.stats}, ${`{${key}}`}::text[], (coalesce((${schema.campaigns.stats}->>${key})::int,0) + 1)::text::jsonb)` })
    .where(eq(schema.campaigns.instantlyCampaignId, id));
}
