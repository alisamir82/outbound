import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@/auth.config";

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
 * Client users: their own client. Super admin: the `?as=<clientId>` param ("view as client").
 */
export async function requireClientScope(asParam?: string | null) {
  const user = await requireUser();
  if (user.role === "super_admin") {
    if (!asParam) redirect("/admin/clients");
    return { user, clientId: asParam, viewingAs: true };
  }
  if (!user.clientId) redirect("/login");
  return { user, clientId: user.clientId, viewingAs: false };
}
