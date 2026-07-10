import { supabaseAdmin } from './supabase';

export interface EventLogPayload {
  bot_id: string;
  conversation_id?: string;
  channel: 'telegram' | 'whatsapp';
  event_type: 'message_processed' | 'ai_error' | 'webhook_error' | 'handoff' | 'rate_limited' | 'stage_classified' | 'followup_sent' | 'followup_failed' | 'agent_routed';
  latency_main_ms?: number;
  latency_handoff_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  handoff_result?: boolean;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

export async function logEvent(payload: EventLogPayload): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('event_logs').insert({
      bot_id: payload.bot_id,
      conversation_id: payload.conversation_id,
      channel: payload.channel,
      event_type: payload.event_type,
      latency_main_ms: payload.latency_main_ms,
      latency_handoff_ms: payload.latency_handoff_ms,
      prompt_tokens: payload.prompt_tokens,
      completion_tokens: payload.completion_tokens,
      handoff_result: payload.handoff_result,
      error_message: payload.error_message,
      metadata: payload.metadata || {},
    });

    if (error) {
      console.error('[EventLog] Failed to log event:', error);
    }
  } catch (err) {
    // Fire-and-forget: never fail the main operation
    console.error('[EventLog] Exception while logging:', err);
  }
}
