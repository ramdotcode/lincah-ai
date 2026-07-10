if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server to protect API keys.');
}

// Embedding via NVIDIA NIM (Fase E2). Model default baai/bge-m3 (1024 dimensi),
// sama dengan dimensi kolom knowledge_chunks.embedding.
// Fail-open: kegagalan mengembalikan null, pemanggil jatuh ke non-RAG.

const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'baai/bge-m3';
const EMBEDDING_TIMEOUT_MS = 15000;

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!process.env.NVIDIA_NIM_API_KEY || texts.length === 0) return null;

  const baseUrl = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NVIDIA_NIM_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        encoding_format: 'float',
      }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => '');
      console.error(`[Embeddings] NIM error ${response.status}: ${error.slice(0, 200)}`);
      return null;
    }

    const json = await response.json();
    const embeddings: number[][] = (json.data || [])
      .sort((a: any, b: any) => a.index - b.index)
      .map((d: any) => d.embedding);

    if (embeddings.length !== texts.length) {
      console.error('[Embeddings] Result count mismatch');
      return null;
    }
    return embeddings;
  } catch (error) {
    console.error('[Embeddings] Request failed:', error);
    return null;
  }
}

export async function embedText(text: string): Promise<number[] | null> {
  const result = await embedTexts([text]);
  return result?.[0] || null;
}
