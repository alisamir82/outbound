import { getIntegration } from "@/lib/settings";
import type { StoredTokens } from "./types";

/** OAuth endpoints for the two supported calendar providers. Client id/secret come from Admin → Integrations. */
export const PROVIDERS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy openid email",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  },
  microsoft: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access Calendars.ReadWrite User.Read",
    extraAuthParams: {},
    userinfoUrl: "https://graph.microsoft.com/v1.0/me",
  },
} as const;
export type OAuthProvider = keyof typeof PROVIDERS;

export async function oauthCredentials(provider: OAuthProvider) {
  const { secrets, value } = await getIntegration(provider === "google" ? "google_calendar" : "microsoft_calendar");
  const clientId = String(value.clientId ?? "");
  const clientSecret = secrets.clientSecret ?? "";
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function redirectUri(provider: OAuthProvider) {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/api/calendar/${provider}/callback`;
}

export function buildAuthUrl(provider: OAuthProvider, clientId: string, state: string) {
  const p = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: p.scope,
    state,
    ...p.extraAuthParams,
  });
  return `${p.authUrl}?${params}`;
}

export async function exchangeCode(provider: OAuthProvider, code: string): Promise<StoredTokens> {
  const creds = await oauthCredentials(provider);
  if (!creds) throw new Error("provider not configured");
  return tokenRequest(provider, { grant_type: "authorization_code", code, redirect_uri: redirectUri(provider), client_id: creds.clientId, client_secret: creds.clientSecret });
}

export async function refreshTokens(provider: OAuthProvider, tokens: StoredTokens): Promise<StoredTokens> {
  if (tokens.expiresAt - Date.now() > 60_000) return tokens;
  if (!tokens.refreshToken) throw new Error("calendar token expired and no refresh token stored; reconnect the calendar");
  const creds = await oauthCredentials(provider);
  if (!creds) throw new Error("provider not configured");
  const fresh = await tokenRequest(provider, { grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret });
  return { ...fresh, refreshToken: fresh.refreshToken ?? tokens.refreshToken };
}

async function tokenRequest(provider: OAuthProvider, form: Record<string, string>): Promise<StoredTokens> {
  const res = await fetch(PROVIDERS[provider].tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`OAuth token error: ${json.error_description ?? json.error ?? res.status}`);
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
}

export async function fetchAccountEmail(provider: OAuthProvider, accessToken: string): Promise<string> {
  const res = await fetch(PROVIDERS[provider].userinfoUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = (await res.json()) as { email?: string; mail?: string; userPrincipalName?: string };
  return json.email ?? json.mail ?? json.userPrincipalName ?? "unknown";
}
