import { supabaseAdmin } from '@/lib/supabase';
import { classifyLeadStage, Message } from '@/lib/ai';
import { logEvent } from '@/lib/eventLog';
import { shouldAdvanceStage } from '@/lib/stage';

export interface StageClassificationContext {
  botId: string;
  conversationId: string;
  channel: 'telegram' | 'whatsapp';
  history: Message[];
  userMessage: string;
  currentStage: string | null;
  stageUpdatedBy: string | null;
  stageUpdatedAt: string | null;
}

// Klasifikasi stage otomatis (Fase A4). Dipanggil paralel dengan AI utama dari webhook.
// Tidak pernah throw — kegagalan tidak boleh mengganggu balasan ke pelanggan.
export async function runStageClassification(ctx: StageClassificationContext): Promise<void> {
  try {
    const result = await classifyLeadStage(ctx.history, ctx.userMessage);

    const advance = shouldAdvanceStage({
      currentStage: ctx.currentStage,
      proposedStage: result.stage,
      stageUpdatedBy: ctx.stageUpdatedBy,
      stageUpdatedAt: ctx.stageUpdatedAt,
      // Pesan yang sedang diproses adalah pesan pelanggan terbaru
      lastCustomerMessageAt: new Date().toISOString(),
    });

    if (advance && result.stage) {
      // stage_updated_at diisi otomatis oleh trigger DB
      await supabaseAdmin
        .from('conversations')
        .update({ stage: result.stage, stage_updated_by: 'ai' })
        .eq('id', ctx.conversationId);
    }

    logEvent({
      bot_id: ctx.botId,
      conversation_id: ctx.conversationId,
      channel: ctx.channel,
      event_type: 'stage_classified',
      latency_handoff_ms: result.latencyMs,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      error_message: result.errorMessage,
      metadata: {
        proposed_stage: result.stage,
        previous_stage: ctx.currentStage || 'new',
        applied: advance && !!result.stage,
      },
    });
  } catch (error) {
    // Fail silent: cukup catat, jangan ganggu alur webhook
    logEvent({
      bot_id: ctx.botId,
      conversation_id: ctx.conversationId,
      channel: ctx.channel,
      event_type: 'stage_classified',
      error_message: error instanceof Error ? error.message : String(error),
      metadata: { applied: false },
    });
  }
}
