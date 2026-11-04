"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { SKILLS, type SkillKey } from "@/lib/ai/skills";
import { audit } from "@/lib/audit";
import { requireClientScope } from "@/lib/session";
import type { ActionState } from "./auth";

export async function saveSkillOverrideAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return { error: "Only client admins can edit skills" };
  const key = String(formData.get("skillKey")) as SkillKey;
  if (!SKILLS[key]) return { error: "Unknown skill" };
  const content = String(formData.get("content") ?? "").trim();
  if (content.length < 50) return { error: "Skill content is too short" };
  await db
    .insert(schema.skillOverrides)
    .values({ clientId, skillKey: key, content, updatedBy: user.id })
    .onConflictDoUpdate({ target: [schema.skillOverrides.clientId, schema.skillOverrides.skillKey], set: { content, updatedBy: user.id } });
  await audit({ actorUserId: user.id, clientId, action: "skill.overridden", entityType: "skill", entityId: key });
  revalidatePath("/app/settings/skills");
  return { success: `${SKILLS[key].title} override saved` };
}

export async function resetSkillOverrideAction(key: SkillKey) {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return;
  await db.delete(schema.skillOverrides).where(and(eq(schema.skillOverrides.clientId, clientId), eq(schema.skillOverrides.skillKey, key)));
  await audit({ actorUserId: user.id, clientId, action: "skill.reset", entityType: "skill", entityId: key });
  revalidatePath("/app/settings/skills");
}
