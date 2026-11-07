// Checks the free "ready answer" step without calling the AI.
// Each case says whether it SHOULD be answered from a template or sent to Haiku.
// Usage: npm run test:router -- [company-slug]

import "./_env";
import { pool } from "../lib/db";
import { loadTenant } from "../lib/knowledge";
import { matchFaq, retrieve } from "../lib/match";

const THRESHOLD = Number(process.env.FAQ_MATCH_THRESHOLD ?? 0.62);

const cases: { q: string; expect: "FAQ" | "AI" }[] = [
  { q: "სად მდებარეობთ?", expect: "FAQ" },
  { q: "sad mdebareobt?", expect: "FAQ" },
  { q: "მისამართი მითხარით", expect: "FAQ" },
  { q: "შაბათს მუშაობთ?", expect: "FAQ" },
  { q: "shabats mushaobt?", expect: "FAQ" },
  { q: "გარანტია გაქვთ?", expect: "FAQ" },
  { q: "garantia gaqvt?", expect: "FAQ" },
  { q: "ბარათით გადახდა შეიძლება?", expect: "FAQ" },
  { q: "კურიერი გყავთ?", expect: "FAQ" },
  { q: "წინასწარ უნდა ჩავეწერო?", expect: "FAQ" },
  { q: "რა ღირს iPhone 13-ის ეკრანის გამოცვლა?", expect: "AI" },
  { q: "ra girs samsung-is batarea?", expect: "AI" },
  { q: "ტელეფონი წყალში ჩამივარდა, რა ვქნა?", expect: "AI" },
  { q: "სად ხართ და კვირას მუშაობთ?", expect: "AI" },
  { q: "ლეპტოპი ძალიან ცხელდება", expect: "AI" },
  { q: "გამარჯობა", expect: "AI" },
  { q: "რამდენ ხანში შემიკეთებთ ეკრანს?", expect: "FAQ" },
  { q: "ra girs diagnostika?", expect: "FAQ" },
];

async function main() {
  const slug = process.argv[2] ?? "fixlab-demo";
  const bundle = await loadTenant(slug);
  if (!bundle) throw new Error(`No company ${slug}. Run npm run seed first.`);

  let pass = 0;
  for (const c of cases) {
    const hit = matchFaq(bundle, c.q, THRESHOLD);
    const got = hit ? "FAQ" : "AI";
    const ok = got === c.expect;
    if (ok) pass++;
    const detail = hit
      ? `→ "${hit.faq.question}" (${hit.score.toFixed(2)})`
      : `→ docs: ${retrieve(bundle, c.q, 2).map((x) => x.title).join(" | ") || "none"}`;
    console.log(`${ok ? "✓" : "✗"} ${got.padEnd(3)} ${c.q}  ${detail}`);
  }
  console.log(`\n${pass}/${cases.length} routed as expected (threshold ${THRESHOLD})`);
  await pool.end();
  if (pass !== cases.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
