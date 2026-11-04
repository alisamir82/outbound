"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { encryptJson } from "@/lib/crypto";
import { requireClientScope } from "@/lib/session";
import type { ActionState } from "./auth";

export async function saveReplySettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return { error: "Only client admins can change these settings" };
  const parsed = z
    .object({
      senderName: z.string().max(80),
      signature: z.string().max(500),
      bookingLink: z.string().url().or(z.literal("")),
      meetingDurationMin: z.coerce.number().int().min(15).max(120),
      minConfidence: z.coerce.number().min(50).max(100),
      maxAgentRepliesPerThread: z.coerce.number().int().min(1).max(10),
      businessHoursOnly: z.boolean(),
      timezone: z.string().min(1),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      days: z.array(z.coerce.number().int().min(0).max(6)).min(1),
    })
    .safeParse({
      senderName: formData.get("senderName") ?? "",
      signature: formData.get("signature") ?? "",
      bookingLink: formData.get("bookingLink") ?? "",
      meetingDurationMin: formData.get("meetingDurationMin"),
      minConfidence: formData.get("minConfidence"),
      maxAgentRepliesPerThread: formData.get("maxAgentRepliesPerThread"),
      businessHoursOnly: formData.get("businessHoursOnly") === "on",
      timezone: formData.get("timezone"),
      start: formData.get("start"),
      end: formData.get("end"),
      days: formData.getAll("days"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  await db
    .update(schema.clients)
    .set({
      timezone: d.timezone,
      businessHours: { start: d.start, end: d.end, days: d.days },
      replySettings: {
        senderName: d.senderName,
        signature: d.signature,
        bookingLink: d.bookingLink,
        meetingDurationMin: d.meetingDurationMin,
        minConfidence: d.minConfidence / 100,
        maxAgentRepliesPerThread: d.maxAgentRepliesPerThread,
        businessHoursOnly: d.businessHoursOnly,
      },
    })
    .where(eq(schema.clients.id, clientId));
  await audit({ actorUserId: user.id, clientId, action: "client.reply_settings_updated", entityType: "client", entityId: clientId });
  revalidatePath("/app/settings/replies");
  return { success: "Settings saved" };
}

/** Demo: connect an always-free mock calendar so booking can be exercised without OAuth. */
export async function connectMockCalendarAction() {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return;
  await db
    .insert(schema.calendarConnections)
    .values({ clientId, provider: "mock", accountEmail: "demo-calendar@example.com", tokenCiphertext: encryptJson({}), connectedBy: user.id })
    .onConflictDoUpdate({ target: schema.calendarConnections.clientId, set: { provider: "mock", accountEmail: "demo-calendar@example.com", tokenCiphertext: encryptJson({}) } });
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId), columns: { onboarding: true } });
  if (client) await db.update(schema.clients).set({ onboarding: { ...client.onboarding, calendar: true } }).where(eq(schema.clients.id, clientId));
  await audit({ actorUserId: user.id, clientId, action: "calendar.connected", entityType: "calendar", diff: { provider: "mock" } });
  revalidatePath("/app/settings/replies");
}

export async function disconnectCalendarAction() {
  const { user, clientId, canManage } = await requireClientScope();
  if (!canManage) return;
  await db.delete(schema.calendarConnections).where(eq(schema.calendarConnections.clientId, clientId));
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId), columns: { onboarding: true } });
  if (client) await db.update(schema.clients).set({ onboarding: { ...client.onboarding, calendar: false } }).where(eq(schema.clients.id, clientId));
  await audit({ actorUserId: user.id, clientId, action: "calendar.disconnected", entityType: "calendar" });
  revalidatePath("/app/settings/replies");
}
