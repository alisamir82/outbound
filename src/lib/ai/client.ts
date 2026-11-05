import Anthropic from "@anthropic-ai/sdk";
import { getIntegration } from "@/lib/settings";

export type AiConfig = {
  mode: "live" | "mock";
  defaultModel: string;
  cheapModel: string;
  client: Anthropic | null;
};

/**
 * Resolves the Anthropic client from Admin → Settings → Integrations.
 * Without an API key the platform runs in mock mode so every screen works in a demo.
 */
export async function getAi(): Promise<AiConfig> {
  const { value, secrets } = await getIntegration("anthropic");
  const defaultModel = String(value.defaultModel || "claude-opus-5-5");
  const cheapModel = String(value.cheapModel || "claude-haiku-5-5");
  const mode = value.mode === "live" && secrets.apiKey ? "live" : "mock";
  return {
    mode,
    defaultModel,
    cheapModel,
    client: mode === "live" ? new Anthropic({ apiKey: secrets.apiKey }) : null,
  };
}

/** USD per million tokens [input, output]. Used for per-client metering. */
const PRICES: Record<string, [number, number]> = {
  "claude-fable-5-1": [10, 50],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

export function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const [i, o] = PRICES[model] ?? [5, 25];
  // $X per MTok == X micro-dollars per token
  return Math.round(inputTokens * i + outputTokens * o);
}
