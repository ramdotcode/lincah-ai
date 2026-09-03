import { NextRequest, NextResponse } from 'next/server';
import { processMessage } from '@/lib/ai';
import { shouldForceHandoff } from '@/lib/replyLimit';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import { logEvent } from '@/lib/eventLog';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { botId, systemPrompt, history, message, transferCondition, aiModel } = await req.json();

    // Fetch Knowledge Sources
    let knowledgeSources: any[] = [];
    if (botId) {
        const { data: sources } = await supabaseAdmin
            .from('knowledge_sources')
            .select('type, name, content')
            .eq('bot_id', botId);
        
        if (sources) {
            knowledgeSources = sources.filter(s => s.content);
        }
    }

    // Batas balasan AI (bots.max_ai_replies) ikut berlaku di Playground supaya
    // perilakunya bisa diuji persis seperti di WhatsApp. Welcome message di
    // history ditandai `welcome: true` oleh UI, jadi tidak ikut dihitung.
    let maxAiReplies: number | null = null;
    if (botId) {
      const { data: botRow } = await supabaseAdmin
        .from('bots')
        .select('max_ai_replies')
        .eq('id', botId)
        .maybeSingle();
      maxAiReplies = botRow?.max_ai_replies ?? null;
    }
    const forceHandoff = shouldForceHandoff(history || [], maxAiReplies);

    const result = await processMessage(
      systemPrompt,
      history || [],
      message,
      transferCondition || '',
      knowledgeSources,
      aiModel || 'groq',
      undefined,
      { forceHandoff }
    );

    // Catat sesi Playground ke event_logs juga (fire-and-forget) supaya token
    // & model yang menjawab ikut muncul di admin/usage saat tes fallback.
    if (botId) {
      logEvent({
        bot_id: botId,
        channel: 'playground',
        event_type: 'message_processed',
        latency_main_ms: result.latencyMainMs,
        latency_handoff_ms: result.latencyHandoffMs,
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        handoff_result: result.handoffTriggered,
        metadata: {
          ai_model: aiModel || 'groq',
          model_used: result.modelUsed,
          used_fallback: result.usedFallback || false,
          playground: true,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('AI Test Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
