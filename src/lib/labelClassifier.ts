// AI auto-label (CRM Fase 4) — dipanggil paralel dengan AI utama dari webhook,
// pola sama dengan runStageClassification: tidak pernah throw, hanya MENAMBAH
// label (tidak pernah melepas), menghormati batas 5 label per percakapan.

import { supabaseAdmin } from '@/lib/supabase';
import { classifyLabels, Message } from '@/lib/ai';
import { logEvent } from '@/lib/eventLog';
import { cached, cacheKeys } from '@/lib/cache';

const MAX_LABELS_PER_CONVERSATION = 5;

export interface LabelClassificationContext {
  userId: string; // pemilik akun (bot.user_id)
  botId: string;
  conversationId: string;
  channel: 'telegram' | 'whatsapp' | 'webchat';
  history: Message[];
  userMessage: string;
}

interface AiLabel {
  id: string;
  name: string;
}

// Label akun yang di-set ai_enabled (cached ~60s, di-invalidate route /api/labels)
async function fetchAiLabels(userId: string): Promise<AiLabel[]> {
  return cached(cacheKeys.aiLabels(userId), async () => {
    const { data, error } = await supabaseAdmin
      .from('labels')
      .select('id, name')
      .eq('user_id', userId)
      .eq('ai_enabled', true);
    // Sebelum migrasi 0021, kolom ai_enabled belum ada → fail-open ke []
    if (error) return [];
    return (data as AiLabel[]) || [];
  });
}

export async function runLabelClassification(ctx: LabelClassificationContext): Promise<void> {
  try {
    const aiLabels = await fetchAiLabels(ctx.userId);
    if (aiLabels.length === 0) return;

    // Label yang sudah terpasang: jangan diklasifikasi ulang & hitung sisa slot
    const { data: existing } = await supabaseAdmin
      .from('conversation_labels')
      .select('label_id')
      .eq('conversation_id', ctx.conversationId);
    const appliedIds = new Set((existing || []).map(r => r.label_id));
    const remainingSlots = MAX_LABELS_PER_CONVERSATION - appliedIds.size;
    if (remainingSlots <= 0) return;

    const candidates = aiLabels.filter(l => !appliedIds.has(l.id));
    if (candidates.length === 0) return;

    const result = await classifyLabels(ctx.history, ctx.userMessage, candidates);
    const toApply = result.labelIds.slice(0, remainingSlots);

    if (toApply.length > 0) {
      // upsert ignoreDuplicates: aman terhadap race dengan pemasangan manual
      await supabaseAdmin
        .from('conversation_labels')
        .upsert(
          toApply.map(label_id => ({ conversation_id: ctx.conversationId, label_id })),
          { onConflict: 'conversation_id,label_id', ignoreDuplicates: true }
        );
    }

    logEvent({
      bot_id: ctx.botId,
      conversation_id: ctx.conversationId,
      channel: ctx.channel,
      event_type: 'labels_classified',
      latency_handoff_ms: result.latencyMs,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      error_message: result.errorMessage,
      metadata: {
        candidates: candidates.length,
        applied: toApply.length,
      },
    });
  } catch (error) {
    // Fail silent: cukup catat, jangan ganggu alur webhook
    logEvent({
      bot_id: ctx.botId,
      conversation_id: ctx.conversationId,
      channel: ctx.channel,
      event_type: 'labels_classified',
      error_message: error instanceof Error ? error.message : String(error),
      metadata: { applied: 0 },
    });
  }
}
