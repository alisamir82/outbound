"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { VIEW_AS_COOKIE } from "@/lib/session";

export async function viewAsClientAction(clientId: string) {
  await requireRole("super_admin");
  (await cookies()).set(VIEW_AS_COOKIE, clientId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/app");
}

export async function exitViewAsAction() {
  await requireRole("super_admin");
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/admin/clients");
}
