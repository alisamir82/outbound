import { getIntegration } from "@/lib/settings";

/**
 * Instantly.ai v2 API adapter for the shared agency account.
 * Falls back to a mock when the integration is disabled or has no API key, so
 * the whole pipeline can be exercised in a demo.
 *
 * Endpoints are based on the public v2 docs (developer.instantly.ai). Field names
 * for campaign creation should be confirmed against a test workspace before
 * the first real push; they are isolated here so only this file changes.
 */
export type InstantlyLead = {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  website?: string;
  custom_variables?: Record<string, string>;
};

export type InstantlySequenceStep = { subject: string; body: string; delayDays: number };

export interface InstantlyAdapter {
  readonly mode: "live" | "mock";
  createCampaign(input: { name: string; steps: InstantlySequenceStep[]; timezone: string }): Promise<{ id: string }>;
  addLeads(campaignId: string, leads: InstantlyLead[]): Promise<{ added: number; skipped: number; errors: { email: string; error: string }[] }>;
  activateCampaign(campaignId: string): Promise<void>;
}

const BASE = "https://api.instantly.ai/api/v2";

class LiveInstantly implements InstantlyAdapter {
  readonly mode = "live" as const;
  constructor(private apiKey: string) {}

  private async call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Instantly ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async createCampaign(input: { name: string; steps: InstantlySequenceStep[]; timezone: string }) {
    const out = await this.call<{ id: string }>("/campaigns", {
      name: input.name,
      campaign_schedule: {
        schedules: [
          {
            name: "Business hours",
            timing: { from: "09:00", to: "17:00" },
            days: { 1: true, 2: true, 3: true, 4: true, 5: true },
            timezone: input.timezone,
          },
        ],
      },
      sequences: [
        {
          steps: input.steps.map((s) => ({
            type: "email",
            delay: s.delayDays,
            variants: [{ subject: s.subject, body: s.body.replace(/\n/g, "<br>") }],
          })),
        },
      ],
    });
    return { id: out.id };
  }

  async addLeads(campaignId: string, leads: InstantlyLead[]) {
    const result = { added: 0, skipped: 0, errors: [] as { email: string; error: string }[] };
    for (const lead of leads) {
      try {
        await this.call("/leads", { campaign: campaignId, skip_if_in_workspace: true, ...lead });
        result.added++;
      } catch (e) {
        result.errors.push({ email: lead.email, error: (e as Error).message });
      }
    }
    return result;
  }

  async activateCampaign(campaignId: string) {
    await this.call(`/campaigns/${campaignId}/activate`, {});
  }
}

class MockInstantly implements InstantlyAdapter {
  readonly mode = "mock" as const;
  async createCampaign(input: { name: string }) {
    return { id: `mock-campaign-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}` };
  }
  async addLeads(_campaignId: string, leads: InstantlyLead[]) {
    return { added: leads.length, skipped: 0, errors: [] };
  }
  async activateCampaign() {}
}

export async function getInstantly(): Promise<InstantlyAdapter> {
  const { value, secrets } = await getIntegration("instantly");
  if (value.enabled && secrets.apiKey) return new LiveInstantly(secrets.apiKey);
  return new MockInstantly();
}
