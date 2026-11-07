// Loads a company into the assistant from a folder:
//   <folder>/tenant.json      name, slug and settings
//   <folder>/faq.json         ready answers (optional)
//   <folder>/knowledge/*.md   everything the assistant should know (.md or .txt)
//
// Usage: npm run ingest -- data/demo
// Running it again replaces that company's knowledge and its ACTIVE answers. Approved candidates are kept.

import "./_env";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pool, q } from "../lib/db";
import { chunkMarkdown } from "../lib/chunk";

type FaqInput = { question: string; phrasings?: string[]; answer: string };

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Usage: npm run ingest -- <folder>");

  const tenantFile = JSON.parse(readFileSync(join(dir, "tenant.json"), "utf8"));
  const [tenant] = await q<{ id: number }>(
    `INSERT INTO tenants (slug, name, config) VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, config = EXCLUDED.config
     RETURNING id`,
    [tenantFile.slug, tenantFile.name, tenantFile.config],
  );
  console.log(`company: ${tenantFile.name} (/${tenantFile.slug})`);

  const kDir = join(dir, "knowledge");
  await q("DELETE FROM knowledge_chunks WHERE tenant_id = $1", [tenant.id]);
  let chunkCount = 0;
  let charCount = 0;
  for (const file of readdirSync(kDir).filter((f) => /\.(md|txt)$/.test(f)).sort()) {
    const text = readFileSync(join(kDir, file), "utf8");
    for (const c of chunkMarkdown(text, basename(file).replace(/\.\w+$/, ""))) {
      await q("INSERT INTO knowledge_chunks (tenant_id, source, title, content) VALUES ($1, $2, $3, $4)", [
        tenant.id,
        file,
        c.title,
        c.content,
      ]);
      chunkCount++;
      charCount += c.title.length + c.content.length;
    }
  }
  console.log(`knowledge: ${chunkCount} chunks, ${charCount} characters`);

  const faqPath = join(dir, "faq.json");
  if (existsSync(faqPath)) {
    const faqs: FaqInput[] = JSON.parse(readFileSync(faqPath, "utf8"));
    await q("DELETE FROM faq_entries WHERE tenant_id = $1 AND status = 'ACTIVE' AND hits = 0", [tenant.id]);
    for (const f of faqs) {
      const [existing] = await q("SELECT id FROM faq_entries WHERE tenant_id = $1 AND question = $2", [
        tenant.id,
        f.question,
      ]);
      if (existing) {
        await q("UPDATE faq_entries SET phrasings = $2, answer = $3, status = 'ACTIVE', updated_at = now() WHERE id = $1", [
          existing.id,
          f.phrasings ?? [],
          f.answer,
        ]);
      } else {
        await q("INSERT INTO faq_entries (tenant_id, question, phrasings, answer) VALUES ($1, $2, $3, $4)", [
          tenant.id,
          f.question,
          f.phrasings ?? [],
          f.answer,
        ]);
      }
    }
    console.log(`ready answers: ${faqs.length}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
