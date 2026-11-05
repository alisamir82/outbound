import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateGuardrails } from "../../src/lib/replies/guardrails";
import type { Campaign, Client, Thread } from "../../src/db/schema";

const client = { replySettings: { minConfidence: 0.8, maxAgentRepliesPerThread: 3, businessHoursOnly: true, senderName: "", signature: "", bookingLink: "", meetingDurationMin: 30 } } as Client;
const campaign = { autonomousMode: true } as Campaign;
const thread = { agentReplyCount: 0 } as Thread;
const ok = { classification: "interested" as const, confidence: 0.95, draft: "Hi, happy to talk. Thu 10:00?", wantsMeeting: false, chosenSlotIndex: null, escalate: false, escalationReason: null, usedExcerptIds: [], reasoning: "" };

test("auto-sends a confident, clean interested reply", () => {
  assert.equal(evaluateGuardrails({ client, campaign, thread, inboundText: "sure, let's talk", output: ok }).autoSend, true);
});
test("never auto-sends in approval mode", () => {
  assert.equal(evaluateGuardrails({ client, campaign: { autonomousMode: false } as Campaign, thread, inboundText: "sure", output: ok }).autoSend, false);
});
test("escalates on pricing in the inbound text", () => {
  const r = evaluateGuardrails({ client, campaign, thread, inboundText: "what's the pricing?", output: ok });
  assert.equal(r.autoSend, false);
  assert.ok(r.reasons.some((x) => x.includes("Pricing")));
});
test("escalates on pricing leaking into the draft", () => {
  assert.equal(evaluateGuardrails({ client, campaign, thread, inboundText: "ok", output: { ...ok, draft: "We can offer a 20% discount." } }).autoSend, false);
});
test("escalates below the confidence threshold", () => {
  assert.equal(evaluateGuardrails({ client, campaign, thread, inboundText: "ok", output: { ...ok, confidence: 0.7 } }).autoSend, false);
});
test("stops after the per-thread reply cap", () => {
  assert.equal(evaluateGuardrails({ client, campaign, thread: { agentReplyCount: 3 } as Thread, inboundText: "ok", output: ok }).autoSend, false);
});
test("hostile replies are never auto-sent", () => {
  assert.equal(evaluateGuardrails({ client, campaign, thread, inboundText: "this is spam", output: { ...ok, classification: "hostile", confidence: 0.99 } }).autoSend, false);
});
test("agent-requested escalation wins over confidence", () => {
  assert.equal(evaluateGuardrails({ client, campaign, thread, inboundText: "ok", output: { ...ok, escalate: true, escalationReason: "security questionnaire" } }).autoSend, false);
});
