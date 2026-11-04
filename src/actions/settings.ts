"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { INTEGRATIONS, saveIntegration, type IntegrationKey } from "@/lib/settings";
import { requireRole } from "@/lib/session";
import type { ActionState } from "./auth";

export async function saveIntegrationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole("super_admin");
  const key = String(formData.get("key")) as IntegrationKey;
  const def = INTEGRATIONS[key];
  if (!def) return { error: "Unknown integration" };

  const value: Record<string, unknown> = {};
  const secrets: Record<string, string | undefined> = {};
  for (const f of def.fields) {
    const raw = formData.get(f.name);
    if (f.type === "secret") {
      const s = raw === null ? undefined : String(raw);
      // blank keeps the existing secret; the literal "__clear__" removes it
      secrets[f.name] = s === "" ? undefined : s === "__clear__" ? "" : s;
    } else if (f.type === "boolean") value[f.name] = raw === "on";
    else if (f.type === "number") value[f.name] = raw === null || raw === "" ? null : Number(raw);
    else value[f.name] = raw === null ? "" : String(raw);
  }
  await saveIntegration(key, value, secrets, admin.id);
  await audit({ actorUserId: admin.id, action: "settings.integration_updated", entityType: "platform_settings", entityId: key, diff: value });
  revalidatePath("/admin/settings/integrations");
  return { success: `${def.title} saved` };
}
