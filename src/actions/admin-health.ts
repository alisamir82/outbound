"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { mapAccountToClient } from "@/lib/pipeline/health";
import { enqueue } from "@/lib/queue";
import { requireRole } from "@/lib/session";

export async function mapAccountAction(formData: FormData) {
  const admin = await requireRole("super_admin");
  const email = String(formData.get("email"));
  const clientId = String(formData.get("clientId") ?? "") || null;
  await mapAccountToClient(email, clientId);
  await audit({ actorUserId: admin.id, clientId, action: "email_account.mapped", entityType: "email_account", entityId: email });
  revalidatePath("/admin/health");
}

export async function runHealthCheckNowAction() {
  await requireRole("super_admin");
  await enqueue("reports/email-health", {}, { jobId: `health-now-${Date.now()}` });
  await enqueue("reports/analytics-sync", {}, { jobId: `analytics-now-${Date.now()}` });
  await enqueue("system/budget-check", {}, { jobId: `budget-now-${Date.now()}` });
  revalidatePath("/admin/health");
}
