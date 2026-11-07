// Text matching that works for Georgian written in Georgian letters AND in Latin letters.
//
// People in Georgia often type "ra girs ekranis gamocvla?" instead of "რა ღირს ეკრანის გამოცვლა?".
// To match both, every text is turned into the same simple Latin "sound key" before comparing.
// Letters that people mix up when typing in Latin (თ/ტ, ქ/კ/ყ, ფ/პ, ჩ/ჭ, ც/წ, გ/ღ) share one key.

const GEO_TO_KEY: Record<string, string> = {
  ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i", კ: "k",
  ლ: "l", მ: "m", ნ: "n", ო: "o", პ: "p", ჟ: "j", რ: "r", ს: "s", ტ: "t", უ: "u",
  ფ: "p", ქ: "k", ღ: "g", ყ: "k", შ: "sh", ჩ: "ch", ც: "c", ძ: "dz", წ: "c", ჭ: "ch",
  ხ: "x", ჯ: "j", ჰ: "h",
};

// Common ways to write Georgian sounds with Latin letters, mapped to the same keys as above.
const LATIN_RULES: [RegExp, string][] = [
  [/kh/g, "x"],
  [/gh/g, "g"], // ღ is typed "gh" or just "g"
  [/zh/g, "j"],
  [/tch/g, "ch"],
  [/ts/g, "c"],
  [/w/g, "c"], // "w" is often used for წ
  [/[qy]/g, "k"], // "q" is usually ქ, "y" is usually ყ; both share the k key
  [/f/g, "p"],
];

/** Lowercase, Georgian → Latin key, strip punctuation, collapse spaces. */
export function soundKey(input: string): string {
  let s = input.toLowerCase().normalize("NFC");
  // Mtavruli (Georgian capitals, U+1C90–U+1CBF) → Mkhedruli
  s = s.replace(/[Ა-Ჿ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x1c90 + 0x10d0));
  s = Array.from(s)
    .map((c) => GEO_TO_KEY[c] ?? c)
    .join("");
  for (const [re, to] of LATIN_RULES) s = s.replace(re, to);
  s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

/** Letter triples of each word, e.g. "ekrani" → " ek", "ekr", "kra", ... */
export function trigrams(key: string): Set<string> {
  const grams = new Set<string>();
  for (const word of key.split(" ")) {
    if (!word) continue;
    const w = `  ${word} `;
    for (let i = 0; i < w.length - 2; i++) grams.add(w.slice(i, i + 3));
  }
  return grams;
}

/** How alike two texts are, from 0 (nothing shared) to 1 (same). Dice coefficient on trigrams. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/** Share of the query's trigrams found in the document. Good for "does this chunk talk about it". */
export function coverage(query: Set<string>, doc: Set<string>): number {
  if (query.size === 0) return 0;
  let shared = 0;
  for (const g of query) if (doc.has(g)) shared++;
  return shared / query.size;
}
