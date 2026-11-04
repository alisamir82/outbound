"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/queue";
import { requireClientScope } from "@/lib/session";
import type { ActionState } from "./auth";

export async function createCampaignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const parsed = z
    .object({ name: z.string().min(2).max(80), icpId: z.string().uuid(), brief: z.string().min(10).max(2000) })
    .safeParse({ name: formData.get("name"), icpId: formData.get("icpId"), brief: formData.get("brief") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const icp = await db.query.icps.findFirst({ where: and(eq(schema.icps.id, parsed.data.icpId), eq(schema.icps.clientId, clientId)) });
  if (!icp) return { error: "ICP not found" };

  const [campaign] = await db
    .insert(schema.campaigns)
    .values({ clientId, icpId: icp.id, name: parsed.data.name, brief: parsed.data.brief, status: "generating", createdBy: user.id })
    .returning();
  await enqueue("agent/campaign-copy", { campaignId: campaign.id }, { jobId: `copy-${campaign.id}-1` });
  await audit({ actorUserId: user.id, clientId, action: "campaign.created", entityType: "campaign", entityId: campaign.id });
  redirect(`/app/campaigns/${campaign.id}`);
}

async function ownedCampaign(clientId: string, id: string) {
  return db.query.campaigns.findFirst({ where: and(eq(schema.campaigns.id, id), eq(schema.campaigns.clientId, clientId)) });
}

export async function regenerateCopyAction(campaignId: string) {
  const { user, clientId } = await requireClientScope();
  const c = await ownedCampaign(clientId, campaignId);
  if (!c || !["review", "failed", "draft"].includes(c.status)) return;
  await db.update(schema.campaigns).set({ status: "generating", error: null }).where(eq(schema.campaigns.id, campaignId));
  await enqueue("agent/campaign-copy", { campaignId }, { jobId: `copy-${campaignId}-${Date.now()}` });
  await audit({ actorUserId: user.id, clientId, action: "campaign.copy_regenerated", entityType: "campaign", entityId: campaignId });
  revalidatePath(`/app/campaigns/${campaignId}`);
}

export async function updateSequenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const campaignId = String(formData.get("campaignId"));
  const c = await ownedCampaign(clientId, campaignId);
  if (!c || !["review", "approved"].includes(c.status)) return { error: "Copy can only be edited while in review" };
  const steps = [0, 1, 2].map((i) => ({
    subject: String(formData.get(`subject_${i}`) ?? "").trim(),
    body: String(formData.get(`body_${i}`) ?? "").trim(),
    delayDays: Number(formData.get(`delay_${i}`) ?? 0),
  }));
  if (steps.some((s) => !s.subject || !s.body)) return { error: "Every step needs a subject and a body" };
  if (!steps[0].body.includes("{{qualification}}")) return { error: "Step 1 must include the {{qualification}} tag" };
  await db.update(schema.campaigns).set({ sequence: steps, status: "review", copyApprovedBy: null }).where(eq(schema.campaigns.id, campaignId));
  await audit({ actorUserId: user.id, clientId, action: "campaign.copy_edited", entityType: "campaign", entityId: campaignId });
  revalidatePath(`/app/campaigns/${campaignId}`);
  return { success: "Copy saved. Approve it when you are happy." };
}

export async function approveCopyAction(campaignId: string) {
  const { user, clientId } = await requireClientScope();
  const c = await ownedCampaign(clientId, campaignId);
  if (!c || c.status !== "review") return;
  await db.update(schema.campaigns).set({ status: "approved", copyApprovedBy: user.id }).where(eq(schema.campaigns.id, campaignId));
  await audit({ actorUserId: user.id, clientId, action: "campaign.copy_approved", entityType: "campaign", entityId: campaignId });
  revalidatePath(`/app/campaigns/${campaignId}`);
}

/** Assigns all approved, unassigned leads for the campaign's ICP and queues the push to Instantly. */
export async function pushCampaignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const campaignId = String(formData.get("campaignId"));
  const c = await ownedCampaign(clientId, campaignId);
  if (!c || !["approved", "failed"].includes(c.status)) return { error: "Approve the copy first" };
  if (!c.icpId) return { error: "Campaign has no ICP" };
  if (c.status === "failed" && c.sequence.length === 0) return { error: "Generate and approve copy before pushing" };
  const assigned = await db
    .update(schema.leads)
    .set({ campaignId })
    .where(and(eq(schema.leads.clientId, clientId), eq(schema.leads.icpId, c.icpId), eq(schema.leads.status, "approved"), isNull(schema.leads.campaignId)))
    .returning({ id: schema.leads.id });
  const [already] = await db
    .select({ n: count() })
    .from(schema.leads)
    .where(and(eq(schema.leads.campaignId, campaignId), eq(schema.leads.status, "approved")));
  const total = assigned.length + Number(already?.n ?? 0);
  if (total === 0) return { error: "No approved leads for this ICP. Review a lead run first." };
  await db.update(schema.campaigns).set({ status: "pushing", error: null }).where(eq(schema.campaigns.id, campaignId));
  await enqueue("instantly/push-campaign", { campaignId }, { jobId: `push-${campaignId}-${Date.now()}` });
  await audit({ actorUserId: user.id, clientId, action: "campaign.push_queued", entityType: "campaign", entityId: campaignId, diff: { leads: total } });
  revalidatePath(`/app/campaigns/${campaignId}`);
  return { success: `Pushing ${total} leads to Instantly…` };
}

/** Toggle autonomous reply mode. Client admins only; guardrails still apply. */
export async function setAutonomousModeAction(campaignId: string, enabled: boolean) {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return;
  const c = await ownedCampaign(clientId, campaignId);
  if (!c) return;
  await db.update(schema.campaigns).set({ autonomousMode: enabled }).where(eq(schema.campaigns.id, campaignId));
  await audit({ actorUserId: user.id, clientId, action: enabled ? "campaign.autonomous_enabled" : "campaign.autonomous_disabled", entityType: "campaign", entityId: campaignId });
  revalidatePath(`/app/campaigns/${campaignId}`);
}
