// Pemotongan teks untuk RAG (Fase E2) — pure function tanpa I/O agar mudah dites.

export const CHUNK_MAX_CHARS = 800;
export const CHUNK_OVERLAP_CHARS = 100;

// Total karakter knowledge di bawah ambang ini → kirim semua knowledge seperti
// biasa (RAG hanya menguntungkan saat knowledge gemuk).
export const RAG_MIN_KNOWLEDGE_CHARS = parseInt(
  process.env.RAG_MIN_KNOWLEDGE_CHARS || '6000',
  10
);

export function totalKnowledgeChars(sources: { content?: string | null }[]): number {
  return sources.reduce((sum, s) => sum + (s.content?.length || 0), 0);
}

export function shouldUseRag(sources: { content?: string | null }[]): boolean {
  return totalKnowledgeChars(sources) > RAG_MIN_KNOWLEDGE_CHARS;
}

/**
 * Potong teks menjadi chunk ±maxChars dengan overlap antar chunk.
 * Berusaha memotong di batas paragraf/kalimat terdekat agar konteks utuh.
 */
export function chunkText(
  text: string,
  maxChars: number = CHUNK_MAX_CHARS,
  overlap: number = CHUNK_OVERLAP_CHARS
): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);

    if (end < clean.length) {
      // Cari pemotong alami di paruh kedua window: paragraf > newline > kalimat > spasi
      const window = clean.slice(start, end);
      const half = Math.floor(maxChars / 2);
      const breakers = ['\n\n', '\n', '. ', ' '];
      for (const breaker of breakers) {
        const idx = window.lastIndexOf(breaker);
        if (idx > half) {
          end = start + idx + breaker.length;
          break;
        }
      }
    }

    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);

    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
