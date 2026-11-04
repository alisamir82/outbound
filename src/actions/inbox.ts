"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ingestInboundReply } from "@/lib/pipeline/inbox";
import { bookMeeting, handleUnsubscribe, sendDraft } from "@/lib/replies/service";
import { requireClientScope } from "@/lib/session";
import type { ActionState } from "./auth";

async function ownedDraft(clientId: string, draftId: string) {
  return db.query.replyDrafts.findFirst({ where: and(eq(schema.replyDrafts.id, draftId), eq(schema.replyDrafts.clientId, clientId)), with: { thread: true } });
}

/** One-click approve (optionally with edited text and a chosen slot). */
export async function approveDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const draftId = String(formData.get("draftId"));
  const text = String(formData.get("text") ?? "");
  const slotRaw = formData.get("slot");
  const chosenSlotIndex = slotRaw === null || slotRaw === "" ? null : Number(slotRaw);
  const draft = await ownedDraft(clientId, draftId);
  if (!draft || !["pending", "escalated", "approved"].includes(draft.status)) return { error: "This draft has already been handled" };
  if (!text.trim()) return { error: "Reply text is empty" };
  try {
    await sendDraft({ draftId, chosenSlotIndex, auto: false, userId: user.id, textOverride: text });
  } catch (e) {
    return { error: `Send failed: ${(e as Error).message}` };
  }
  await audit({ actorUserId: user.id, clientId, action: "reply.sent", entityType: "thread", entityId: draft.threadId, diff: { draftId, chosenSlotIndex } });
  revalidatePath("/app/inbox");
  revalidatePath(`/app/inbox/${draft.threadId}`);
  return { success: chosenSlotIndex != null ? "Reply sent and meeting booked" : "Reply sent" };
}

export async function rejectDraftAction(draftId: string) {
  const { user, clientId } = await requireClientScope();
  const draft = await ownedDraft(clientId, draftId);
  if (!draft || !["pending", "escalated"].includes(draft.status)) return;
  await db.update(schema.replyDrafts).set({ status: "rejected", decidedBy: user.id, decidedAt: new Date() }).where(eq(schema.replyDrafts.id, draftId));
  await db.update(schema.threads).set({ status: "open" }).where(eq(schema.threads.id, draft.threadId));
  await audit({ actorUserId: user.id, clientId, action: "reply.rejected", entityType: "thread", entityId: draft.threadId });
  revalidatePath(`/app/inbox/${draft.threadId}`);
  revalidatePath("/app/inbox");
}

export async function closeThreadAction(threadId: string) {
  const { user, clientId } = await requireClientScope();
  const t = await db.query.threads.findFirst({ where: and(eq(schema.threads.id, threadId), eq(schema.threads.clientId, clientId)) });
  if (!t) return;
  await db.update(schema.threads).set({ status: "closed", lastEventAt: new Date() }).where(eq(schema.threads.id, threadId));
  await db.update(schema.replyDrafts).set({ status: "rejected" }).where(and(eq(schema.replyDrafts.threadId, threadId), eq(schema.replyDrafts.status, "pending")));
  await audit({ actorUserId: user.id, clientId, action: "thread.closed", entityType: "thread", entityId: threadId });
  revalidatePath("/app/inbox");
  revalidatePath(`/app/inbox/${threadId}`);
}

export async function unsubscribeThreadAction(threadId: string) {
  const { user, clientId } = await requireClientScope();
  const t = await db.query.threads.findFirst({ where: and(eq(schema.threads.id, threadId), eq(schema.threads.clientId, clientId)), with: { lead: true, campaign: true } });
  if (!t) return;
  await handleUnsubscribe(threadId, t.lead.id, t.lead.email, t.campaign?.instantlyCampaignId ?? null);
  await db.update(schema.replyDrafts).set({ status: "rejected" }).where(and(eq(schema.replyDrafts.threadId, threadId), eq(schema.replyDrafts.status, "pending")));
  await audit({ actorUserId: user.id, clientId, action: "lead.unsubscribed_manually", entityType: "lead", entityId: t.lead.id });
  revalidatePath("/app/inbox");
  revalidatePath(`/app/inbox/${threadId}`);
}

export async function bookSlotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const draftId = String(formData.get("draftId"));
  const idx = Number(formData.get("slot"));
  const draft = await ownedDraft(clientId, draftId);
  const slot = draft?.proposedSlots[idx];
  if (!draft || !slot) return { error: "Slot not found" };
  try {
    await bookMeeting({ clientId, threadId: draft.threadId, leadId: draft.thread.leadId, slot, bookedBy: "human" });
  } catch (e) {
    return { error: (e as Error).message };
  }
  await audit({ actorUserId: user.id, clientId, action: "meeting.booked", entityType: "thread", entityId: draft.threadId, diff: { slot } });
  revalidatePath(`/app/inbox/${draft.threadId}`);
  return { success: `Meeting booked for ${slot.label}` };
}

/** Dev/demo tool: inject an inbound reply as if Instantly had sent the webhook. */
export async function simulateReplyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const parsed = z.object({ leadId: z.string().uuid(), text: z.string().min(2).max(5000) }).safeParse({ leadId: formData.get("leadId"), text: formData.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const lead = await db.query.leads.findFirst({ where: and(eq(schema.leads.id, parsed.data.leadId), eq(schema.leads.clientId, clientId)) });
  if (!lead) return { error: "Lead not found" };
  const campaign = lead.campaignId ? await db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, lead.campaignId) }) : null;
  const result = await ingestInboundReply({
    leadEmail: lead.email,
    emailAccount: "demo@agency.example.com",
    instantlyCampaignId: campaign?.instantlyCampaignId ?? null,
    messageId: `sim-${Date.now()}`,
    subject: campaign?.sequence[0]?.subject ?? "Re: your email",
    text: parsed.data.text,
    html: null,
    isAutoReply: false,
    receivedAt: new Date(),
  });
  await audit({ actorUserId: user.id, clientId, action: "reply.simulated", entityType: "lead", entityId: lead.id });
  revalidatePath("/app/inbox");
  return result ? { success: "Reply injected. The agent is drafting a response." } : { error: "Could not create the thread" };
}
