import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from '@/lib/supabase';
import { processMessage } from '@/lib/ai';
import { sendTelegramMessage } from '@/lib/telegram';
import { logEvent } from '@/lib/eventLog';
import { checkRateLimit, RATE_LIMIT_REPLY } from '@/lib/rateLimit';
import { runStageClassification } from '@/lib/stageClassifier';
import { resolveHandoff, ChildBot } from '@/lib/orchestrator';
import { fetchBotTools, ToolContext } from '@/lib/tools';
import { cached, cacheKeys } from '@/lib/cache';
import { shouldUseRag, retrieveKnowledge } from '@/lib/rag';

export async function POST(req: NextRequest) {
  try {
    // Verify webhook origin: Telegram echoes back the secret_token registered via setWebhook
    if (process.env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = req.headers.get('x-telegram-bot-api-secret-token');
      if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = await req.json();
    console.log('Telegram Webhook Payload:', JSON.stringify(payload, null, 2));

    if (!payload.message) {
      return NextResponse.json({ ok: true });
    }

    // DEV-ONLY: test error handling by setting SENTRY_TEST=true in env
    if (process.env.SENTRY_TEST === 'true' && payload.message.text?.includes('TEST_SENTRY_ERROR')) {
      throw new Error('Intentional test error for Sentry integration');
    }

    const { chat, text, from } = payload.message;
    const chatId = chat.id.toString();
    const messageText = text || '';

    // 1. Find the bot associated with the token (in a real app, you might have multiple bots)
    // For this demo, we'll assume there's at least one bot or use the one from env
    const { data: bot, error: botError } = await supabaseAdmin
      .from('bots')
      .select('*')
      .limit(1)
      .single();

    if (botError || !bot) {
      console.error('Bot not found:', botError);
      return NextResponse.json({ error: 'Bot settings not configured' }, { status: 400 });
    }

    // 2. Get or create conversation
    let { data: conv, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('bot_id', bot.id)
      .eq('chat_id', chatId)
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
          chat_id: chatId,
          name: from.first_name + (from.last_name ? ` ${from.last_name}` : ''),
          username: from.username,
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
      // If pending (human agent taking over) or closed with stop AI flag, don't respond
      // But maybe update history
      await supabaseAdmin.from('conversations').update({
        history: [...(conv.history || []), { role: 'user', content: messageText }],
        last_message_at: new Date().toISOString(),
      }).eq('id', conv.id);

      return NextResponse.json({ ok: true });
    }

    // 3.5 Rate limiting: keep the message in history but skip AI processing.
    // Always return 200 — a 429 would make Telegram retry and worsen the flood.
    const rateLimit = await checkRateLimit('telegram', chatId, bot.id);
    if (rateLimit.limited) {
      await supabaseAdmin.from('conversations').update({
        history: [...(conv.history || []), { role: 'user', content: messageText }],
        last_message_at: new Date().toISOString(),
      }).eq('id', conv.id);

      logEvent({
        bot_id: bot.id,
        conversation_id: conv.id,
        channel: 'telegram',
        event_type: 'rate_limited',
        metadata: { reason: rateLimit.reason, sender_id: chatId },
      });

      if (rateLimit.shouldNotify) {
        await sendTelegramMessage(bot.telegram_token || process.env.TELEGRAM_BOT_TOKEN!, chatId, RATE_LIMIT_REPLY);
      }

      return NextResponse.json({ ok: true });
    }

    // 4. Fetch Knowledge Sources (cached ~60s, Fase E1)
    const sources = await cached(cacheKeys.knowledge(bot.id), async () => {
      const { data } = await supabaseAdmin
        .from('knowledge_sources')
        .select('type, name, content')
        .eq('bot_id', bot.id);
      return data || [];
    });

    let knowledgeSources: any[] = sources?.filter((s: any) => s.content) || [];

    // 4.5 Stage classification (Fase A4): parallel with the main AI call,
    // awaited only after the reply is sent so it never delays the customer
    const stagePromise = runStageClassification({
      botId: bot.id,
      conversationId: conv.id,
      channel: 'telegram',
      history: conv.history || [],
      userMessage: messageText,
      currentStage: conv.stage,
      stageUpdatedBy: conv.stage_updated_by,
      stageUpdatedAt: conv.stage_updated_at,
    });

    // 4.6 Orchestration (parent-child handoff): must finish BEFORE the main AI
    // call because the holding bot determines prompt, knowledge, and model
    let systemPrompt = bot.system_prompt;
    let aiModel = bot.ai_model || 'groq';
    let answeringBotId: string = bot.id;
    let activeChild: ChildBot | null = null;
    if (bot.orchestration_enabled) {
      const handoff = await resolveHandoff({
        botId: bot.id,
        conversationId: conv.id,
        channel: 'telegram',
        history: conv.history || [],
        userMessage: messageText,
        activeChildBotId: conv.active_child_bot_id || null,
        revertCondition: bot.revert_to_parent_condition || null,
      });

      const child = handoff.child;
      if (child) {
        activeChild = child;
        answeringBotId = child.id;
        if (child.system_prompt) systemPrompt = child.system_prompt;
        if (child.ai_model) aiModel = child.ai_model;
        // Chat dipegang child → pakai knowledge milik bot child
        const childSources = await cached(cacheKeys.knowledge(child.id), async () => {
          const { data } = await supabaseAdmin
            .from('knowledge_sources')
            .select('type, name, content')
            .eq('bot_id', child.id);
          return data || [];
        });
        knowledgeSources = childSources?.filter((s: { content: string | null }) => s.content) || [];
      }
    }

    // 4.65 RAG (Fase E2): knowledge gemuk → ambil hanya chunk paling relevan.
    // Fail-open: retrieval gagal/kosong → tetap pakai knowledge penuh.
    if (shouldUseRag(knowledgeSources)) {
      const relevant = await retrieveKnowledge(answeringBotId, null, messageText);
      if (relevant?.length) knowledgeSources = relevant;
    }

    // 4.7 Tool use (Fase D): AI bisa cek stok/ongkir & catat pesanan
    let toolContext: ToolContext | undefined;
    if (bot.tools_enabled) {
      const tools = await fetchBotTools(bot.id);
      if (tools.length > 0) {
        toolContext = { botId: bot.id, conversationId: conv.id, customerContact: chatId, tools };
      }
    }

    // 5. Process with AI (now returns latency & token metrics)
    const aiResult = await processMessage(
      systemPrompt,
      conv.history || [],
      messageText,
      bot.transfer_condition,
      knowledgeSources,
      aiModel,
      toolContext
    );

    // Log event to observability (fire-and-forget)
    logEvent({
      bot_id: bot.id,
      conversation_id: conv.id,
      channel: 'telegram',
      event_type: 'message_processed',
      latency_main_ms: aiResult.latencyMainMs,
      latency_handoff_ms: aiResult.latencyHandoffMs,
      prompt_tokens: aiResult.promptTokens,
      completion_tokens: aiResult.completionTokens,
      handoff_result: aiResult.handoffTriggered,
      metadata: {
        ai_model: aiModel,
        model_used: aiResult.modelUsed,
        used_fallback: aiResult.usedFallback || false,
        child_bot_id: activeChild?.id || null,
        child_bot_name: activeChild?.name || null,
        tool_calls: aiResult.toolCallsMade || 0,
      },
    });

    if (aiResult.errorMessage) {
      logEvent({
        bot_id: bot.id,
        conversation_id: conv.id,
        channel: 'telegram',
        event_type: 'ai_error',
        error_message: aiResult.errorMessage,
        metadata: { ai_model: bot.ai_model || 'groq' },
      });
    }

    // 6. Update history and status
    const newHistory = [
      ...(conv.history || []),
      { role: 'user', content: messageText },
      { role: 'assistant', content: aiResult.aiResponse },
    ];

    const updateData: any = {
      history: newHistory,
      last_message_at: new Date().toISOString(),
    };

    if (bot.orchestration_enabled && (activeChild?.id || null) !== (conv.active_child_bot_id || null)) {
      updateData.active_child_bot_id = activeChild?.id || null;
    }

    if (aiResult.handoffTriggered) {
      updateData.status = 'pending';
      updateData.handoff_at = new Date().toISOString();
    }

    await supabaseAdmin.from('conversations').update(updateData).eq('id', conv.id);

    // 7. Send response back to Telegram if not silent handoff or if still active
    if (!aiResult.handoffTriggered || !bot.silent_handoff) {
        await sendTelegramMessage(bot.telegram_token || process.env.TELEGRAM_BOT_TOKEN!, chatId, aiResult.aiResponse);
    }

    // 8. If handoff triggered, optionally notify owner
    if (aiResult.handoffTriggered && process.env.OWNER_CHAT_ID) {
      await sendTelegramMessage(
        bot.telegram_token || process.env.TELEGRAM_BOT_TOKEN!,
        process.env.OWNER_CHAT_ID,
        `🚨 HANDOFF TRIGGERED for user ${conv.name} (@${conv.username})\n\nMessage: ${messageText}`
      );
    }

    // 9. Make sure classification finished before the serverless function freezes
    await stagePromise;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Telegram Webhook Error:', error);

    // Extract bot_id from context if available (may be undefined if error before bot fetch)
    let botId = undefined;
    try {
      const payload = await req.json().catch(() => ({}));
      const chatId = payload.message?.chat?.id?.toString();
      if (chatId) {
        const { data: bot } = await supabaseAdmin
          .from('bots')
          .select('id')
          .limit(1)
          .single();
        botId = bot?.id;
      }
    } catch (_) {
      // ignore if we can't extract bot_id
    }

    Sentry.captureException(error, {
      tags: {
        bot_id: botId || 'unknown',
        channel: 'telegram',
      },
      contexts: {
        webhook: {
          type: 'telegram',
        },
      },
    });

    // Always return 200 to prevent webhook retry storms
    return NextResponse.json({ ok: true });
  }
}
