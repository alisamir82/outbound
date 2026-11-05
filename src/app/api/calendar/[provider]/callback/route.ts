import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { exchangeCode, fetchAccountEmail, type OAuthProvider } from "@/lib/calendar/oauth";
import { encryptJson } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { eq } from "drizzle-orm";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const user = await requireUser();
  const jar = await cookies();
  const raw = jar.get("cal_oauth_state")?.value;
  jar.delete("cal_oauth_state");
  const saved = raw ? (JSON.parse(raw) as { state: string; clientId: string; provider: string }) : null;
  if (!saved || saved.state !== url.searchParams.get("state") || saved.provider !== provider) redirect("/app/settings/replies?calendar=state_mismatch");
  const code = url.searchParams.get("code");
  if (!code) redirect(`/app/settings/replies?calendar=${encodeURIComponent(url.searchParams.get("error") ?? "denied")}`);

  try {
    const tokens = await exchangeCode(provider as OAuthProvider, code);
    const accountEmail = await fetchAccountEmail(provider as OAuthProvider, tokens.accessToken);
    await db
      .insert(schema.calendarConnections)
      .values({ clientId: saved.clientId, provider: provider as "google" | "microsoft", accountEmail, tokenCiphertext: encryptJson(tokens), connectedBy: user.id })
      .onConflictDoUpdate({ target: schema.calendarConnections.clientId, set: { provider: provider as "google" | "microsoft", accountEmail, tokenCiphertext: encryptJson(tokens), connectedBy: user.id } });
    const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, saved.clientId), columns: { onboarding: true } });
    if (client) await db.update(schema.clients).set({ onboarding: { ...client.onboarding, calendar: true } }).where(eq(schema.clients.id, saved.clientId));
    await audit({ actorUserId: user.id, clientId: saved.clientId, action: "calendar.connected", entityType: "calendar", diff: { provider, accountEmail } });
  } catch (e) {
    redirect(`/app/settings/replies?calendar=${encodeURIComponent((e as Error).message.slice(0, 120))}`);
  }
  redirect("/app/settings/replies?calendar=connected");
}
