import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { processMessage } from '@/lib/ai';
import { sendTelegramMessage } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    console.log('Telegram Webhook Payload:', JSON.stringify(payload, null, 2));

    if (!payload.message) {
      return NextResponse.json({ ok: true });
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

    // 4. Fetch Knowledge Sources
    const { data: sources } = await supabaseAdmin
        .from('knowledge_sources')
        .select('type, name, content')
        .eq('bot_id', bot.id);
    
    const knowledgeSources = sources?.filter(s => s.content) || [];

    // 5. Process with AI
    const { aiResponse, handoffTriggered } = await processMessage(
      bot.system_prompt,
      conv.history || [],
      messageText,
      bot.transfer_condition,
      knowledgeSources
    );

    // 5. Update history and status
    const newHistory = [
      ...(conv.history || []),
      { role: 'user', content: messageText },
      { role: 'assistant', content: aiResponse },
    ];

    const updateData: any = {
      history: newHistory,
      last_message_at: new Date().toISOString(),
    };

    if (handoffTriggered) {
      updateData.status = 'pending';
      updateData.handoff_at = new Date().toISOString();
    }

    await supabaseAdmin.from('conversations').update(updateData).eq('id', conv.id);

    // 6. Send response back to Telegram if not silent handoff or if still active
    if (!handoffTriggered || !bot.silent_handoff) {
        await sendTelegramMessage(bot.telegram_token || process.env.TELEGRAM_BOT_TOKEN!, chatId, aiResponse);
    }

    // 7. If handoff triggered, optionally notify owner
    if (handoffTriggered && process.env.OWNER_CHAT_ID) {
      await sendTelegramMessage(
        bot.telegram_token || process.env.TELEGRAM_BOT_TOKEN!, 
        process.env.OWNER_CHAT_ID, 
        `🚨 HANDOFF TRIGGERED for user ${conv.name} (@${conv.username})\n\nMessage: ${messageText}`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
