// Cuts a markdown or text file into small, self-contained pieces ("chunks").
// Each "## " section becomes one chunk; very long sections are split by paragraph.

export type RawChunk = { title: string; content: string };

const MAX_CHARS = 1500;

export function chunkMarkdown(text: string, fallbackTitle: string): RawChunk[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let docTitle = fallbackTitle;
  let current: { title: string; lines: string[] } | null = null;
  const sections: { title: string; lines: string[] }[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      docTitle = line.slice(2).trim();
      continue;
    }
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { title: `${docTitle}: ${line.slice(3).trim()}`, lines: [] };
      continue;
    }
    current ??= { title: docTitle, lines: [] };
    current.lines.push(line);
  }
  if (current) sections.push(current);

  const chunks: RawChunk[] = [];
  for (const s of sections) {
    const body = s.lines.join("\n").trim();
    if (!body) continue;
    if (body.length <= MAX_CHARS) {
      chunks.push({ title: s.title, content: body });
      continue;
    }
    let buf = "";
    for (const para of body.split(/\n{2,}/)) {
      if (buf && buf.length + para.length > MAX_CHARS) {
        chunks.push({ title: s.title, content: buf.trim() });
        buf = "";
      }
      buf += para + "\n\n";
    }
    if (buf.trim()) chunks.push({ title: s.title, content: buf.trim() });
  }
  return chunks;
}
