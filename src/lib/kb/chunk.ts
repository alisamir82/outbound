/**
 * Splits text into ~target-sized chunks on paragraph boundaries with overlap.
 * Sizes are in characters (~4 chars per token): 3000 chars ≈ 750 tokens.
 */
export function chunkText(text: string, opts: { target?: number; overlap?: number } = {}): { text: string; heading: string | null }[] {
  const target = opts.target ?? 3000;
  const overlap = opts.overlap ?? 300;
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: { text: string; heading: string | null }[] = [];
  let buf = "";
  let heading: string | null = null;

  const flush = () => {
    if (buf.trim().length) out.push({ text: buf.trim(), heading });
    buf = buf.slice(Math.max(0, buf.length - overlap));
  };

  for (const p of paragraphs) {
    if (p.length < 80 && !/[.!?]$/.test(p)) heading = p; // short line without terminal punctuation: treat as heading
    if (p.length > target) {
      // hard-split very long paragraphs on sentence boundaries
      for (const sentence of p.split(/(?<=[.!?])\s+/)) {
        if (buf.length + sentence.length > target) flush();
        buf += (buf ? " " : "") + sentence;
      }
      continue;
    }
    if (buf.length + p.length + 2 > target) flush();
    buf += (buf ? "\n\n" : "") + p;
  }
  if (buf.trim().length) out.push({ text: buf.trim(), heading });
  return out;
}
