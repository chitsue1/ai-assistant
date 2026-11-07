// The whole answering flow in one place:
//   guard → ready answer (free) → find knowledge → Claude Haiku → log → learn new ready answers

import { randomUUID } from "node:crypto";
import { q } from "./db";
import { loadTenant, type TenantBundle } from "./knowledge";
import { aiEnabled, askClaude, type Turn } from "./llm";
import { matchFaq, retrieve } from "./match";
import { buildSystemPrompt, useFullContext, wrapWithContext } from "./prompt";
import { similarity, soundKey, trigrams } from "./text";

const FAQ_THRESHOLD = Number(process.env.FAQ_MATCH_THRESHOLD ?? 0.62);
const MAX_MESSAGE_CHARS = 800;
const MAX_MESSAGES_PER_CONVERSATION = 40;
const HISTORY_TURNS = 6;

export type Route = "FAQ" | "LLM" | "GUARD" | "DEMO";

export type ChatResult = {
  conversationId: string;
  reply: string;
  route: Route;
  debug: {
    faqScore?: number;
    faqQuestion?: string;
    contextMode?: "full" | "retrieval";
    sources?: string[];
    tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number };
    costUsd?: number;
    latencyMs: number;
  };
};

export class NotFoundError extends Error {}

export async function answer(slug: string, rawMessage: string, conversationId?: string): Promise<ChatResult> {
  const started = Date.now();
  const bundle = await loadTenant(slug);
  if (!bundle) throw new NotFoundError(`Unknown assistant: ${slug}`);
  const { tenant } = bundle;

  const message = rawMessage.trim();
  const convId = await ensureConversation(tenant.id, conversationId);
  const history = await q<{ role: "user" | "assistant"; content: string }>(
    "SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT $2",
    [convId, MAX_MESSAGES_PER_CONVERSATION],
  );

  // ---- Guard: cheap checks before anything costs money --------------------------------------
  if (message.length > MAX_MESSAGE_CHARS || history.length >= MAX_MESSAGES_PER_CONVERSATION) {
    const reply =
      message.length > MAX_MESSAGE_CHARS
        ? "შეტყობინება ძალიან გრძელია. გთხოვთ, კითხვა მოკლედ დაწეროთ."
        : tenant.config.handoff;
    await saveTurn(convId, message, reply, { route: "GUARD", latencyMs: Date.now() - started });
    return { conversationId: convId, reply, route: "GUARD", debug: { latencyMs: Date.now() - started } };
  }

  // ---- Step 1: ready answer. Free and instant. -----------------------------------------------
  // A follow-up like "და ეგ რა ღირს?" only makes sense with the earlier messages, so it goes to the AI.
  const isFollowUp = history.length > 0 && refersBack(message);
  const hit = isFollowUp ? null : matchFaq(bundle, message, FAQ_THRESHOLD);
  if (hit) {
    await q("UPDATE faq_entries SET hits = hits + 1 WHERE id = $1", [hit.faq.id]);
    await saveTurn(convId, message, hit.faq.answer, {
      route: "FAQ",
      faqId: hit.faq.id,
      matchScore: hit.score,
      latencyMs: Date.now() - started,
    });
    return {
      conversationId: convId,
      reply: hit.faq.answer,
      route: "FAQ",
      debug: { faqScore: round(hit.score), faqQuestion: hit.faq.question, latencyMs: Date.now() - started },
    };
  }

  // ---- Step 2: pick the knowledge the model will see ----------------------------------------
  const full = useFullContext(bundle);
  const chunks = full ? [] : retrieve(bundle, message);
  const sources = full ? ["მთელი ცოდნის ბაზა"] : chunks.map((c) => c.title);

  // ---- No API key: demo mode shows what would happen ----------------------------------------
  if (!aiEnabled()) {
    const reply =
      "[დემო რეჟიმი: AI გამორთულია] ამ კითხვაზე მზა პასუხი არ მოიძებნა, ამიტომ ის Claude Haiku-ს გადაეცემოდა. " +
      `მოდელი მიიღებდა: ${sources.join(", ") || "ცოდნის ბაზაში შესაბამისი ნაწილი ვერ მოიძებნა"}.`;
    await saveTurn(convId, message, reply, { route: "DEMO", latencyMs: Date.now() - started });
    return {
      conversationId: convId,
      reply,
      route: "DEMO",
      debug: { contextMode: full ? "full" : "retrieval", sources, latencyMs: Date.now() - started },
    };
  }

  // ---- Step 3: ask Claude Haiku ---------------------------------------------------------------
  const turns: Turn[] = history
    .slice(0, HISTORY_TURNS)
    .reverse()
    .map((m) => ({ role: m.role, content: m.content }));
  turns.push({ role: "user", content: full ? message : wrapWithContext(message, chunks) });

  const result = await askClaude(buildSystemPrompt(bundle), turns);
  const reply = result.refused ? tenant.config.handoff : result.text;
  const latencyMs = Date.now() - started;

  await saveTurn(convId, message, reply, {
    route: "LLM",
    tokens: result.usage,
    costUsd: result.costUsd,
    latencyMs,
  });

  // ---- Step 4: learn. A first question answered well becomes a suggested ready answer. --------
  if (history.length === 0 && !result.refused && reply !== tenant.config.handoff) {
    await suggestFaq(bundle, message, reply);
  }

  return {
    conversationId: convId,
    reply,
    route: "LLM",
    debug: {
      contextMode: full ? "full" : "retrieval",
      sources,
      tokens: result.usage,
      costUsd: result.costUsd,
      latencyMs,
    },
  };
}

async function ensureConversation(tenantId: number, id?: string): Promise<string> {
  if (id) {
    const [row] = await q("SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
    if (row) return id;
  }
  const newId = randomUUID();
  await q("INSERT INTO conversations (id, tenant_id) VALUES ($1, $2)", [newId, tenantId]);
  return newId;
}

type Meta = {
  route: Route;
  faqId?: number;
  matchScore?: number;
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUsd?: number;
  latencyMs: number;
};

async function saveTurn(convId: string, userText: string, reply: string, m: Meta) {
  await q("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)", [convId, userText]);
  await q(
    `INSERT INTO messages (conversation_id, role, content, route, faq_id, match_score,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, latency_ms)
     VALUES ($1, 'assistant', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      convId,
      reply,
      m.route,
      m.faqId ?? null,
      m.matchScore ?? null,
      m.tokens?.input ?? null,
      m.tokens?.output ?? null,
      m.tokens?.cacheRead ?? null,
      m.tokens?.cacheWrite ?? null,
      m.costUsd ?? (m.route === "LLM" ? null : 0),
      m.latencyMs,
    ],
  );
}

/** Saves an AI answer as a CANDIDATE ready answer. A person approves it in /admin before it is used,
 *  so a wrong AI answer can never spread to other customers on its own. */
async function suggestFaq(bundle: TenantBundle, question: string, reply: string) {
  const candidates = await q<{ id: number; question: string; phrasings: string[] }>(
    "SELECT id, question, phrasings FROM faq_entries WHERE tenant_id = $1 AND status = 'CANDIDATE'",
    [bundle.tenant.id],
  );
  const qGrams = trigrams(soundKey(question));
  const same = candidates.find((c) =>
    [c.question, ...c.phrasings].some((t) => similarity(qGrams, trigrams(soundKey(t))) >= FAQ_THRESHOLD),
  );
  if (same) {
    await q(
      `UPDATE faq_entries SET hits = hits + 1, updated_at = now(),
         phrasings = CASE WHEN $2 = ANY(phrasings) OR question = $2 THEN phrasings ELSE array_append(phrasings, $2) END
       WHERE id = $1`,
      [same.id, question],
    );
  } else {
    await q(
      "INSERT INTO faq_entries (tenant_id, question, answer, status, hits) VALUES ($1, $2, $3, 'CANDIDATE', 1)",
      [bundle.tenant.id, question, reply],
    );
  }
}

// Words that point back to something said earlier: "ეგ", "მაგის", "იგივე", "და ...?" (also typed in Latin).
const BACK_REFERENCES = new Set(["eg", "egi", "egac", "mag", "magis", "magaze", "mas", "imis", "amis", "amaze", "es", "igive", "isic", "esec"]);

function refersBack(message: string): boolean {
  const words = soundKey(message).split(" ");
  return words[0] === "da" || words.some((w) => BACK_REFERENCES.has(w));
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
