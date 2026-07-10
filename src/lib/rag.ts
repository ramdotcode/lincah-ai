import { supabaseAdmin } from '@/lib/supabase';
import { embedTexts, embedText } from '@/lib/embeddings';
import { chunkText } from '@/lib/chunk';
import { KnowledgeSource } from '@/lib/ai';

export { shouldUseRag } from '@/lib/chunk';

const RAG_MATCH_COUNT = parseInt(process.env.RAG_MATCH_COUNT || '6', 10);

export interface IndexableKnowledgeSource {
  id: string;
  bot_id: string;
  agent_id?: string | null;
  content?: string | null;
}

/**
 * Bangun ulang chunk + embedding untuk satu knowledge source (dipanggil saat
 * knowledge disimpan). Tidak pernah throw — kegagalan hanya berarti source ini
 * belum ter-index dan webhook tetap jalan tanpa RAG.
 */
export async function reindexKnowledgeSource(source: IndexableKnowledgeSource): Promise<void> {
  try {
    // Hapus chunk lama dulu; kalau content kosong, selesai di sini
    await supabaseAdmin.from('knowledge_chunks').delete().eq('knowledge_source_id', source.id);

    const content = source.content?.trim();
    if (!content) return;

    const chunks = chunkText(content);
    if (chunks.length === 0) return;

    const embeddings = await embedTexts(chunks);
    if (!embeddings) return; // NIM tidak tersedia: source tetap terpakai via non-RAG

    const rows = chunks.map((chunk, i) => ({
      knowledge_source_id: source.id,
      bot_id: source.bot_id,
      agent_id: source.agent_id || null,
      chunk_index: i,
      content: chunk,
      embedding: embeddings[i],
    }));

    const { error } = await supabaseAdmin.from('knowledge_chunks').insert(rows);
    if (error) console.error('[RAG] Insert chunks failed:', error);
  } catch (error) {
    console.error('[RAG] Reindex failed:', error);
  }
}

/**
 * Ambil chunk knowledge paling relevan dengan pesan pelanggan.
 * Mengembalikan null saat gagal/kosong — pemanggil pakai knowledge penuh.
 */
export async function retrieveKnowledge(
  botId: string,
  agentId: string | null,
  query: string
): Promise<KnowledgeSource[] | null> {
  try {
    const queryEmbedding = await embedText(query);
    if (!queryEmbedding) return null;

    const { data, error } = await supabaseAdmin.rpc('match_knowledge_chunks', {
      p_bot_id: botId,
      p_agent_id: agentId,
      p_query_embedding: queryEmbedding,
      p_match_count: RAG_MATCH_COUNT,
    });

    if (error) {
      console.error('[RAG] match_knowledge_chunks failed:', error);
      return null;
    }
    if (!data || data.length === 0) return null;

    return data.map((row: any) => ({
      type: row.source_type || 'KNOWLEDGE',
      name: row.source_name || 'Knowledge',
      content: row.content,
    }));
  } catch (error) {
    console.error('[RAG] Retrieve failed:', error);
    return null;
  }
}
