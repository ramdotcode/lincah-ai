import { supabaseAdmin } from '@/lib/supabase';
import { evaluateAssignConditions, evaluateRevertCondition, Message } from '@/lib/ai';
import { logEvent } from '@/lib/eventLog';
import { cached, cacheKeys } from '@/lib/cache';
import { ChildAssignment, ChildBot, currentHolder, findAssignmentByName } from '@/lib/orchestration';

export type { ChildBot } from '@/lib/orchestration';

export interface HandoffContext {
  botId: string;
  conversationId: string;
  channel: 'telegram' | 'whatsapp' | 'webchat';
  history: Message[];
  userMessage: string;
  activeChildBotId: string | null;
  revertCondition: string | null;
}

export interface HandoffResult {
  child: ChildBot | null; // null = parent yang pegang chat
}

// Ambil assignment child + data bot child-nya (cached ~60s: dibaca tiap pesan)
async function fetchAssignments(parentBotId: string): Promise<ChildAssignment[]> {
  return cached(cacheKeys.assignments(parentBotId), async () => {
    const { data: rows } = await supabaseAdmin
      .from('agent_assignments')
      .select('id, child_bot_id, assign_condition')
      .eq('parent_bot_id', parentBotId);
    if (!rows || rows.length === 0) return [];

    const { data: bots } = await supabaseAdmin
      .from('bots')
      .select('id, name, system_prompt, ai_model')
      .in('id', rows.map(r => r.child_bot_id));
    const botById = new Map((bots || []).map(b => [b.id, b]));

    return rows
      .map(r => {
        const child = botById.get(r.child_bot_id);
        return child ? { id: r.id, assign_condition: r.assign_condition, child } : null;
      })
      .filter(Boolean) as ChildAssignment[];
  });
}

// Orchestration parent-child: chat menempel di pemegangnya (sticky) dan hanya
// pindah saat kondisi natural-language terpenuhi. Harus selesai SEBELUM
// processMessage karena prompt/knowledge/model bergantung hasilnya.
// Tidak pernah throw — kegagalan evaluasi = tetap di pemegang sekarang.
export async function resolveHandoff(ctx: HandoffContext): Promise<HandoffResult> {
  try {
    const assignments = await fetchAssignments(ctx.botId);
    const holder = currentHolder(assignments, ctx.activeChildBotId);

    if (assignments.length === 0) return { child: null };

    // Chat dipegang child: yang dicek hanya kondisi balik ke parent.
    // Tanpa kondisi balik, child pegang terus (mengikuti referensi:
    // "No Revert To Parent Condition set").
    if (holder) {
      if (!ctx.revertCondition?.trim()) return { child: holder.child };

      const revert = await evaluateRevertCondition(ctx.revertCondition, ctx.history, ctx.userMessage);
      logHandoff(ctx, revert, {
        check: 'revert_to_parent',
        holder_bot_id: holder.child.id,
        reverted: revert.answer === 'YES',
      });
      if (revert.answer !== 'YES') return { child: holder.child };
      // Balik ke parent — lanjut mengevaluasi kondisi child untuk pesan yang
      // sama, supaya "ganti topik ke divisi lain" tidak butuh satu pesan ekstra.
    }

    const result = await evaluateAssignConditions(
      assignments.map(a => ({ name: a.child.name, condition: a.assign_condition })),
      ctx.history,
      ctx.userMessage
    );
    const chosen = findAssignmentByName(assignments, result.answer);

    logHandoff(ctx, result, {
      check: 'assign_child',
      chosen_bot_id: chosen?.child.id || null,
      chosen_bot_name: chosen?.child.name || null,
      previous_child_bot_id: ctx.activeChildBotId,
      switched: (chosen?.child.id || null) !== ctx.activeChildBotId,
    });

    return { child: chosen?.child || null };
  } catch (error) {
    // Fail safe: pemegang chat tidak berubah, percakapan tetap dijawab
    logEvent({
      bot_id: ctx.botId,
      conversation_id: ctx.conversationId,
      channel: ctx.channel,
      event_type: 'agent_handoff',
      error_message: error instanceof Error ? error.message : String(error),
      metadata: { check: 'error' },
    });
    const assignments = await fetchAssignments(ctx.botId).catch(() => [] as ChildAssignment[]);
    return { child: currentHolder(assignments, ctx.activeChildBotId)?.child || null };
  }
}

function logHandoff(
  ctx: HandoffContext,
  result: { latencyMs: number; promptTokens?: number; completionTokens?: number; errorMessage?: string },
  metadata: Record<string, unknown>
) {
  logEvent({
    bot_id: ctx.botId,
    conversation_id: ctx.conversationId,
    channel: ctx.channel,
    event_type: 'agent_handoff',
    latency_handoff_ms: result.latencyMs,
    prompt_tokens: result.promptTokens,
    completion_tokens: result.completionTokens,
    error_message: result.errorMessage,
    metadata,
  });
}
