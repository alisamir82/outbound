import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { IcpSpec } from "@/db/schema";
import { getAi } from "./client";
import { runAgent } from "./run";
import { resolveSkill } from "./skills";

export type LeadForQualification = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  company?: string | null;
  country?: string | null;
};
export type Qualification = { id: string; score: number; qualification: string };

const Output = z.object({
  leads: z.array(z.object({ id: z.string(), score: z.number().int().min(1).max(5), qualification: z.string() })),
});

const BATCH = 20;

/** Scores leads in batches with the cheap model. One agent run per lead-run. */
export async function qualifyLeads(opts: { clientId: string; leadRunId: string; icp: IcpSpec; leads: LeadForQualification[] }): Promise<Qualification[]> {
  const ai = await getAi();
  return runAgent(
    { clientId: opts.clientId, skillKey: "lead-qualifier", trigger: "lead_run.qualify", entityType: "lead_run", entityId: opts.leadRunId },
    async (report) => {
      if (ai.mode === "mock") return opts.leads.map(mockQualify(opts.icp));
      const skill = await resolveSkill(opts.clientId, "lead-qualifier");
      const out: Qualification[] = [];
      for (let i = 0; i < opts.leads.length; i += BATCH) {
        const batch = opts.leads.slice(i, i + BATCH);
        const response = await ai.client!.messages.parse({
          model: ai.cheapModel,
          max_tokens: 8000,
          output_config: { effort: "low", format: zodOutputFormat(Output) },
          system: [{ type: "text", text: skill.content, cache_control: { type: "ephemeral" } }],
          messages: [
            {
              role: "user",
              content: `ICP:\n${JSON.stringify(opts.icp, null, 2)}\n\nLeads (return one entry per id):\n${JSON.stringify(batch, null, 2)}`,
            },
          ],
        });
        report({ model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
        if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Qualification returned no structured output");
        const byId = new Map(response.parsed_output.leads.map((l) => [l.id, l]));
        for (const lead of batch) {
          const q = byId.get(lead.id);
          out.push(q ?? { id: lead.id, score: 1, qualification: "Not scored by the model." });
        }
      }
      return out;
    },
  );
}

function mockQualify(icp: IcpSpec) {
  return (l: LeadForQualification): Qualification => {
    const titleMatch = icp.titles.some((t) => (l.title ?? "").toLowerCase().includes(t.toLowerCase().split(" ")[0]));
    const geoMatch = icp.geographies.includes(l.country ?? "");
    const score = 2 + (titleMatch ? 2 : 0) + (geoMatch ? 1 : 0);
    const pain = icp.painPoints[0] ?? "the problem we solve";
    return {
      id: l.id,
      score,
      qualification: `As ${l.title ?? "a leader"} at ${l.company ?? "your company"}, ${pain.toLowerCase()} is likely on your desk this quarter.`,
    };
  };
}
