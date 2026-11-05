"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/crypto";
import { inviteEmail } from "@/lib/email";
import { requireRole, requireUser } from "@/lib/session";
import type { ActionState } from "./auth";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const clientSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "Slug may contain lower-case letters, digits and dashes"),
  website: z.string().url().optional().or(z.literal("")),
  timezone: z.string().min(1).default("UTC"),
  tokenBudgetMonthlyUsd: z.coerce.number().int().min(0).max(100_000),
  instantlyCampaignPrefix: z.string().max(40).optional().or(z.literal("")),
  instantlyWorkspaceId: z.string().max(120).optional().or(z.literal("")),
  blockedRegions: z.string().max(200).optional().or(z.literal("")),
  dataRetentionDays: z.coerce.number().int().min(0).max(3650).default(365),
});

const regions = (v: string | undefined) =>
  (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));

export async function createClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole("super_admin");
  const name = String(formData.get("name") ?? "");
  const parsed = clientSchema.safeParse({
    name,
    slug: String(formData.get("slug") ?? "") || slugify(name),
    website: formData.get("website") ?? "",
    timezone: formData.get("timezone") ?? "UTC",
    tokenBudgetMonthlyUsd: formData.get("tokenBudgetMonthlyUsd") ?? 100,
    instantlyCampaignPrefix: formData.get("instantlyCampaignPrefix") ?? "",
    instantlyWorkspaceId: formData.get("instantlyWorkspaceId") ?? "",
    blockedRegions: formData.get("blockedRegions") ?? "",
    dataRetentionDays: formData.get("dataRetentionDays") ?? 365,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const exists = await db.query.clients.findFirst({ where: eq(schema.clients.slug, parsed.data.slug) });
  if (exists) return { error: "A client with that slug already exists" };

  const [client] = await db
    .insert(schema.clients)
    .values({
      ...parsed.data,
      blockedRegions: regions(parsed.data.blockedRegions),
      website: parsed.data.website || null,
      instantlyCampaignPrefix: parsed.data.instantlyCampaignPrefix || `[${parsed.data.slug}]`,
      instantlyWorkspaceId: parsed.data.instantlyWorkspaceId || null,
    })
    .returning();
  await audit({ actorUserId: admin.id, clientId: client.id, action: "client.created", entityType: "client", entityId: client.id, diff: parsed.data });
  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${client.id}`);
}

export async function updateClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole("super_admin");
  const id = String(formData.get("id"));
  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    website: formData.get("website") ?? "",
    timezone: formData.get("timezone") ?? "UTC",
    tokenBudgetMonthlyUsd: formData.get("tokenBudgetMonthlyUsd") ?? 100,
    instantlyCampaignPrefix: formData.get("instantlyCampaignPrefix") ?? "",
    instantlyWorkspaceId: formData.get("instantlyWorkspaceId") ?? "",
    blockedRegions: formData.get("blockedRegions") ?? "",
    dataRetentionDays: formData.get("dataRetentionDays") ?? 365,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const status = z.enum(["onboarding", "active", "suspended"]).parse(formData.get("status"));

  await db
    .update(schema.clients)
    .set({
      ...parsed.data,
      blockedRegions: regions(parsed.data.blockedRegions),
      status,
      website: parsed.data.website || null,
      instantlyCampaignPrefix: parsed.data.instantlyCampaignPrefix || null,
      instantlyWorkspaceId: parsed.data.instantlyWorkspaceId || null,
    })
    .where(eq(schema.clients.id, id));
  await audit({ actorUserId: admin.id, clientId: id, action: "client.updated", entityType: "client", entityId: id, diff: { ...parsed.data, status } });
  revalidatePath(`/admin/clients/${id}`);
  return { success: "Client saved" };
}

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(["super_admin", "client_admin", "client_user"]),
  clientId: z.string().uuid().nullable(),
});

/**
 * Invite a user. Super admins can invite anyone; client admins can invite
 * client_admin / client_user into their own client only.
 */
export async function inviteUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    clientId: (formData.get("clientId") as string) || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, name, role, clientId } = parsed.data;

  if (actor.role === "super_admin") {
    if (role === "super_admin" && clientId) return { error: "Super admins are not attached to a client" };
    if (role !== "super_admin" && !clientId) return { error: "Client users must belong to a client" };
  } else if (actor.role === "client_admin") {
    if (role === "super_admin" || clientId !== actor.clientId) return { error: "Not allowed" };
  } else {
    return { error: "Not allowed" };
  }

  const existing = await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${email.toLowerCase()}` });
  if (existing) return { error: "A user with that email already exists" };

  const token = randomToken();
  await db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ email, name, role, clientId, isActive: false }).returning();
    await tx.insert(schema.authTokens).values({
      userId: user.id,
      purpose: "invite",
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  });
  const client = clientId ? await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) }) : null;
  await inviteEmail({ to: email, inviterName: actor.name, clientName: client?.name ?? null, token });
  await audit({ actorUserId: actor.id, clientId, action: "user.invited", entityType: "user", diff: { email, role } });
  revalidatePath(clientId ? `/admin/clients/${clientId}` : "/admin/team");
  revalidatePath("/app/team");
  return { success: `Invitation sent to ${email}` };
}

export async function setUserActiveAction(userId: string, isActive: boolean) {
  const actor = await requireUser();
  const target = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!target) return;
  const allowed =
    actor.role === "super_admin" || (actor.role === "client_admin" && target.clientId === actor.clientId && target.role !== "super_admin");
  if (!allowed || target.id === actor.id) return;
  await db.update(schema.users).set({ isActive }).where(and(eq(schema.users.id, userId)));
  await audit({ actorUserId: actor.id, clientId: target.clientId, action: isActive ? "user.activated" : "user.deactivated", entityType: "user", entityId: userId });
  revalidatePath(target.clientId ? `/admin/clients/${target.clientId}` : "/admin/team");
  revalidatePath("/app/team");
}
