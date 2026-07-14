import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from '@/lib/supabase';
import { processMessage } from '@/lib/ai';
import { logEvent } from '@/lib/eventLog';
import { checkRateLimit, RATE_LIMIT_REPLY } from '@/lib/rateLimit';
import { runStageClassification } from '@/lib/stageClassifier';
import { runLabelClassification } from '@/lib/labelClassifier';
import { resolveHandoff, ChildBot } from '@/lib/orchestrator';
import { fetchBotTools, ToolContext } from '@/lib/tools';
import { cached, cacheKeys } from '@/lib/cache';
import { shouldUseRag, retrieveKnowledge } from '@/lib/rag';
import { findConnectionBySessionKey, findConnectionByPhone } from '@/lib/whatsapp';
import { ensureContactForConversation } from '@/lib/contacts';

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

    // 1. Resolve koneksi WA level akun (key sesi worker = user_id, atau bot_id
    //    lama untuk sesi yang belum di-rename) → bot penjawab. Kalau tidak ada
    //    koneksi, jatuh ke lookup legacy via kolom bots.whatsapp_*.
    const connection = bot_id
      ? await findConnectionBySessionKey(bot_id)
      : bot_phone
        ? await findConnectionByPhone(bot_phone)
        : null;

    if (connection && !connection.enabled) {
      // Integrasi WA akun ini sedang dimatikan — jangan balas apa pun
      return NextResponse.json({ ok: true });
    }

    let bot;
    if (connection) {
      bot = await cached(cacheKeys.botById(connection.bot_id), async () => {
        const { data } = await supabaseAdmin.from('bots').select('*').eq('id', connection.bot_id).single();
        return data;
      });
    } else if (bot_id) {
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
          platform: 'whatsapp',
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

    // 2.5 CRM: pastikan percakapan tertaut ke kontak akun (hanya saat belum ter-link)
    if (!conv.contact_id && bot.user_id) {
      const contactId = await ensureContactForConversation(conv.id, {
        userId: bot.user_id,
        platform: 'whatsapp',
        externalId: from,
        name: name || null,
        phone: from,
      });
      if (contactId) conv.contact_id = contactId;
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
        .select('type, name, content')
        .eq('bot_id', bot.id);
      return data || [];
    });

    let knowledgeSources: any[] = sources?.filter((s: any) => s.content) || [];

    // 4.5 Stage classification (Fase A4): parallel with the main AI call —
    // Groq 8B finishes well before the main model, so awaiting it later adds ~0ms
    const stagePromise = runStageClassification({
      userId: bot.user_id,
      botId: bot.id,
      conversationId: conv.id,
      channel: 'whatsapp',
      history: conv.history || [],
      userMessage: text,
      currentStage: conv.stage,
      stageUpdatedBy: conv.stage_updated_by,
      stageUpdatedAt: conv.stage_updated_at,
    });

    // 4.55 AI auto-label (CRM Fase 4): paralel, tidak menunda balasan
    const labelPromise = bot.user_id
      ? runLabelClassification({
          userId: bot.user_id,
          botId: bot.id,
          conversationId: conv.id,
          channel: 'whatsapp',
          history: conv.history || [],
          userMessage: text,
        })
      : Promise.resolve();

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
        channel: 'whatsapp',
        history: conv.history || [],
        userMessage: text,
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
      const relevant = await retrieveKnowledge(answeringBotId, null, text);
      if (relevant?.length) knowledgeSources = relevant;
    }

    // 4.7 Tool use (Fase D): AI bisa cek stok/ongkir & catat pesanan
    let toolContext: ToolContext | undefined;
    if (bot.tools_enabled) {
      const tools = await fetchBotTools(bot.id);
      if (tools.length > 0) {
        toolContext = { botId: bot.id, conversationId: conv.id, customerContact: from, contactId: conv.contact_id ?? null, tools };
      }
    }

    // 5. Process with AI (now returns latency & token metrics)
    const aiResult = await processMessage(
      systemPrompt,
      conv.history || [],
      text,
      bot.transfer_condition,
      knowledgeSources,
      aiModel,
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

    if (bot.orchestration_enabled && (activeChild?.id || null) !== (conv.active_child_bot_id || null)) {
      updateData.active_child_bot_id = activeChild?.id || null;
    }

    if (aiResult.handoffTriggered) {
      updateData.status = 'pending';
      updateData.handoff_at = new Date().toISOString();
    }

    await supabaseAdmin.from('conversations').update(updateData).eq('id', conv.id);

    // 7. Make sure classification finished (started in parallel, effectively done by now)
    await Promise.all([stagePromise, labelPromise]);

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
