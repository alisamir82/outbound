import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ProposedSlot } from "@/db/schema";
import { draftReply } from "@/lib/ai/reply";
import { getCalendarForClient, isWithinBusinessHours, nextBusinessTime, proposeSlots } from "@/lib/calendar";
import { getInstantly } from "@/lib/instantly/client";
import { searchKb } from "@/lib/kb/search";
import { enqueue } from "@/lib/queue";
import { evaluateGuardrails } from "./guardrails";

/**
 * Reply agent job: build context → draft → guardrails → either auto-send (now or at next
 * business opening) or park the draft for one-click approval.
 */
export async function processReplyAgent(threadId: string, inboundMessageId: string) {
  const thread = await db.query.threads.findFirst({ where: eq(schema.threads.id, threadId), with: { lead: true, campaign: true } });
  if (!thread) throw new Error("thread not found");
  if (thread.status === "unsubscribed" || thread.status === "closed") return;
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, thread.clientId) });
  if (!client) throw new Error("client not found");
  const inbound = await db.query.messages.findFirst({ where: eq(schema.messages.id, inboundMessageId) });
  if (!inbound) throw new Error("inbound message not found");
  const history = await db.query.messages.findMany({ where: eq(schema.messages.threadId, threadId), orderBy: schema.messages.sentAt });

  // Supersede any still-pending draft for this thread: the lead wrote again.
  await db
    .update(schema.replyDrafts)
    .set({ status: "superseded" })
    .where(and(eq(schema.replyDrafts.threadId, threadId), eq(schema.replyDrafts.status, "pending")));

  // Retrieval query: the lead's words plus the campaign brief, so proof points surface even for short replies.
  const kbQuery = [inbound.bodyText, thread.campaign?.brief ?? ""].join(" ");
  const [kbHits, calendar] = await Promise.all([searchKb(client.id, kbQuery, 4), getCalendarForClient(client.id)]);
  const slots: ProposedSlot[] = calendar ? await proposeSlots(client, calendar) : [];

  const output = await draftReply({
    client,
    lead: thread.lead,
    thread: { id: thread.id, subject: thread.subject },
    history: history.filter((m) => m.id !== inbound.id),
    inbound,
    kbHits,
    slots,
    campaignBrief: thread.campaign?.brief ?? null,
  });

  const confidence = Math.round(output.confidence * 100);
  await db.update(schema.messages).set({ classification: output.classification, confidence }).where(eq(schema.messages.id, inbound.id));

  // Terminal classifications: no reply, handle the lead state.
  if (output.classification === "unsubscribe") {
    await handleUnsubscribe(thread.id, thread.lead.id, thread.lead.email, thread.campaign?.instantlyCampaignId ?? null);
    await db.update(schema.threads).set({ lastClassification: "unsubscribe" }).where(eq(schema.threads.id, threadId));
    return;
  }
  if (output.classification === "out_of_office") {
    await db.update(schema.threads).set({ lastClassification: "out_of_office", lastEventAt: new Date() }).where(eq(schema.threads.id, threadId));
    return;
  }

  const guard = evaluateGuardrails({ client, campaign: thread.campaign ?? null, thread, inboundText: inbound.bodyText, output });
  const [draft] = await db
    .insert(schema.replyDrafts)
    .values({
      threadId,
      clientId: client.id,
      inboundMessageId: inbound.id,
      classification: output.classification,
      confidence,
      draftText: output.draft,
      reasoning: output.reasoning,
      wantsMeeting: output.wantsMeeting,
      proposedSlots: slots,
      kbChunkIds: output.usedExcerptIds.filter((id) => kbHits.some((h) => h.id === id)),
      status: guard.autoSend ? "approved" : output.classification === "hostile" || guard.reasons.some((r) => !r.startsWith("Campaign is in approval mode")) && thread.campaign?.autonomousMode ? "escalated" : "pending",
      escalationReasons: guard.reasons,
    })
    .returning();

  await db
    .update(schema.threads)
    .set({ lastClassification: output.classification, status: draft.status === "escalated" ? "escalated" : "awaiting_approval", lastEventAt: new Date() })
    .where(eq(schema.threads.id, threadId));

  if (guard.autoSend) {
    const rs = client.replySettings;
    if (rs.businessHoursOnly && !isWithinBusinessHours(client)) {
      const at = nextBusinessTime(client);
      await enqueue("agent/send-draft", { draftId: draft.id, chosenSlotIndex: output.chosenSlotIndex, auto: true }, { jobId: `send-${draft.id}`, delayMs: at.getTime() - Date.now() });
    } else {
      await sendDraft({ draftId: draft.id, chosenSlotIndex: output.chosenSlotIndex, auto: true });
    }
  }
}

/** Sends a draft (approved by a human or auto-approved), books the meeting if one was chosen. */
export async function sendDraft(input: { draftId: string; chosenSlotIndex: number | null; auto: boolean; userId?: string; textOverride?: string }) {
  const draft = await db.query.replyDrafts.findFirst({ where: eq(schema.replyDrafts.id, input.draftId), with: { thread: { with: { lead: true, campaign: true } } } });
  if (!draft) throw new Error("draft not found");
  if (!["pending", "approved", "escalated"].includes(draft.status)) return; // already handled
  const thread = draft.thread;
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, draft.clientId) });
  if (!client) throw new Error("client not found");
  const normalise = (t: string) => t.replace(/\r\n?/g, "\n").trim();
  const text = normalise(input.textOverride ?? draft.draftText);
  if (!text) throw new Error("cannot send an empty reply");

  const inbound = draft.inboundMessageId ? await db.query.messages.findFirst({ where: eq(schema.messages.id, draft.inboundMessageId) }) : null;
  const instantly = await getInstantly();
  const sent = await instantly.sendReply({
    emailAccount: thread.emailAccount ?? "",
    replyToMessageId: inbound?.instantlyMessageId ?? "",
    subject: thread.subject ? (thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`) : "Re:",
    text,
  });

  const status = input.auto ? "auto_sent" : input.textOverride && normalise(input.textOverride) !== normalise(draft.draftText) ? "edited" : "approved";
  await db.transaction(async (tx) => {
    await tx.insert(schema.messages).values({
      threadId: thread.id,
      clientId: draft.clientId,
      direction: "outbound",
      sender: input.auto ? "agent" : "human",
      subject: thread.subject,
      bodyText: text,
      draftId: draft.id,
      sentByUserId: input.userId ?? null,
      instantlyMessageId: sent.id,
      kbChunkIds: draft.kbChunkIds,
      classification: draft.classification,
      confidence: draft.confidence,
    });
    await tx.update(schema.replyDrafts).set({ status, decidedBy: input.userId ?? null, decidedAt: new Date() }).where(eq(schema.replyDrafts.id, draft.id));
    await tx
      .update(schema.threads)
      .set({ status: "replied", lastEventAt: new Date(), agentReplyCount: input.auto ? sql`${schema.threads.agentReplyCount} + 1` : schema.threads.agentReplyCount })
      .where(eq(schema.threads.id, thread.id));
  });

  if (input.chosenSlotIndex != null && draft.proposedSlots[input.chosenSlotIndex]) {
    await bookMeeting({ clientId: client.id, threadId: thread.id, leadId: thread.lead.id, slot: draft.proposedSlots[input.chosenSlotIndex], bookedBy: input.auto ? "agent" : "human" });
  }
}

export async function bookMeeting(input: { clientId: string; threadId: string | null; leadId: string; slot: ProposedSlot; bookedBy: "agent" | "human" }) {
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, input.clientId) });
  const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, input.leadId) });
  if (!client || !lead) throw new Error("client or lead not found");
  const calendar = await getCalendarForClient(client.id);
  if (!calendar) throw new Error("No calendar connected");
  const title = `${client.name} × ${lead.company ?? lead.email}`;
  const ev = await calendar.createEvent({
    title,
    description: `Booked by AI Outbound for ${client.replySettings.senderName || client.name}.`,
    start: new Date(input.slot.startAt),
    end: new Date(input.slot.endAt),
    attendeeEmail: lead.email,
    attendeeName: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || undefined,
  });
  const [meeting] = await db
    .insert(schema.meetings)
    .values({ clientId: client.id, leadId: lead.id, threadId: input.threadId, provider: calendar.key, externalEventId: ev.id, title, startAt: new Date(input.slot.startAt), endAt: new Date(input.slot.endAt), bookedBy: input.bookedBy })
    .returning();
  await db.update(schema.leads).set({ status: "meeting" }).where(eq(schema.leads.id, lead.id));
  if (lead.campaignId) {
    await db.update(schema.campaigns).set({ stats: sql`jsonb_set(${schema.campaigns.stats}, '{meetings}', (coalesce((${schema.campaigns.stats}->>'meetings')::int,0) + 1)::text::jsonb)` }).where(eq(schema.campaigns.id, lead.campaignId));
  }
  return meeting;
}

export async function handleUnsubscribe(threadId: string, leadId: string, email: string, instantlyCampaignId: string | null) {
  const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
  if (!lead) return;
  await db.update(schema.leads).set({ status: "unsubscribed" }).where(eq(schema.leads.id, leadId));
  await db.insert(schema.suppressions).values({ clientId: lead.clientId, value: email.toLowerCase(), reason: "unsubscribe" }).onConflictDoNothing();
  await db.update(schema.threads).set({ status: "unsubscribed", lastEventAt: new Date() }).where(eq(schema.threads.id, threadId));
  const instantly = await getInstantly();
  await instantly.stopLead({ email, campaignId: instantlyCampaignId });
}

export async function latestDraft(threadId: string) {
  return db.query.replyDrafts.findFirst({ where: eq(schema.replyDrafts.threadId, threadId), orderBy: desc(schema.replyDrafts.createdAt) });
}
