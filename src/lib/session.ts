import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@/auth.config";

export const VIEW_AS_COOKIE = "view_as_client";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(user.role === "super_admin" ? "/admin" : "/app");
  return user;
}

/**
 * Resolves which client the current request is scoped to.
 * Client users: their own client. Super admin: the "view as client" cookie set from the admin portal.
 */
export async function requireClientScope() {
  const user = await requireUser();
  if (user.role === "super_admin") {
    const asId = (await cookies()).get(VIEW_AS_COOKIE)?.value;
    if (!asId) redirect("/admin/clients");
    return { user, clientId: asId, viewingAs: true, canManage: true };
  }
  if (!user.clientId) redirect("/login");
  return { user, clientId: user.clientId, viewingAs: false, canManage: user.role === "client_admin" };
}
