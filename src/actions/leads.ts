"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { decideLeads } from "@/lib/pipeline/lead-run";
import { requireClientScope } from "@/lib/session";
import { db, schema } from "@/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import type { ActionState } from "./auth";

function selectedIds(formData: FormData) {
  return formData.getAll("leadId").map(String).filter(Boolean);
}

export async function decideLeadsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const decision = formData.get("decision") === "reject" ? "rejected" : "approved";
  const ids = selectedIds(formData);
  if (ids.length === 0) return { error: "Select at least one lead" };
  const n = await decideLeads(clientId, ids, decision);
  await audit({ actorUserId: user.id, clientId, action: `leads.${decision}`, entityType: "lead", diff: { count: n } });
  revalidatePath("/app/leads");
  return { success: `${n} lead${n === 1 ? "" : "s"} ${decision}` };
}

/** Approve every unreviewed lead in a run with score >= minScore. */
export async function approveRunByScoreAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const leadRunId = String(formData.get("leadRunId"));
  const minScore = Number(formData.get("minScore") ?? 3);
  const rows = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.clientId, clientId), eq(schema.leads.leadRunId, leadRunId), eq(schema.leads.status, "new"), gte(schema.leads.score, minScore)));
  const n = await decideLeads(clientId, rows.map((r) => r.id), "approved");
  await audit({ actorUserId: user.id, clientId, action: "leads.approved_by_score", entityType: "lead_run", entityId: leadRunId, diff: { minScore, count: n } });
  revalidatePath(`/app/leads/runs/${leadRunId}`);
  return { success: `${n} leads with score ≥ ${minScore} approved` };
}

export async function deleteRejectedAction(leadRunId: string) {
  const { user, clientId } = await requireClientScope();
  const rows = await db
    .delete(schema.leads)
    .where(and(eq(schema.leads.clientId, clientId), eq(schema.leads.leadRunId, leadRunId), inArray(schema.leads.status, ["rejected"])))
    .returning({ id: schema.leads.id });
  await audit({ actorUserId: user.id, clientId, action: "leads.rejected_deleted", entityType: "lead_run", entityId: leadRunId, diff: { count: rows.length } });
  revalidatePath(`/app/leads/runs/${leadRunId}`);
}
