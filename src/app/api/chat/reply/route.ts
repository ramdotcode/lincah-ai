import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import { getAuthUser, canAccessConversation } from '@/lib/apiAuth';
import { sendWhatsAppViaBridge } from '@/lib/whatsapp';

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
      .select('*, bots!bot_id(*)')
      .eq('id', conversationId)
      .single();

    if (convError || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const ownerBot = conv.bots as { user_id?: string; telegram_token?: string } | null;

    // Send message based on platform
    if (conv.platform === 'whatsapp') {
      // Key sesi baru = user_id pemilik akun; conv.bot_id lama untuk sesi belum migrasi
      await sendWhatsAppViaBridge(
        [ownerBot?.user_id, conv.bot_id],
        conv.chat_id,
        text
      );
    } else {
      // Send to Telegram
      const botToken = ownerBot?.telegram_token || process.env.TELEGRAM_BOT_TOKEN!;
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
