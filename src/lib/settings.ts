import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptJson, encryptJson } from "./crypto";

/**
 * Integration registry. Each integration is configured by the Super Admin under
 * Admin → Settings → Integrations. Non-secret fields live in `value`, secrets are
 * encrypted at rest. Adding a new provider = add an entry here + an adapter.
 */
export type IntegrationKey =
  | "lead_source"
  | "email_verification"
  | "instantly"
  | "anthropic"
  | "apollo"
  | "google_calendar"
  | "microsoft_calendar"
  | "compliance";

export type IntegrationField = {
  name: string;
  label: string;
  type: "text" | "secret" | "number" | "boolean" | "select";
  options?: { value: string; label: string }[];
  help?: string;
};

export const INTEGRATIONS: Record<IntegrationKey, { title: string; description: string; fields: IntegrationField[] }> = {
  lead_source: {
    title: "Lead source",
    description: "Where new leads are sourced from. 'Mock' generates realistic dummy data for testing.",
    fields: [
      {
        name: "provider",
        label: "Provider",
        type: "select",
        options: [
          { value: "mock", label: "Mock (dummy data)" },
          { value: "apollo", label: "Apollo.io" },
          { value: "csv", label: "CSV upload only" },
          { value: "connected", label: "Connected (pending API access)" },
        ],
      },
      { name: "dailyCreditCap", label: "Daily credit cap", type: "number", help: "Max leads sourced per client per day." },
    ],
  },
  email_verification: {
    title: "Email verification",
    description: "Provider used to verify addresses before pushing to Instantly.",
    fields: [
      {
        name: "provider",
        label: "Provider",
        type: "select",
        options: [
          { value: "mock", label: "Mock (marks all valid)" },
          { value: "millionverifier", label: "MillionVerifier" },
          { value: "zerobounce", label: "ZeroBounce" },
          { value: "instantly", label: "Instantly built-in" },
        ],
      },
      { name: "apiKey", label: "API key", type: "secret" },
      { name: "acceptCatchAll", label: "Accept catch-all addresses", type: "boolean" },
    ],
  },
  apollo: {
    title: "Apollo.io",
    description: "Used when the lead source provider is Apollo.",
    fields: [{ name: "apiKey", label: "API key", type: "secret" }],
  },
  instantly: {
    title: "Instantly.ai",
    description: "Agency account. Campaigns, leads and replies are synchronised via the v2 API and the hosted MCP server.",
    fields: [
      { name: "apiKey", label: "API key", type: "secret" },
      { name: "webhookSecret", label: "Webhook secret", type: "secret", help: "Append as ?secret=… to the webhook URL <APP_URL>/api/webhooks/instantly when creating webhooks in Instantly." },
      { name: "enabled", label: "Enabled", type: "boolean" },
    ],
  },
  google_calendar: {
    title: "Google Calendar (OAuth app)",
    description: "Agency-level OAuth client used when clients connect a Google calendar. Redirect URI: <APP_URL>/api/calendar/google/callback",
    fields: [
      { name: "clientId", label: "OAuth client ID", type: "text" },
      { name: "clientSecret", label: "OAuth client secret", type: "secret" },
    ],
  },
  microsoft_calendar: {
    title: "Microsoft 365 Calendar (OAuth app)",
    description: "Azure app registration used when clients connect an Outlook calendar. Redirect URI: <APP_URL>/api/calendar/microsoft/callback",
    fields: [
      { name: "clientId", label: "Application (client) ID", type: "text" },
      { name: "clientSecret", label: "Client secret", type: "secret" },
    ],
  },
  compliance: {
    title: "Compliance defaults",
    description: "Platform-wide rules applied on top of each client's own settings.",
    fields: [
      { name: "blockedRegions", label: "Blocked countries (ISO codes, comma-separated)", type: "text", help: "Leads from these countries are never sourced, e.g. CA, DE where cold email is restricted." },
      { name: "retentionDays", label: "Default data retention (days)", type: "number", help: "Unengaged leads older than this are deleted. Clients can set a shorter window." },
      { name: "webhookRetentionDays", label: "Raw webhook retention (days)", type: "number" },
      { name: "budgetAlertPercent", label: "Budget alert threshold (%)", type: "number", help: "Alert the agency when a client passes this share of its monthly AI budget." },
    ],
  },
  anthropic: {
    title: "Anthropic (Claude)",
    description: "Platform-wide API key. Usage is metered per client.",
    fields: [
      {
        name: "mode",
        label: "Mode",
        type: "select",
        options: [
          { value: "mock", label: "Mock (no API calls, placeholder output)" },
          { value: "live", label: "Live (requires API key)" },
        ],
      },
      { name: "apiKey", label: "API key", type: "secret" },
      { name: "defaultModel", label: "Default model", type: "text", help: "Used for ICPs, copy and replies. Default claude-opus-5-5; claude-fable-5-1 for maximum quality." },
      { name: "cheapModel", label: "Classification model", type: "text", help: "Used for lead scoring and reply classification. Default claude-haiku-5-5." },
    ],
  },
};

export const INTEGRATION_DEFAULTS: Record<IntegrationKey, Record<string, unknown>> = {
  lead_source: { provider: "mock", dailyCreditCap: 500 },
  email_verification: { provider: "mock", acceptCatchAll: false },
  apollo: {},
  instantly: { enabled: false },
  google_calendar: {},
  microsoft_calendar: {},
  compliance: { blockedRegions: "", retentionDays: 365, webhookRetentionDays: 90, budgetAlertPercent: 80 },
  anthropic: { mode: "mock", defaultModel: "claude-opus-5-5", cheapModel: "claude-haiku-5-5" },
};

export type IntegrationConfig = { value: Record<string, unknown>; secrets: Record<string, string>; hasSecrets: string[] };

export async function getIntegration(key: IntegrationKey): Promise<IntegrationConfig> {
  const row = await db.query.platformSettings.findFirst({ where: eq(schema.platformSettings.key, key) });
  const value = { ...INTEGRATION_DEFAULTS[key], ...(row?.value ?? {}) };
  const secrets = row?.secretCiphertext ? decryptJson<Record<string, string>>(row.secretCiphertext) : {};
  return { value, secrets, hasSecrets: Object.keys(secrets).filter((k) => secrets[k]) };
}

export async function saveIntegration(
  key: IntegrationKey,
  value: Record<string, unknown>,
  secretPatch: Record<string, string | undefined>,
  updatedBy: string,
) {
  const current = await getIntegration(key);
  const secrets = { ...current.secrets };
  for (const [k, v] of Object.entries(secretPatch)) {
    if (v === undefined) continue; // blank input = keep existing
    if (v === "") delete secrets[k];
    else secrets[k] = v;
  }
  const secretCiphertext = Object.keys(secrets).length ? encryptJson(secrets) : null;
  await db
    .insert(schema.platformSettings)
    .values({ key, value, secretCiphertext, updatedBy })
    .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value, secretCiphertext, updatedBy } });
}
