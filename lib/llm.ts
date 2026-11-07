// Layer 01: the model. Calls Claude Haiku with prompt caching, runs tools, and tracks cost.

import Anthropic from "@anthropic-ai/sdk";
import { costUsd } from "./pricing";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const MAX_TOOL_ROUNDS = 2;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // 20 s per attempt, 2 retries on rate limits and server errors (the SDK retries those by itself).
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 2 });
  return client;
}

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type Turn = { role: "user" | "assistant"; content: string };
export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** A tool the model may call. `run` returns the text the model sees as the result. */
export type ToolHandler = {
  definition: Anthropic.Tool;
  run: (input: Record<string, unknown>) => Promise<string>;
};

export type LlmResult = {
  text: string;
  refused: boolean;
  toolCalls: { name: string; input: Record<string, unknown>; result: string }[];
  usage: Usage;
  costUsd: number;
};

export async function askClaude(system: string, turns: Turn[], tools: ToolHandler[] = []): Promise<LlmResult> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY is not set");

  const messages: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const toolCalls: LlmResult["toolCalls"] = [];
  const byName = new Map(tools.map((t) => [t.definition.name, t]));

  for (let round = 0; ; round++) {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      // The system prompt is the same for every question to this company:
      // marking it for caching makes repeat reads ~10x cheaper than normal input.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      ...(tools.length ? { tools: tools.map((t) => t.definition) } : {}),
    });

    usage.input += res.usage.input_tokens ?? 0;
    usage.output += res.usage.output_tokens ?? 0;
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || uses.length === 0 || round >= MAX_TOOL_ROUNDS) {
      return {
        text,
        // Haiku can stop with "refusal" when its safety checks trigger; we then fall back to the handoff text.
        refused: res.stop_reason === "refusal" || text.length === 0,
        toolCalls,
        usage,
        costUsd: costUsd(usage),
      };
    }

    // Run each requested tool and send the results back so the model can write its reply.
    messages.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of uses) {
      const handler = byName.get(use.name);
      const input = (use.input ?? {}) as Record<string, unknown>;
      let result: string;
      try {
        result = handler ? await handler.run(input) : `Unknown tool ${use.name}`;
      } catch (e) {
        console.error("tool failed", use.name, e);
        result = "The tool failed. Tell the customer to call the company instead.";
      }
      toolCalls.push({ name: use.name, input, result });
      results.push({ type: "tool_result", tool_use_id: use.id, content: result });
    }
    messages.push({ role: "user", content: results });
  }
}
