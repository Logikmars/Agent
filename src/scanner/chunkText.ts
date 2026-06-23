import { CHUNK_OVERLAP, CHUNK_SIZE } from "../safety/limits.js";

export function chunkText(content: string): Array<{ content: string; preview: string; tokenEstimate: number }> {
  const clean = content.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const chunks = [];
  for (let start = 0; start < clean.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    const text = clean.slice(start, start + CHUNK_SIZE);
    chunks.push({
      content: text,
      preview: text.replace(/\s+/g, " ").slice(0, 300),
      tokenEstimate: Math.ceil(text.length / 4)
    });
    if (start + CHUNK_SIZE >= clean.length) break;
  }
  return chunks;
}
