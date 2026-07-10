import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import { getAuthUser, canAccessConversation } from '@/lib/apiAuth';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversationId, text } = await req.json();

    if (!conversationId || !text?.trim()) {
      return NextResponse.json({ error: 'conversationId and text are required' }, { status: 400 });
    }

    if (!(await canAccessConversation(user.id, conversationId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: conv, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('*, bots(*)')
      .eq('id', conversationId)
      .single();

    if (convError || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Send message based on platform
    if (conv.platform === 'whatsapp') {
      // Send to Baileys bridge (VPS)
      const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3001';
      await fetch(`${bridgeUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: conv.bot_id, // bridge butuh botId untuk lookup sesi WA yang benar
          to: conv.chat_id,
          text: text
        })
      });
    } else {
      // Send to Telegram
      const botToken = (conv as any).bots.telegram_token || process.env.TELEGRAM_BOT_TOKEN;
      await sendTelegramMessage(botToken, conv.chat_id, text);
    }

    // Update history in DB
    const newHistory = [...(conv.history || []), { role: 'assistant', content: text }];
    await supabaseAdmin
      .from('conversations')
      .update({
        history: newHistory,
        status: 'pending', // Keep it in pending or mark as active? Usually human reply keeps it in human control
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
