import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Campaign, IcpSpec, ProposalChange } from "@/db/schema";
import { getAi } from "./client";
import { runAgent } from "./run";
import { resolveSkill } from "./skills";

const Output = z.object({
  proposals: z
    .array(
      z.object({
        type: z.enum(["subject_line", "body", "timing", "targeting"]),
        title: z.string(),
        rationale: z.string(),
        expectedImpact: z.string(),
        step: z.number().int().min(0).max(2).nullable(),
        newText: z.string().nullable(),
        newDelayDays: z.number().int().min(0).max(30).nullable(),
        targetingField: z.enum(["titles", "industries", "geographies"]).nullable(),
        add: z.array(z.string()),
        remove: z.array(z.string()),
      }),
    )
    .max(3),
});

export type Proposal = { type: "subject_line" | "body" | "timing" | "targeting"; title: string; rationale: string; expectedImpact: string; change: ProposalChange };

export async function proposeOptimisations(input: {
  campaign: Campaign;
  icp: IcpSpec | null;
  daily: { day: string; sent: number; opened: number; replied: number; bounced: number }[];
  classifications: Record<string, number>;
}): Promise<Proposal[]> {
  const ai = await getAi();
  const { campaign } = input;
  return runAgent({ clientId: campaign.clientId, skillKey: "campaign-optimiser", trigger: "campaign.optimise", entityType: "campaign", entityId: campaign.id }, async (report) => {
    if (ai.mode === "mock") return mockProposals(input);
    const skill = await resolveSkill(campaign.clientId, "campaign-optimiser");
    const response = await ai.client!.messages.parse({
      model: ai.defaultModel,
      max_tokens: 4000,
      output_config: { effort: "medium", format: zodOutputFormat(Output) },
      system: [{ type: "text", text: skill.content, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Campaign: ${campaign.name}\nSequence:\n${JSON.stringify(campaign.sequence, null, 2)}\n\nICP:\n${JSON.stringify(input.icp, null, 2)}\n\nDaily stats (last 14 days):\n${JSON.stringify(input.daily)}\n\nReply classifications:\n${JSON.stringify(input.classifications)}`,
        },
      ],
    });
    report({ model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
    if (response.stop_reason === "refusal" || !response.parsed_output) return [];
    const out: Proposal[] = [];
    for (const p of response.parsed_output.proposals) {
      const step = p.step ?? 0;
      const current = campaign.sequence[step];
      let change: ProposalChange | null = null;
      if (p.type === "subject_line" && p.newText && current) change = { kind: "subject_line", step, from: current.subject, to: p.newText };
      else if (p.type === "body" && p.newText && current) change = { kind: "body", step, from: current.body, to: p.newText };
      else if (p.type === "timing" && p.newDelayDays != null && current) change = { kind: "timing", step, fromDays: current.delayDays, toDays: p.newDelayDays };
      else if (p.type === "targeting" && p.targetingField) change = { kind: "targeting", field: p.targetingField, add: p.add, remove: p.remove };
      if (change) out.push({ type: p.type, title: p.title, rationale: p.rationale, expectedImpact: p.expectedImpact, change });
    }
    return out;
  });
}

function mockProposals(input: { campaign: Campaign; daily: { sent: number; opened: number; replied: number }[] }): Proposal[] {
  const { campaign, daily } = input;
  const sent = daily.reduce((a, d) => a + d.sent, 0);
  const opened = daily.reduce((a, d) => a + d.opened, 0);
  const replied = daily.reduce((a, d) => a + d.replied, 0);
  // Lower bar than the live skill (100 sends) so demos show the approval flow.
  if (sent < 30 || campaign.sequence.length < 3) return [];
  const openRate = opened / sent;
  const replyRate = replied / sent;
  const out: Proposal[] = [];
  if (openRate < 0.45) {
    const s = campaign.sequence[0];
    out.push({ type: "subject_line", title: "Shorter step 1 subject", rationale: `Open rate ${(openRate * 100).toFixed(0)}% on ${sent} sends; shorter subjects without merge tags tend to open better. [mock]`, expectedImpact: "Open rate toward 50-55%", change: { kind: "subject_line", step: 0, from: s.subject, to: "quick thought on routing" } });
  }
  if (replyRate < 0.04) {
    const s = campaign.sequence[1];
    out.push({ type: "timing", title: "Send step 2 sooner", rationale: `Reply rate ${(replyRate * 100).toFixed(1)}%; a 2-day follow-up keeps the thread fresh while the first email is still in view. [mock]`, expectedImpact: "Reply rate from " + (replyRate * 100).toFixed(1) + "% toward 4%", change: { kind: "timing", step: 1, fromDays: s.delayDays, toDays: Math.max(1, s.delayDays - 1) } });
  }
  return out;
}
