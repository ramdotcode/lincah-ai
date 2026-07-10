import { supabaseAdmin } from '@/lib/supabase';
import { classifyAgent, Message } from '@/lib/ai';
import { logEvent } from '@/lib/eventLog';
import { resolveAgent, RoutedAgent } from '@/lib/agentRouting';
import { cached, cacheKeys } from '@/lib/cache';

export type { RoutedAgent } from '@/lib/agentRouting';

export interface AgentRoutingContext {
  botId: string;
  conversationId: string;
  channel: 'telegram' | 'whatsapp' | 'webchat';
  history: Message[];
  userMessage: string;
  activeAgentId: string | null;
}

// Router multi-agent (Fase C). Berbeda dengan stage classification, ini harus
// selesai SEBELUM processMessage karena system prompt utama bergantung hasilnya.
// Tidak pernah throw — kegagalan jatuh ke agent aktif/default via resolveAgent.
export async function routeAgent(ctx: AgentRoutingContext): Promise<RoutedAgent | null> {
  try {
    // Cached ~60s (Fase E1): daftar agent dibaca tiap pesan masuk
    const agents = await cached(cacheKeys.agents(ctx.botId), async () => {
      const { data } = await supabaseAdmin
        .from('agents')
        .select('id, name, description, system_prompt, is_default, active')
        .eq('bot_id', ctx.botId)
        .eq('active', true);
      return data || [];
    });

    if (!agents || agents.length === 0) return null;

    // Satu agent aktif: tidak perlu memanggil router
    if (agents.length === 1) return agents[0];

    const result = await classifyAgent(agents, ctx.history, ctx.userMessage);

    const chosen = resolveAgent({
      agents,
      classifiedName: result.agentName,
      activeAgentId: ctx.activeAgentId,
    });

    logEvent({
      bot_id: ctx.botId,
      conversation_id: ctx.conversationId,
      channel: ctx.channel,
      event_type: 'agent_routed',
      latency_handoff_ms: result.latencyMs,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      error_message: result.errorMessage,
      metadata: {
        classified_agent: result.agentName,
        chosen_agent_id: chosen?.id || null,
        chosen_agent_name: chosen?.name || null,
        previous_agent_id: ctx.activeAgentId,
        switched: !!chosen && chosen.id !== ctx.activeAgentId,
      },
    });

    return chosen;
  } catch (error) {
    // Fail silent: cukup catat, percakapan tetap dijawab dengan prompt bot
    logEvent({
      bot_id: ctx.botId,
      conversation_id: ctx.conversationId,
      channel: ctx.channel,
      event_type: 'agent_routed',
      error_message: error instanceof Error ? error.message : String(error),
      metadata: { chosen_agent_id: null },
    });
    return null;
  }
}
