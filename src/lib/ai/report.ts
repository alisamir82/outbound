import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ReportContent } from "@/db/schema";
import { getAi } from "./client";
import { runAgent } from "./run";
import { resolveSkill } from "./skills";

const Output = z.object({ highlights: z.array(z.string()).min(1).max(4), narrative: z.string(), nextSteps: z.array(z.string()).min(1).max(3) });

export async function writeReportNarrative(clientId: string, clientName: string, data: Omit<ReportContent, "highlights" | "narrative" | "nextSteps">) {
  const ai = await getAi();
  return runAgent({ clientId, skillKey: "weekly-reporter", trigger: "report.weekly" }, async (report) => {
    if (ai.mode === "mock") return mockNarrative(data);
    const skill = await resolveSkill(clientId, "weekly-reporter");
    const response = await ai.client!.messages.parse({
      model: ai.defaultModel,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(Output) },
      system: [{ type: "text", text: skill.content, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Client: ${clientName}\n\n${JSON.stringify(data, null, 2)}` }],
    });
    report({ model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
    if (response.stop_reason === "refusal" || !response.parsed_output) return mockNarrative(data);
    return response.parsed_output;
  });
}

function pct(a: number, b: number) {
  return b ? ((a / b) * 100).toFixed(1) + "%" : "n/a";
}

function mockNarrative(d: Omit<ReportContent, "highlights" | "narrative" | "nextSteps">) {
  const t = d.totals;
  const p = d.previous;
  const delta = (a: number, b: number) => (b === 0 ? "" : a >= b ? ` (up from ${b})` : ` (down from ${b})`);
  const top = [...d.campaigns].sort((a, b) => b.replyRate - a.replyRate)[0];
  return {
    highlights: [
      `${t.meetings} meeting${t.meetings === 1 ? "" : "s"} booked${delta(t.meetings, p.meetings)}`,
      `${t.replied} replies from ${t.sent} emails sent (${pct(t.replied, t.sent)} reply rate)`,
      ...(top ? [`Best campaign: "${top.name}" at ${top.replyRate.toFixed(1)}% replies`] : []),
      ...(d.health.critical ? [`${d.health.critical} sending account${d.health.critical === 1 ? "" : "s"} need attention`] : []),
    ].slice(0, 4),
    narrative:
      t.sent < 50
        ? `Volume was low this week (${t.sent} emails), so the numbers are not yet meaningful. ${t.leadsAdded} new leads were added and ${t.meetings} meetings booked. Expect a fuller picture next week as sequences ramp up.`
        : `You sent ${t.sent} emails this week${delta(t.sent, p.sent)}, which produced ${t.replied} replies (${pct(t.replied, t.sent)}) and ${t.meetings} booked meetings. Open rate was ${pct(t.opened, t.sent)} and bounces stayed at ${pct(t.bounced, t.sent)}. ${d.health.critical || d.health.warning ? `Deliverability needs attention: ${d.health.critical + d.health.warning} sending accounts are flagged and the agency is reviewing warm-up settings.` : "Sending accounts are healthy."} AI handling cost $${t.aiSpendUsd.toFixed(2)}. [mock narrative: configure an Anthropic key for a written summary]`,
    nextSteps: ["Review and approve the optimisation proposals below.", "Approve any leads waiting in review so the next sequence can start.", d.health.critical ? "Pause sending on flagged accounts until bounce rates recover." : "Keep the current cadence for another week before changing copy."],
  };
}
