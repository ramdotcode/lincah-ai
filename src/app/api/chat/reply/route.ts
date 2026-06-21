import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const { conversationId, text } = await req.json();

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
      // Send to local Baileys bridge
      await fetch('http://localhost:3001', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
