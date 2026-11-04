import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Client, Lead, Message, ProposedSlot, ReplyClassification } from "@/db/schema";
import type { KbHit } from "@/lib/kb/search";
import { classifyMock } from "./classify";
import { getAi } from "./client";
import { runAgent } from "./run";
import { resolveSkill } from "./skills";

const CLASSES = ["interested", "question", "objection", "not_now", "wrong_person", "out_of_office", "unsubscribe", "hostile", "other"] as const;

const Output = z.object({
  classification: z.enum(CLASSES),
  confidence: z.number().min(0).max(1),
  draft: z.string(),
  wantsMeeting: z.boolean(),
  chosenSlotIndex: z.number().int().nullable(),
  escalate: z.boolean(),
  escalationReason: z.string().nullable(),
  usedExcerptIds: z.array(z.string()),
  reasoning: z.string(),
});
export type ReplyAgentOutput = z.infer<typeof Output>;

export type ReplyContext = {
  client: Client;
  lead: Lead;
  thread: { id: string; subject: string | null };
  history: Message[];
  inbound: Message;
  kbHits: KbHit[];
  slots: ProposedSlot[];
  campaignBrief: string | null;
};

export async function draftReply(ctx: ReplyContext): Promise<ReplyAgentOutput> {
  const ai = await getAi();
  return runAgent(
    { clientId: ctx.client.id, skillKey: "reply-handler", trigger: "reply.draft", entityType: "thread", entityId: ctx.thread.id },
    async (report) => {
      if (ai.mode === "mock") return mockReply(ctx);
      const skill = await resolveSkill(ctx.client.id, "reply-handler");
      const rs = ctx.client.replySettings;
      const context = [
        `Sender: ${rs.senderName || "the sender"} at ${ctx.client.name}${rs.signature ? `\nSignature: ${rs.signature}` : ""}`,
        rs.bookingLink ? `Booking link: ${rs.bookingLink}` : "Booking link: none",
        ctx.slots.length ? `Available meeting slots (index: label):\n${ctx.slots.map((s, i) => `${i}: ${s.label}`).join("\n")}` : "Available meeting slots: none (use the booking link or ask for their availability)",
        `Lead: ${[ctx.lead.firstName, ctx.lead.lastName].filter(Boolean).join(" ")}, ${ctx.lead.title ?? ""} at ${ctx.lead.company ?? ""} (${ctx.lead.country ?? ""})`,
        ctx.campaignBrief ? `Campaign brief: ${ctx.campaignBrief}` : "",
        `Knowledge base excerpts (cite by id in usedExcerptIds):\n${ctx.kbHits.length ? ctx.kbHits.map((h) => `[${h.id}] (${h.documentName}${h.heading ? ` › ${h.heading}` : ""})\n${h.text.slice(0, 1500)}`).join("\n\n") : "(none found)"}`,
        `Conversation so far (oldest first):\n${ctx.history.map((m) => `--- ${m.sender === "lead" ? "LEAD" : "US"} (${m.sentAt.toISOString()}) ---\n${m.bodyText.slice(0, 2000)}`).join("\n")}`,
        `New inbound message to answer:\n${ctx.inbound.bodyText.slice(0, 4000)}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const response = await ai.client!.messages.parse({
        model: ai.defaultModel,
        max_tokens: 4000,
        output_config: { effort: "medium", format: zodOutputFormat(Output) },
        system: [{ type: "text", text: skill.content, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: context }],
      });
      report({ model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
      if (response.stop_reason === "refusal") {
        return { classification: "other", confidence: 0, draft: "", wantsMeeting: false, chosenSlotIndex: null, escalate: true, escalationReason: "Model declined to draft this reply", usedExcerptIds: [], reasoning: "" };
      }
      if (!response.parsed_output) throw new Error("Reply agent returned no structured output");
      return response.parsed_output;
    },
  );
}

/** Keyword-based stand-in so the inbox works end to end without an API key. */
function mockReply(ctx: ReplyContext): ReplyAgentOutput {
  const t = ctx.inbound.bodyText.toLowerCase();
  const first = ctx.lead.firstName ?? "there";
  const sender = ctx.client.replySettings.senderName || "the team";
  const sign = `\n\n${sender.split(" ")[0]}`;
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  const { classification, confidence } = classifyMock(ctx.inbound.bodyText);

  const slotIdx = ctx.slots.findIndex((s) => has(s.label.split(",")[0].toLowerCase()));
  const kb = ctx.kbHits[0];
  const proof = kb ? ` ${kb.text.split(/(?<=[.!?])\s+/)[0]}` : "";
  const slotText = ctx.slots.length ? `Would any of these work?\n${ctx.slots.map((s) => `- ${s.label}`).join("\n")}` : ctx.client.replySettings.bookingLink ? `Grab a time here: ${ctx.client.replySettings.bookingLink}` : "What does your calendar look like next week?";
  const drafts: Record<ReplyClassification, string> = {
    interested: `Hi ${first},\n\nGreat, happy to walk you through it.${proof}\n\n${slotText}${sign}`,
    question: `Hi ${first},\n\nGood question.${proof || " I'll get you a precise answer from a colleague shortly."}\n\nHappy to go deeper on a short call if useful. ${slotText}${sign}`,
    objection: `Hi ${first},\n\nThat makes sense, and most teams we work with started from the same place.${proof}\n\nIf it's useful, I can show you in 15 minutes how that played out. ${slotText}${sign}`,
    not_now: `Hi ${first},\n\nUnderstood. I'll follow up then. Thanks for letting me know.${sign}`,
    wrong_person: `Hi ${first},\n\nThanks for pointing me in the right direction. Who would be the best person to speak to?${sign}`,
    out_of_office: "",
    unsubscribe: "",
    hostile: "",
    other: `Hi ${first},\n\nThanks for getting back to me. Could you say a little more about what you'd like to know?${sign}`,
  };
  const escalate = classification === "question" && has("price", "pricing", "discount", "contract", "legal", "security");
  return {
    classification,
    confidence,
    draft: drafts[classification],
    wantsMeeting: classification === "interested" && slotIdx >= 0,
    chosenSlotIndex: slotIdx >= 0 ? slotIdx : null,
    escalate,
    escalationReason: escalate ? "Pricing or contract question" : null,
    usedExcerptIds: kb ? [kb.id] : [],
    reasoning: "[mock] keyword classification; configure an Anthropic key for real drafts",
  };
}
