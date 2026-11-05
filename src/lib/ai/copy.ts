import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { IcpSpec, SequenceStep } from "@/db/schema";
import { getAi } from "./client";
import { runAgent } from "./run";
import { resolveSkill } from "./skills";

const Output = z.object({
  steps: z.array(z.object({ subject: z.string(), body: z.string(), delayDays: z.number().int().min(0).max(30) })).length(3),
});

export async function generateSequence(opts: {
  clientId: string;
  campaignId: string;
  campaignName: string;
  brief: string;
  icp: IcpSpec;
  companyName: string;
}): Promise<SequenceStep[]> {
  const ai = await getAi();
  return runAgent(
    { clientId: opts.clientId, skillKey: "copywriter", trigger: "campaign.copy", entityType: "campaign", entityId: opts.campaignId },
    async (report) => {
      if (ai.mode === "mock") return mockSequence(opts);
      const skill = await resolveSkill(opts.clientId, "copywriter");
      const response = await ai.client!.messages.parse({
        model: ai.defaultModel,
        max_tokens: 6000,
        output_config: { effort: "medium", format: zodOutputFormat(Output) },
        system: [{ type: "text", text: skill.content, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `Sender company: ${opts.companyName}\nCampaign: ${opts.campaignName}\nBrief: ${opts.brief}\n\nICP:\n${JSON.stringify(opts.icp, null, 2)}\n\nReturn three steps. Step 1 delayDays = 0, step 2 delayDays = 3, step 3 delayDays = 4.`,
          },
        ],
      });
      report({ model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
      if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Copy generation returned no structured output");
      return response.parsed_output.steps;
    },
  );
}

function mockSequence(o: { icp: IcpSpec; companyName: string }): SequenceStep[] {
  const pain = (o.icp.painPoints[0] ?? "a recurring problem").toLowerCase();
  return [
    {
      subject: "{{companyName}} and " + pain.split(" ").slice(0, 2).join(" "),
      body: `Hi {{firstName}},\n\n{{qualification}}\n\n${o.companyName} works with teams like yours on exactly this. ${o.icp.valueProposition}\n\nWorth a 15-minute call next week?\n\n{{senderName}}`,
      delayDays: 0,
    },
    {
      subject: "one more thought",
      body: `Hi {{firstName}},\n\nOne angle I didn't mention: most teams we talk to underestimate how much ${pain} costs them each month until they measure it.\n\nHappy to share how we measure it. Open to a short call?\n\n{{senderName}}`,
      delayDays: 3,
    },
    {
      subject: "closing the loop",
      body: `Hi {{firstName}},\n\nI'll stop here. If ${pain} becomes a priority later, reply any time and I'll pick it up.\n\n{{senderName}}`,
      delayDays: 4,
    },
  ];
}
