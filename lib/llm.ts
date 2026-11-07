// Layer 01: the model. One call to Claude Haiku with prompt caching and cost tracking.

import Anthropic from "@anthropic-ai/sdk";
import { costUsd } from "./pricing";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type Turn = { role: "user" | "assistant"; content: string };

export type LlmResult = {
  text: string;
  refused: boolean;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUsd: number;
};

export async function askClaude(system: string, turns: Turn[]): Promise<LlmResult> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    // The system prompt is the same for every question to this company:
    // marking it for caching makes repeat reads ~10x cheaper than normal input.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: turns,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const usage = {
    input: res.usage.input_tokens ?? 0,
    output: res.usage.output_tokens ?? 0,
    cacheRead: res.usage.cache_read_input_tokens ?? 0,
    cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
  };

  return {
    text,
    // Haiku can stop with "refusal" when its safety checks trigger; we then fall back to the handoff text.
    refused: res.stop_reason === "refusal" || text.length === 0,
    usage,
    costUsd: costUsd(usage),
  };
}
