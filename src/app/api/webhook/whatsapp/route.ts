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

export async function POST(req: NextRequest) {
  try {
    // Verify webhook origin: the bridge sends a shared token header
    if (process.env.BRIDGE_SHARED_TOKEN) {
      const token = req.headers.get('x-bridge-token');
      if (token !== process.env.BRIDGE_SHARED_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = await req.json();
    console.log('WhatsApp Webhook Payload:', JSON.stringify(payload, null, 2));

    // Handle verification for Meta Cloud API (GET) is handled in a separate export if needed
    // But for Baileys/Local Bridge we focus on POST

    const { from, name, text, bot_phone, bot_id } = payload;

    // DEV-ONLY: test error handling by setting SENTRY_TEST=true in env
    if (process.env.SENTRY_TEST === 'true' && text?.includes('TEST_SENTRY_ERROR')) {
      throw new Error('Intentional test error for Sentry integration');
    }

    if (!text || !from) {
      return NextResponse.json({ ok: true });
    }

    // 1. Find the bot associated with this message (cached ~60s, Fase E1)
    let bot;
    if (bot_id) {
      bot = await cached(cacheKeys.botById(bot_id), async () => {
        const { data } = await supabaseAdmin.from('bots').select('*').eq('id', bot_id).single();
        return data;
      });
    } else {
      bot = await cached(cacheKeys.botByPhone(bot_phone), async () => {
        const { data } = await supabaseAdmin.from('bots')
          .select('*')
          .eq('whatsapp_phone_number', bot_phone)
          .eq('whatsapp_enabled', true)
          .maybeSingle();
        return data;
      });
    }

    if (!bot) {
      console.error('Bot not found for incoming message:', { bot_id, bot_phone });
      return NextResponse.json({ error: 'Bot settings not configured' }, { status: 400 });
    }

    // 2. Get or create conversation
    let { data: conv, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('bot_id', bot.id)
      .eq('chat_id', from)
      .single();

    if (convError && convError.code !== 'PGRST116') {
      console.error('Conversation fetch error:', convError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!conv) {
      const { data: newConv, error: createError } = await supabaseAdmin
        .from('conversations')
        .insert({
          bot_id: bot.id,
          chat_id: from,
          name: name || from,
          history: [],
          status: 'active',
        })
        .select()
        .single();

      if (createError) {
        console.error('Conversation create error:', createError);
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
      }
      conv = newConv;
    }

    // 3. Logic based on status
    if (conv.status === 'pending' || (conv.status === 'closed' && bot.stop_ai_after_handoff)) {
      await supabaseAdmin.from('conversations').update({
        history: [...(conv.history || []), { role: 'user', content: text }],
        last_message_at: new Date().toISOString(),
      }).eq('id', conv.id);
      return NextResponse.json({ ok: true });
    }

    // 3.5 Rate limiting: keep the message in history but skip AI processing.
    // Always return 200 — an error status would make the bridge retry and worsen the flood.
    const rateLimit = await checkRateLimit('whatsapp', from, bot.id);
    if (rateLimit.limited) {
      await supabaseAdmin.from('conversations').update({
        history: [...(conv.history || []), { role: 'user', content: text }],
        last_message_at: new Date().toISOString(),
      }).eq('id', conv.id);

      logEvent({
        bot_id: bot.id,
        conversation_id: conv.id,
        channel: 'whatsapp',
        event_type: 'rate_limited',
        metadata: { reason: rateLimit.reason, sender_id: from },
      });

      // Reply only once per window; otherwise stay silent
      if (rateLimit.shouldNotify) {
        return NextResponse.json({ reply: RATE_LIMIT_REPLY });
      }
      return NextResponse.json({ ok: true });
    }

    // 4. Fetch Knowledge Sources (cached ~60s, Fase E1)
    const sources = await cached(cacheKeys.knowledge(bot.id), async () => {
      const { data } = await supabaseAdmin
        .from('knowledge_sources')
        .select('type, name, content, agent_id')
        .eq('bot_id', bot.id);
      return data || [];
    });

    let knowledgeSources = sources?.filter((s: any) => s.content) || [];

    // 4.5 Stage classification (Fase A4): parallel with the main AI call —
    // Groq 8B finishes well before the main model, so awaiting it later adds ~0ms
    const stagePromise = runStageClassification({
      botId: bot.id,
      conversationId: conv.id,
      channel: 'whatsapp',
      history: conv.history || [],
      userMessage: text,
      currentStage: conv.stage,
      stageUpdatedBy: conv.stage_updated_by,
      stageUpdatedAt: conv.stage_updated_at,
    });

    // 4.6 Multi-agent routing (Fase C): must finish BEFORE the main AI call
    // because the chosen agent determines the system prompt & knowledge scope
    let systemPrompt = bot.system_prompt;
    let routedAgent: RoutedAgent | null = null;
    if (bot.multi_agent_enabled) {
      routedAgent = await routeAgent({
        botId: bot.id,
        conversationId: conv.id,
        channel: 'whatsapp',
        history: conv.history || [],
        userMessage: text,
        activeAgentId: conv.active_agent_id || null,
      });

      if (routedAgent) {
        if (routedAgent.system_prompt) systemPrompt = routedAgent.system_prompt;
        // Shared knowledge (agent_id null) + knowledge scoped to the chosen agent
        knowledgeSources = knowledgeSources.filter(
          s => !s.agent_id || s.agent_id === routedAgent!.id
        );
      }
    }

    // 4.7 Tool use (Fase D): AI bisa cek stok/ongkir & catat pesanan
    let toolContext: ToolContext | undefined;
    if (bot.tools_enabled) {
      const tools = await fetchBotTools(bot.id);
      if (tools.length > 0) {
        toolContext = { botId: bot.id, conversationId: conv.id, customerContact: from, tools };
      }
    }

    // 5. Process with AI (now returns latency & token metrics)
    const aiResult = await processMessage(
      systemPrompt,
      conv.history || [],
      text,
      bot.transfer_condition,
      knowledgeSources,
      bot.ai_model || "groq",
      toolContext
    );

    // Log event to observability (fire-and-forget)
    logEvent({
      bot_id: bot.id,
      conversation_id: conv.id,
      channel: 'whatsapp',
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
        channel: 'whatsapp',
        event_type: 'ai_error',
        error_message: aiResult.errorMessage,
        metadata: { ai_model: bot.ai_model || 'groq' },
      });
    }

    // 6. Update history and status
    const newHistory = [
      ...(conv.history || []),
      { role: 'user', content: text },
      { role: 'assistant', content: aiResult.aiResponse },
    ];

    const updateData: any = {
      history: newHistory,
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

    // 7. Make sure classification finished (started in parallel, effectively done by now)
    await stagePromise;

    // 8. Return reply to bridge (which will send via WhatsApp)
    return NextResponse.json({ reply: aiResult.aiResponse });
  } catch (error: any) {
    console.error('WhatsApp Webhook Error:', error);

    let botId = undefined;
    try {
      const payload = await req.json().catch(() => ({}));
      botId = payload.bot_id;
    } catch (_) {
      // ignore
    }

    Sentry.captureException(error, {
      tags: {
        bot_id: botId || 'unknown',
        channel: 'whatsapp',
      },
      contexts: {
        webhook: {
          type: 'whatsapp',
        },
      },
    });

    // Always return 200 to prevent webhook retry storms
    return NextResponse.json({ ok: true });
  }
}

// Meta Verification Helper
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode && token) {
    if (mode === 'subscribe') {
        // We'll verify against a general env var or just return challenge for now
        // since the user is using Baileys, this is just for future proofing
        return new Response(challenge, { status: 200 });
    }
  }
  return new Response('Verification failed', { status: 403 });
}
