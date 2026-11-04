import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomToken } from "@/lib/crypto";
import { buildAuthUrl, oauthCredentials, type OAuthProvider } from "@/lib/calendar/oauth";
import { requireClientScope } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") return new Response("unknown provider", { status: 404 });
  const { clientId, canManage } = await requireClientScope();
  if (!canManage) return new Response("forbidden", { status: 403 });
  const creds = await oauthCredentials(provider as OAuthProvider);
  if (!creds) redirect("/app/settings/replies?calendar=not_configured");
  const state = randomToken(16);
  (await cookies()).set("cal_oauth_state", JSON.stringify({ state, clientId, provider }), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  redirect(buildAuthUrl(provider as OAuthProvider, creds.clientId, state));
}
