import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { IcpSpec } from "@/db/schema";
import { getAi } from "./client";
import { runAgent } from "./run";
import { resolveSkill } from "./skills";

const IcpOutput = z.object({
  name: z.string(),
  industries: z.array(z.string()),
  companySizes: z.array(z.string()),
  geographies: z.array(z.string()),
  titles: z.array(z.string()),
  painPoints: z.array(z.string()),
  disqualifiers: z.array(z.string()),
  valueProposition: z.string(),
});
export type IcpOutput = z.infer<typeof IcpOutput>;

export async function generateIcp(opts: { clientId: string; prompt: string; userId: string }): Promise<IcpOutput> {
  const ai = await getAi();
  return runAgent({ clientId: opts.clientId, skillKey: "icp-builder", trigger: "icp.generate" }, async (report) => {
    if (ai.mode === "mock") return mockIcp(opts.prompt);
    const skill = await resolveSkill(opts.clientId, "icp-builder");
    const response = await ai.client!.messages.parse({
      model: ai.defaultModel,
      max_tokens: 4000,
      output_config: { effort: "medium", format: zodOutputFormat(IcpOutput) },
      system: [{ type: "text", text: skill.content, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Build the ICP for this company:\n\n${opts.prompt}` }],
    });
    report({ model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
    if (response.stop_reason === "refusal") throw new Error(`Model declined the request: ${response.stop_details?.explanation ?? ""}`);
    if (!response.parsed_output) throw new Error("ICP generation returned no structured output");
    return response.parsed_output;
  });
}

export function toSpec(o: IcpOutput): IcpSpec {
  return {
    industries: o.industries,
    companySizes: o.companySizes,
    geographies: o.geographies,
    titles: o.titles,
    painPoints: o.painPoints,
    disqualifiers: o.disqualifiers,
    valueProposition: o.valueProposition,
  };
}

/** Deterministic placeholder used when no Anthropic key is configured. */
function mockIcp(prompt: string): IcpOutput {
  const words = prompt.split(/\s+/).filter((w) => w.length > 4).slice(0, 3);
  return {
    name: `Mock ICP: ${words.join(" ") || "general"}`.slice(0, 40),
    industries: ["Software", "Professional services"],
    companySizes: ["51-200", "201-500"],
    geographies: ["GB", "US", "DE"],
    titles: ["Head of Sales", "VP Marketing", "Chief Revenue Officer", "Director of Growth"],
    painPoints: ["Pipeline is unpredictable quarter to quarter", "Outbound replies are low and manual", "Reps spend hours researching accounts"],
    disqualifiers: ["Fewer than 10 employees", "No sales team"],
    valueProposition: `[mock] Based on: "${prompt.slice(0, 80)}". Configure an Anthropic API key under Admin → Integrations for real output.`,
  };
}
