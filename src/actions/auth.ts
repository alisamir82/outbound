"use server";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/crypto";
import { passwordResetEmail } from "@/lib/email";
import { hashPassword, passwordRules } from "@/lib/password";

export type ActionState = { error?: string; success?: string } | undefined;

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "");
  const next = String(formData.get("next") ?? "");
  try {
    await signIn("credentials", { email, password: formData.get("password"), redirect: false });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Invalid email or password" };
    throw e;
  }
  // Resolve the landing page by role here rather than relying on the proxy redirect,
  // so the browser URL updates correctly after the server action.
  const user = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = ${email.toLowerCase()}`,
    columns: { role: true },
  });
  const home = user?.role === "super_admin" ? "/admin" : "/app";
  const safeNext = next.startsWith("/") && next !== "/" ? next : home;
  redirect(safeNext);
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.string().email().safeParse(formData.get("email"));
  const generic = { success: "If that address exists, a reset link has been sent." };
  if (!email.success) return generic;
  const user = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = ${email.data.toLowerCase()}`,
  });
  if (user && user.isActive) {
    const token = randomToken();
    await db.insert(schema.authTokens).values({
      userId: user.id,
      purpose: "password_reset",
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await passwordResetEmail({ to: user.email, token });
  }
  return generic;
}

async function consumeToken(token: string, purpose: "invite" | "password_reset") {
  const row = await db.query.authTokens.findFirst({
    where: and(
      eq(schema.authTokens.tokenHash, sha256(token)),
      eq(schema.authTokens.purpose, purpose),
      isNull(schema.authTokens.usedAt),
      gt(schema.authTokens.expiresAt, new Date()),
    ),
  });
  return row ?? null;
}

export async function tokenIsValid(token: string, purpose: "invite" | "password_reset") {
  return (await consumeToken(token, purpose)) !== null;
}

/** Shared by reset-password and accept-invite: sets a password via a one-time token. */
export async function setPasswordWithTokenAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const purpose = formData.get("purpose") === "invite" ? "invite" : "password_reset";
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { error: "Passwords do not match" };
  const ruleError = passwordRules.check(password);
  if (ruleError) return { error: ruleError };

  const row = await consumeToken(token, purpose);
  if (!row) return { error: "This link is invalid or has expired. Request a new one." };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ passwordHash: await hashPassword(password), isActive: true })
      .where(eq(schema.users.id, row.userId));
    await tx.update(schema.authTokens).set({ usedAt: new Date() }).where(eq(schema.authTokens.id, row.id));
  });
  await audit({ actorUserId: row.userId, action: purpose === "invite" ? "user.invite_accepted" : "user.password_reset", entityType: "user", entityId: row.userId });
  redirect("/login?reset=1");
}
