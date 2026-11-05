import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { classifyLive, classifyMock } from "../../src/lib/ai/classify";

type Case = { text: string; label: string };
const cases: Case[] = JSON.parse(readFileSync(path.join(__dirname, "replies.json"), "utf8"));

/** Classes where a wrong call is costly: these must be right, not just mostly right. */
const CRITICAL = new Set(["unsubscribe", "hostile", "out_of_office"]);

function score(results: { label: string; predicted: string }[]) {
  const correct = results.filter((r) => r.label === r.predicted).length;
  const criticalMisses = results.filter((r) => CRITICAL.has(r.label) && r.label !== r.predicted);
  return { accuracy: correct / results.length, criticalMisses };
}

test("mock classifier: ≥ 85% accuracy and no critical misses", () => {
  const results = cases.map((c) => ({ ...c, predicted: classifyMock(c.text).classification }));
  const { accuracy, criticalMisses } = score(results);
  const wrong = results.filter((r) => r.label !== r.predicted).map((r) => `  "${r.text}" → ${r.predicted} (expected ${r.label})`);
  console.log(`mock accuracy ${(accuracy * 100).toFixed(1)}% on ${cases.length} cases${wrong.length ? "\n" + wrong.join("\n") : ""}`);
  assert.ok(accuracy >= 0.85, `accuracy ${accuracy} < 0.85`);
  assert.equal(criticalMisses.length, 0, `critical misses: ${JSON.stringify(criticalMisses)}`);
});

test("live classifier: ≥ 90% accuracy and no critical misses", { skip: !process.env.ANTHROPIC_API_KEY && "set ANTHROPIC_API_KEY to run the live eval" }, async () => {
  const client = new Anthropic();
  const model = process.env.EVAL_MODEL ?? "claude-haiku-5-5";
  const results = [];
  for (const c of cases) results.push({ ...c, predicted: (await classifyLive(client, model, c.text)).classification });
  const { accuracy, criticalMisses } = score(results);
  console.log(`live (${model}) accuracy ${(accuracy * 100).toFixed(1)}% on ${cases.length} cases`);
  assert.ok(accuracy >= 0.9, `accuracy ${accuracy} < 0.9`);
  assert.equal(criticalMisses.length, 0, `critical misses: ${JSON.stringify(criticalMisses)}`);
});
