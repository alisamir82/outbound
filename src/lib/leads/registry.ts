import { getIntegration } from "@/lib/settings";
import { mockLeadSource } from "./sources/mock";
import { mockVerifier } from "./verification/mock";
import type { EmailVerificationAdapter, LeadSourceAdapter } from "./types";

const SOURCES: Record<string, () => Promise<LeadSourceAdapter>> = {
  mock: async () => mockLeadSource,
  // apollo: async () => (await import("./sources/apollo")).apolloLeadSource,   // Phase 1
  // connected: async () => (await import("./sources/connected")).connectedLeadSource, // when API access arrives
};

const VERIFIERS: Record<string, () => Promise<EmailVerificationAdapter>> = {
  mock: async () => mockVerifier,
};

/** Resolves the adapter chosen in Admin → Settings → Integrations. Falls back to mock. */
export async function resolveLeadSource(): Promise<LeadSourceAdapter> {
  const { value } = await getIntegration("lead_source");
  const provider = String(value.provider ?? "mock");
  const factory = SOURCES[provider];
  if (!factory) {
    console.warn(`[leads] provider "${provider}" not implemented, using mock`);
    return mockLeadSource;
  }
  return factory();
}

export async function resolveVerifier(): Promise<EmailVerificationAdapter> {
  const { value } = await getIntegration("email_verification");
  const provider = String(value.provider ?? "mock");
  const factory = VERIFIERS[provider];
  if (!factory) {
    console.warn(`[leads] verifier "${provider}" not implemented, using mock`);
    return mockVerifier;
  }
  return factory();
}
