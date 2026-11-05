import type { EmailVerificationAdapter, VerificationResult } from "../types";

/** Marks ~90% valid, some catch-all/invalid so review screens show every state. */
export const mockVerifier: EmailVerificationAdapter = {
  key: "mock",
  async verify(emails) {
    const out = new Map<string, VerificationResult>();
    for (const e of emails) {
      const r = Math.random();
      out.set(e, r < 0.88 ? "valid" : r < 0.95 ? "catch_all" : "invalid");
    }
    return out;
  },
};
