import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ReplyClassification } from "@/db/schema";
import { SKILLS } from "./skills";

export const REPLY_CLASSES = ["interested", "question", "objection", "not_now", "wrong_person", "out_of_office", "unsubscribe", "hostile", "other"] as const;

const RULES: [ReplyClassification, number, string[]][] = [
  ["unsubscribe", 0.97, ["unsubscribe", "remove me", "stop emailing", "opt out", "do not contact", "don't contact", "take me off"]],
  ["hostile", 0.9, ["spam", "lawyer", "legal action", "harass", "report you", "how dare"]],
  ["out_of_office", 0.95, ["out of office", "out of the office", "away until", "on leave", "automatic reply", "auto-reply", "on holiday", "on vacation", "limited access to email"]],
  ["wrong_person", 0.85, ["not the right person", "wrong person", "speak to", "talk to my colleague", "forward", "i don't handle", "not my area", "responsible for this is"]],
  ["not_now", 0.85, ["next quarter", "later this year", "circle back", "not right now", "in a few months", "reach out in", "try again in", "after the summer", "next year"]],
  ["question", 0.55, ["price", "pricing", "discount", "contract", "cost", "how much"]],
  ["objection", 0.75, ["competitor", "already use", "already have", "in-house", "no budget", "not a priority", "happy with our current", "too expensive", "we built our own"]],
  ["interested", 0.92, ["interested", "call", "demo", "tell me more", "sounds good", "let's talk", "book", "meeting", "send me more", "chat"]],
  ["question", 0.7, ["?"]],
];

/** Pure keyword classifier used in mock mode and as the eval baseline. */
export function classifyMock(text: string): { classification: ReplyClassification; confidence: number } {
  const t = text.toLowerCase();
  const matched = RULES.find(([, , words]) => words.some((w) => t.includes(w)));
  return { classification: matched?.[0] ?? "other", confidence: matched?.[1] ?? 0.6 };
}

const Output = z.object({ classification: z.enum(REPLY_CLASSES), confidence: z.number().min(0).max(1) });

/** Live classifier using the reply-handler skill. Used by the eval suite against the real model. */
export async function classifyLive(client: Anthropic, model: string, text: string): Promise<{ classification: ReplyClassification; confidence: number }> {
  const response = await client.messages.parse({
    model,
    max_tokens: 300,
    output_config: { effort: "low", format: zodOutputFormat(Output) },
    system: [{ type: "text", text: SKILLS["reply-handler"].content + "\n\nFor this task return only the classification and confidence.", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Inbound reply:\n${text}` }],
  });
  if (!response.parsed_output) return { classification: "other", confidence: 0 };
  return response.parsed_output;
}
