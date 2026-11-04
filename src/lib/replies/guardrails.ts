import type { Campaign, Client, Thread } from "@/db/schema";
import type { ReplyAgentOutput } from "@/lib/ai/reply";

export type GuardrailDecision = { autoSend: boolean; reasons: string[] };

const ESCALATE_PATTERNS: [RegExp, string][] = [
  [/\b(price|pricing|discount|quote|cost|budget approval)\b/i, "Pricing or discount mentioned"],
  [/\b(contract|msa|terms|legal|lawyer|liability)\b/i, "Contract or legal terms mentioned"],
  [/\b(refund|chargeback)\b/i, "Refund mentioned"],
  [/\b(security questionnaire|soc ?2|iso ?27001|gdpr|dpa|data processing)\b/i, "Security or compliance questionnaire"],
];

/**
 * Autonomous-mode guardrails from the plan (§4.4). Returns whether the agent may send
 * without a human and the reasons it must not. Human approval mode skips this entirely.
 */
export function evaluateGuardrails(input: {
  client: Client;
  campaign: Campaign | null;
  thread: Thread;
  inboundText: string;
  output: ReplyAgentOutput;
}): GuardrailDecision {
  const { client, campaign, thread, inboundText, output } = input;
  const rs = client.replySettings;
  const reasons: string[] = [];

  if (!campaign?.autonomousMode) reasons.push("Campaign is in approval mode");
  if (output.escalate) reasons.push(output.escalationReason || "Agent asked for a human");
  if (output.confidence < rs.minConfidence) reasons.push(`Confidence ${Math.round(output.confidence * 100)}% below threshold ${Math.round(rs.minConfidence * 100)}%`);
  if (output.classification === "hostile") reasons.push("Hostile or complaint tone");
  if (output.classification === "other") reasons.push("Could not classify the reply");
  if (thread.agentReplyCount >= rs.maxAgentRepliesPerThread) reasons.push(`Agent already replied ${thread.agentReplyCount} times in this thread`);
  for (const [re, why] of ESCALATE_PATTERNS) if (re.test(inboundText) || re.test(output.draft)) reasons.push(why);
  if (!output.draft.trim() && !["unsubscribe", "hostile", "out_of_office"].includes(output.classification)) reasons.push("Empty draft");

  return { autoSend: reasons.length === 0, reasons: [...new Set(reasons)] };
}
