import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from '@/lib/supabase';
import { processMessage } from '@/lib/ai';
import { logEvent } from '@/lib/eventLog';
import { checkRateLimit, RATE_LIMIT_REPLY } from '@/lib/rateLimit';
import { runStageClassification } from '@/lib/stageClassifier';
import { routeAgent, RoutedAgent } from '@/lib/agentRouter';
import { fetchBotTools, ToolContext } from '@/lib/tools';
import { cached, cacheKeys } from '@/lib/cache';
import { shouldUseRag, retrieveKnowledge } from '@/lib/rag';

// CORS: widget di-embed di domain pelanggan, jadi endpoint ini harus publik
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Info bot untuk header widget (nama + welcome message)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const botId = searchParams.get('botId');
  if (!botId) {
    return NextResponse.json({ error: 'botId required' }, { status: 400, headers: CORS_HEADERS });
  }

  const bot = await cached(cacheKeys.botById(botId), async () => {
    const { data } = await supabaseAdmin.from('bots').select('*').eq('id', botId).maybeSingle();
    return data;
  });

  if (!bot || !bot.widget_enabled) {
    return NextResponse.json({ error: 'Widget not available' }, { status: 404, headers: CORS_HEADERS });
  }

  return NextResponse.json(
    { name: bot.name, welcome_message: bot.welcome_message || null },
    { headers: CORS_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { botId, sessionId, message, visitorName } = await req.json();

    if (!botId || !sessionId || !message?.trim()) {
      return NextResponse.json(
        { error: 'botId, sessionId, and message are required' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    // sessionId dibuat client (UUID) — batasi bentuknya agar chat_id tetap rapi
    if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(sessionId)) {
      return NextResponse.json({ error: 'invalid sessionId' }, { status: 400, headers: CORS_HEADERS });
    }
    const text = String(message).slice(0, 2000);
    const chatId = `web:${sessionId}`;

    // 1. Bot harus ada dan widget aktif
    const bot = await cached(cacheKeys.botById(botId), async () => {
      const { data } = await supabaseAdmin.from('bots').select('*').eq('id', botId).maybeSingle();
      return data;
    });
    if (!bot || !bot.widget_enabled) {
      return NextResponse.json({ error: 'Widget not available' }, { status: 404, headers: CORS_HEADERS });
    }

    // 2. Get or create conversation
    let { data: conv, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('bot_id', bot.id)
      .eq('chat_id', chatId)
      .single();

    if (convError && convError.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Database error' }, { status: 500, headers: CORS_HEADERS });
    }

    if (!conv) {
      const { data: newConv, error: createError } = await supabaseAdmin
        .from('conversations')
        .insert({
          bot_id: bot.id,
          chat_id: chatId,
          name: (typeof visitorName === 'string' && visitorName.trim().slice(0, 60)) || 'Web Visitor',
          platform: 'webchat',
          history: [],
          status: 'active',
        })
        .select()
        .single();
      if (createError) {
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500, headers: CORS_HEADERS });
      }
      conv = newConv;
    }

    // 3. Handoff/closed: simpan pesan, AI diam (pengunjung menunggu balasan manusia)
    if (conv.status === 'pending' || (conv.status === 'closed' && bot.stop_ai_after_handoff)) {
      await supabaseAdmin.from('conversations').update({
        history: [...(conv.history || []), { role: 'user', content: text }],
        last_message_at: new Date().toISOString(),
      }).eq('id', conv.id);
      return NextResponse.json({ reply: null, status: conv.status }, { headers: CORS_HEADERS });
    }

    // 3.5 Rate limit per session + per bot
    const rateLimit = await checkRateLimit('webchat', sessionId, bot.id);
    if (rateLimit.limited) {
      logEvent({
        bot_id: bot.id,
        conversation_id: conv.id,
        channel: 'webchat',
        event_type: 'rate_limited',
        metadata: { reason: rateLimit.reason, sender_id: sessionId },
      });
      return NextResponse.json({ reply: RATE_LIMIT_REPLY }, { headers: CORS_HEADERS });
    }

    // 4. Knowledge (cached)
    const sources = await cached(cacheKeys.knowledge(bot.id), async () => {
      const { data } = await supabaseAdmin
        .from('knowledge_sources')
        .select('type, name, content, agent_id')
        .eq('bot_id', bot.id);
      return data || [];
    });
    let knowledgeSources: any[] = sources?.filter((s: any) => s.content) || [];

    // 4.5 Stage classification paralel
    const stagePromise = runStageClassification({
      botId: bot.id,
      conversationId: conv.id,
      channel: 'webchat',
      history: conv.history || [],
      userMessage: text,
      currentStage: conv.stage,
      stageUpdatedBy: conv.stage_updated_by,
      stageUpdatedAt: conv.stage_updated_at,
    });

    // 4.6 Multi-agent routing
    let systemPrompt = bot.system_prompt;
    let routedAgent: RoutedAgent | null = null;
    if (bot.multi_agent_enabled) {
      routedAgent = await routeAgent({
        botId: bot.id,
        conversationId: conv.id,
        channel: 'webchat',
        history: conv.history || [],
        userMessage: text,
        activeAgentId: conv.active_agent_id || null,
      });
      if (routedAgent) {
        if (routedAgent.system_prompt) systemPrompt = routedAgent.system_prompt;
        knowledgeSources = knowledgeSources.filter(
          s => !s.agent_id || s.agent_id === routedAgent!.id
        );
      }
    }

    // 4.65 RAG
    if (shouldUseRag(knowledgeSources)) {
      const relevant = await retrieveKnowledge(bot.id, routedAgent?.id || null, text);
      if (relevant?.length) knowledgeSources = relevant;
    }

    // 4.7 Tools
    let toolContext: ToolContext | undefined;
    if (bot.tools_enabled) {
      const tools = await fetchBotTools(bot.id);
      if (tools.length > 0) {
        toolContext = { botId: bot.id, conversationId: conv.id, customerContact: chatId, tools };
      }
    }

    // 5. AI
    const aiResult = await processMessage(
      systemPrompt,
      conv.history || [],
      text,
      bot.transfer_condition,
      knowledgeSources,
      bot.ai_model || 'groq',
      toolContext
    );

    logEvent({
      bot_id: bot.id,
      conversation_id: conv.id,
      channel: 'webchat',
      event_type: 'message_processed',
      latency_main_ms: aiResult.latencyMainMs,
      latency_handoff_ms: aiResult.latencyHandoffMs,
      prompt_tokens: aiResult.promptTokens,
      completion_tokens: aiResult.completionTokens,
      handoff_result: aiResult.handoffTriggered,
      metadata: {
        ai_model: bot.ai_model || 'groq',
        model_used: aiResult.modelUsed,
        used_fallback: aiResult.usedFallback || false,
        agent_id: routedAgent?.id || null,
        agent_name: routedAgent?.name || null,
        tool_calls: aiResult.toolCallsMade || 0,
      },
    });

    if (aiResult.errorMessage) {
      logEvent({
        bot_id: bot.id,
        conversation_id: conv.id,
        channel: 'webchat',
        event_type: 'ai_error',
        error_message: aiResult.errorMessage,
        metadata: { ai_model: bot.ai_model || 'groq' },
      });
    }

    // 6. Update history & status
    const updateData: any = {
      history: [
        ...(conv.history || []),
        { role: 'user', content: text },
        { role: 'assistant', content: aiResult.aiResponse },
      ],
      last_message_at: new Date().toISOString(),
    };
    if (routedAgent && routedAgent.id !== conv.active_agent_id) {
      updateData.active_agent_id = routedAgent.id;
    }
    if (aiResult.handoffTriggered) {
      updateData.status = 'pending';
      updateData.handoff_at = new Date().toISOString();
    }
    await supabaseAdmin.from('conversations').update(updateData).eq('id', conv.id);

    await stagePromise;

    return NextResponse.json(
      {
        reply: !aiResult.handoffTriggered || !bot.silent_handoff ? aiResult.aiResponse : null,
        handoff: aiResult.handoffTriggered,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error('Widget Chat Error:', error);
    Sentry.captureException(error, { tags: { channel: 'webchat' } });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
