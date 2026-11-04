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

export type DailyStat = { day: string; sent: number; opened: number; replied: number; bounced: number };
export type AccountInfo = {
  email: string;
  warmupEnabled: boolean;
  warmupScore: number | null;
  dailyLimit: number;
  sentToday: number;
  bounceRateBp: number;
  replyRateBp: number;
  providerStatus: string | null;
};

export interface InstantlyAdapter {
  readonly mode: "live" | "mock";
  /** Daily campaign analytics for a date range (inclusive, YYYY-MM-DD). */
  getCampaignDailyStats(campaignId: string, from: string, to: string, hint?: { volume: number }): Promise<DailyStat[]>;
  /** Sending accounts in the agency workspace with warm-up and deliverability signals. */
  listAccounts(): Promise<AccountInfo[]>;
  /** Replace the sequence of an existing campaign (used when an optimisation is applied). */
  updateCampaignSequence(campaignId: string, steps: InstantlySequenceStep[]): Promise<void>;
  /** Reply inside an existing thread from the same sending account. */
  sendReply(input: { emailAccount: string; replyToMessageId: string; subject: string; text: string }): Promise<{ id: string }>;
  /** Best-effort: stop sequences for a lead that unsubscribed or bounced. */
  stopLead(input: { email: string; campaignId: string | null }): Promise<void>;
  createCampaign(input: { name: string; steps: InstantlySequenceStep[]; timezone: string }): Promise<{ id: string }>;
  addLeads(campaignId: string, leads: InstantlyLead[]): Promise<{ added: number; skipped: number; errors: { email: string; error: string }[] }>;
  activateCampaign(campaignId: string): Promise<void>;
}

const BASE = "https://api.instantly.ai/api/v2";

class LiveInstantly implements InstantlyAdapter {
  readonly mode = "live" as const;
  constructor(private apiKey: string) {}

  private async call<T>(path: string, body: unknown, method: "POST" | "GET" | "PATCH" = "POST"): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Instantly ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async getCampaignDailyStats(campaignId: string, from: string, to: string) {
    const rows = await this.call<{ date: string; sent?: number; opened?: number; replies?: number; replied?: number; bounced?: number }[]>(
      `/campaigns/analytics/daily?campaign_id=${encodeURIComponent(campaignId)}&start_date=${from}&end_date=${to}`,
      undefined,
      "GET",
    );
    return (Array.isArray(rows) ? rows : []).map((r) => ({ day: r.date.slice(0, 10), sent: r.sent ?? 0, opened: r.opened ?? 0, replied: r.replies ?? r.replied ?? 0, bounced: r.bounced ?? 0 }));
  }

  async listAccounts() {
    const out = await this.call<{ items?: Record<string, unknown>[] } | Record<string, unknown>[]>("/accounts?limit=100", undefined, "GET");
    const items = Array.isArray(out) ? out : (out.items ?? []);
    const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
    return items.map((a) => ({
      email: String(a.email ?? ""),
      warmupEnabled: Boolean(a.warmup_enabled ?? (a.warmup as Record<string, unknown> | undefined)?.enabled),
      warmupScore: a.stat_warmup_score != null ? num(a.stat_warmup_score) : null,
      dailyLimit: num(a.daily_limit),
      sentToday: num(a.sent_today ?? a.daily_sent),
      bounceRateBp: Math.round(num(a.bounce_rate) * 100),
      replyRateBp: Math.round(num(a.reply_rate) * 100),
      providerStatus: a.status != null ? String(a.status) : null,
    }));
  }

  async updateCampaignSequence(campaignId: string, steps: InstantlySequenceStep[]) {
    await this.call(
      `/campaigns/${campaignId}`,
      { sequences: [{ steps: steps.map((s) => ({ type: "email", delay: s.delayDays, variants: [{ subject: s.subject, body: s.body.replace(/\n/g, "<br>") }] })) }] },
      "PATCH",
    );
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

  async sendReply(input: { emailAccount: string; replyToMessageId: string; subject: string; text: string }) {
    const out = await this.call<{ id: string }>("/emails/reply", {
      eaccount: input.emailAccount,
      reply_to_uuid: input.replyToMessageId,
      subject: input.subject,
      body: { text: input.text, html: input.text.replace(/\n/g, "<br>") },
    });
    return { id: out.id };
  }

  async stopLead(input: { email: string; campaignId: string | null }) {
    try {
      await this.call("/leads/update-interest-status", { lead_email: input.email, campaign_id: input.campaignId, interest_value: -3 });
    } catch (e) {
      console.warn("[instantly] stopLead failed:", (e as Error).message);
    }
  }
}

class MockInstantly implements InstantlyAdapter {
  readonly mode = "mock" as const;
  /** Deterministic pseudo-random daily numbers so dashboards and reports have shape in demos. */
  async getCampaignDailyStats(campaignId: string, from: string, to: string, hint?: { volume: number }) {
    const out: DailyStat[] = [];
    const volume = Math.max(5, hint?.volume ?? 30);
    let seed = [...campaignId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (let d = new Date(from); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
      const sent = weekend ? 0 : Math.round(volume * (0.6 + rnd() * 0.8));
      out.push({ day: d.toISOString().slice(0, 10), sent, opened: Math.round(sent * (0.35 + rnd() * 0.3)), replied: Math.round(sent * (0.03 + rnd() * 0.06)), bounced: Math.round(sent * rnd() * 0.03) });
    }
    return out;
  }
  async listAccounts() {
    return [
      { email: "sdr1@agency-demo.example.com", warmupEnabled: true, warmupScore: 96, dailyLimit: 50, sentToday: 42, bounceRateBp: 90, replyRateBp: 410, providerStatus: "active" },
      { email: "sdr2@agency-demo.example.com", warmupEnabled: true, warmupScore: 71, dailyLimit: 50, sentToday: 50, bounceRateBp: 380, replyRateBp: 220, providerStatus: "active" },
      { email: "sdr3@agency-demo.example.com", warmupEnabled: false, warmupScore: 40, dailyLimit: 30, sentToday: 0, bounceRateBp: 0, replyRateBp: 0, providerStatus: "paused" },
    ];
  }
  async updateCampaignSequence() {}
  async createCampaign(input: { name: string }) {
    return { id: `mock-campaign-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}` };
  }
  async addLeads(_campaignId: string, leads: InstantlyLead[]) {
    return { added: leads.length, skipped: 0, errors: [] };
  }
  async activateCampaign() {}
  async sendReply(input: { replyToMessageId: string }) {
    return { id: `mock-reply-${input.replyToMessageId}-${Date.now()}` };
  }
  async stopLead() {}
}

export async function getInstantly(): Promise<InstantlyAdapter> {
  const { value, secrets } = await getIntegration("instantly");
  if (value.enabled && secrets.apiKey) return new LiveInstantly(secrets.apiKey);
  return new MockInstantly();
}
