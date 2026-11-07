// Loads a company's settings, ready answers and knowledge, and keeps them in memory for a minute.
// Matching runs in memory: a small business has tens of FAQs and a few hundred chunks at most,
// so this is fast and needs no extra service. See ARCHITECTURE.md for when to move to embeddings.

import { q, type Chunk, type FaqEntry, type Tenant } from "./db";
import { soundKey, trigrams } from "./text";

export type IndexedFaq = FaqEntry & { grams: Set<string>[] };
export type IndexedChunk = Chunk & { stems: Map<string, number>; length: number };

export type TenantBundle = {
  tenant: Tenant;
  faqs: IndexedFaq[];
  chunks: IndexedChunk[];
  avgChunkLength: number;
  totalChars: number;
  loadedAt: number;
};

const TTL_MS = 60_000;
const cache = new Map<string, TenantBundle>();

/** Word stems: the first 5 letters of each word's sound key. Crude, but it handles Georgian endings
 *  well enough: "ეკრანი", "ეკრანის", "ეკრანზე" all become "ekran". */
export function stems(text: string): string[] {
  return soundKey(text)
    .split(" ")
    .filter((w) => w.length >= 3)
    .map((w) => w.slice(0, 5));
}

export async function loadTenant(slug: string, { fresh = false } = {}): Promise<TenantBundle | null> {
  const hit = cache.get(slug);
  if (hit && !fresh && Date.now() - hit.loadedAt < TTL_MS) return hit;

  const [tenant] = await q<Tenant>("SELECT id, slug, name, config FROM tenants WHERE slug = $1", [slug]);
  if (!tenant) return null;

  const faqRows = await q<FaqEntry>(
    "SELECT id, question, phrasings, answer, status, hits FROM faq_entries WHERE tenant_id = $1 AND status = 'ACTIVE'",
    [tenant.id],
  );
  const chunkRows = await q<Chunk>(
    "SELECT id, source, title, content FROM knowledge_chunks WHERE tenant_id = $1 ORDER BY id",
    [tenant.id],
  );

  const faqs = faqRows.map((f) => ({
    ...f,
    grams: [f.question, ...f.phrasings].map((t) => trigrams(soundKey(t))),
  }));

  const chunks = chunkRows.map((c) => {
    const words = stems(`${c.title} ${c.content}`);
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    return { ...c, stems: counts, length: words.length };
  });

  const bundle: TenantBundle = {
    tenant,
    faqs,
    chunks,
    avgChunkLength: chunks.reduce((n, c) => n + c.length, 0) / Math.max(chunks.length, 1),
    totalChars: chunkRows.reduce((n, c) => n + c.title.length + c.content.length, 0),
    loadedAt: Date.now(),
  };
  cache.set(slug, bundle);
  return bundle;
}

export function invalidateTenant(slug: string) {
  cache.delete(slug);
}
