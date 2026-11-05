import type { IcpSpec } from "@/db/schema";

/** Normalised lead shape every source adapter must produce. */
export type SourcedLead = {
  email: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  domain?: string;
  country?: string;
  linkedinUrl?: string;
  sourceRef?: string;
};

export interface LeadSourceAdapter {
  readonly key: string;
  search(input: { icp: IcpSpec; limit: number; exclude: Set<string> }): Promise<SourcedLead[]>;
}

export type VerificationResult = "valid" | "invalid" | "catch_all" | "unknown";

export interface EmailVerificationAdapter {
  readonly key: string;
  verify(emails: string[]): Promise<Map<string, VerificationResult>>;
}
