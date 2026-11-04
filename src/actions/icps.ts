"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { generateIcp, toSpec } from "@/lib/ai/icp";
import { BudgetExceededError } from "@/lib/ai/run";
import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/queue";
import { requireClientScope } from "@/lib/session";
import type { ActionState } from "./auth";

export async function createIcpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (prompt.length < 20) return { error: "Describe what you sell and to whom in at least a sentence or two." };

  let generated;
  try {
    generated = await generateIcp({ clientId, prompt, userId: user.id });
  } catch (e) {
    if (e instanceof BudgetExceededError) return { error: "This workspace has used its monthly AI budget. Ask your platform admin to raise it." };
    return { error: `ICP generation failed: ${(e as Error).message}` };
  }

  const [icp] = await db
    .insert(schema.icps)
    .values({ clientId, name: generated.name, prompt, spec: toSpec(generated), createdBy: user.id })
    .returning();
  await db.update(schema.clients).set({ onboarding: { ...(await currentOnboarding(clientId)), icp: true } }).where(eq(schema.clients.id, clientId));
  await audit({ actorUserId: user.id, clientId, action: "icp.created", entityType: "icp", entityId: icp.id });
  revalidatePath("/app/icps");
  redirect(`/app/icps/${icp.id}`);
}

async function currentOnboarding(clientId: string) {
  const c = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId), columns: { onboarding: true } });
  return c?.onboarding ?? { profile: false, knowledgeBase: false, calendar: false, icp: false };
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function updateIcpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const id = String(formData.get("id"));
  const parsed = z.object({ name: z.string().min(2).max(80), valueProposition: z.string().min(5) }).safeParse({
    name: formData.get("name"),
    valueProposition: formData.get("valueProposition"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const existing = await db.query.icps.findFirst({ where: and(eq(schema.icps.id, id), eq(schema.icps.clientId, clientId)) });
  if (!existing) return { error: "ICP not found" };

  const spec = {
    industries: list(formData.get("industries")),
    companySizes: list(formData.get("companySizes")),
    geographies: list(formData.get("geographies")).map((g) => g.toUpperCase()),
    titles: list(formData.get("titles")),
    painPoints: list(formData.get("painPoints")),
    disqualifiers: list(formData.get("disqualifiers")),
    valueProposition: parsed.data.valueProposition,
  };
  await db
    .update(schema.icps)
    .set({ name: parsed.data.name, spec, version: existing.version + 1 })
    .where(eq(schema.icps.id, id));
  await audit({ actorUserId: user.id, clientId, action: "icp.updated", entityType: "icp", entityId: id, diff: { version: existing.version + 1 } });
  revalidatePath(`/app/icps/${id}`);
  return { success: `Saved as version ${existing.version + 1}` };
}

export async function startLeadRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId } = await requireClientScope();
  const icpId = String(formData.get("icpId"));
  const count = Math.max(10, Math.min(500, Number(formData.get("count") ?? 50)));
  const icp = await db.query.icps.findFirst({ where: and(eq(schema.icps.id, icpId), eq(schema.icps.clientId, clientId)) });
  if (!icp) return { error: "ICP not found" };

  const [run] = await db
    .insert(schema.leadRuns)
    .values({ clientId, icpId, source: "auto", requestedCount: count, createdBy: user.id })
    .returning();
  await enqueue("lead-runs/run", { leadRunId: run.id }, { jobId: `lead-run-${run.id}` });
  await audit({ actorUserId: user.id, clientId, action: "lead_run.started", entityType: "lead_run", entityId: run.id, diff: { icpId, count } });
  redirect(`/app/leads/runs/${run.id}`);
}
