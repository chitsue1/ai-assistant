// Step 1 and step 2 of answering: ready answers (free) and finding relevant knowledge (for the AI).

import type { IndexedChunk, IndexedFaq, TenantBundle } from "./knowledge";
import { stems } from "./knowledge";
import { similarity, soundKey, trigrams } from "./text";

export type FaqMatch = { faq: IndexedFaq; score: number; runnerUp: number };

/** A question that also looks a lot like a SECOND ready answer, and not much less than the first,
 *  is probably two questions in one ("where are you and are you open on Sunday?").
 *  One template can't answer both, so the AI does. */
const SECOND_TOPIC_SCORE = 0.4;
const MIN_LEAD = 0.35;

/** Best ready answer for the question, if one is close enough and clearly the only topic. */
export function matchFaq(bundle: TenantBundle, question: string, threshold: number): FaqMatch | null {
  const key = soundKey(question);
  if (key.replace(/\s/g, "").length < 4) return null; // "ok", "?" and the like go to the AI
  const qGrams = trigrams(key);

  const perFaq = bundle.faqs
    .map((faq) => ({ faq, score: Math.max(...faq.grams.map((g) => similarity(qGrams, g))) }))
    .sort((a, b) => b.score - a.score);

  const [best, second] = perFaq;
  if (!best || best.score < threshold) return null;
  const runnerUp = second?.score ?? 0;
  if (runnerUp >= SECOND_TOPIC_SCORE && best.score - runnerUp < MIN_LEAD) return null;
  return { ...best, runnerUp };
}

/** Ranks knowledge chunks for the question with BM25, the classic search-engine formula. */
export function retrieve(bundle: TenantBundle, question: string, topK = 4): IndexedChunk[] {
  const terms = Array.from(new Set(stems(question)));
  if (terms.length === 0 || bundle.chunks.length === 0) return [];

  const N = bundle.chunks.length;
  const k1 = 1.2;
  const b = 0.75;
  const df = new Map<string, number>();
  for (const t of terms) df.set(t, bundle.chunks.filter((c) => c.stems.has(t)).length);

  const scored = bundle.chunks.map((c) => {
    let score = 0;
    for (const t of terms) {
      const tf = c.stems.get(t) ?? 0;
      if (!tf) continue;
      const idf = Math.log(1 + (N - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * c.length) / bundle.avgChunkLength));
    }
    return { c, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.c);
}
