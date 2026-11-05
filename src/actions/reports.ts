"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/queue";
import { requireClientScope, requireUser } from "@/lib/session";
import type { ActionState } from "./auth";

export async function decideProposalAction(proposalId: string, decision: "approved" | "rejected") {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return;
  const p = await db.query.optimizationProposals.findFirst({ where: and(eq(schema.optimizationProposals.id, proposalId), eq(schema.optimizationProposals.clientId, clientId)) });
  if (!p || p.status !== "proposed") return;
  await db.update(schema.optimizationProposals).set({ status: decision, decidedBy: user.id, decidedAt: new Date() }).where(eq(schema.optimizationProposals.id, proposalId));
  if (decision === "approved") await enqueue("reports/apply-proposal", { proposalId }, { jobId: `apply-${proposalId}` });
  await audit({ actorUserId: user.id, clientId, action: `proposal.${decision}`, entityType: "proposal", entityId: proposalId, diff: { type: p.type, title: p.title } });
  revalidatePath("/app/reports");
  if (p.reportId) revalidatePath(`/app/reports/${p.reportId}`);
  if (p.campaignId) revalidatePath(`/app/campaigns/${p.campaignId}`);
}

export async function generateReportNowAction(): Promise<ActionState> {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return { error: "Only client admins can generate reports" };
  await enqueue("reports/weekly-now", { clientId }, { jobId: `report-now-${clientId}-${Date.now()}` });
  await audit({ actorUserId: user.id, clientId, action: "report.requested", entityType: "client", entityId: clientId });
  revalidatePath("/app/reports");
  return { success: "Report is being generated. It will appear here in a few seconds and be emailed to client admins." };
}

export async function acknowledgeAlertAction(alertId: string) {
  const user = await requireUser();
  const a = await db.query.alerts.findFirst({ where: eq(schema.alerts.id, alertId) });
  if (!a) return;
  const allowed = user.role === "super_admin" || (a.clientId && a.clientId === user.clientId);
  if (!allowed) return;
  await db.update(schema.alerts).set({ acknowledgedAt: new Date(), acknowledgedBy: user.id }).where(eq(schema.alerts.id, alertId));
  revalidatePath("/app");
  revalidatePath("/admin");
  revalidatePath("/admin/health");
}
