import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { processMessage } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    console.log('WhatsApp Webhook Payload:', JSON.stringify(payload, null, 2));

    // Handle verification for Meta Cloud API (GET) is handled in a separate export if needed
    // But for Baileys/Local Bridge we focus on POST

    const { from, name, text, bot_phone, bot_id } = payload;

    if (!text || !from) {
      return NextResponse.json({ ok: true });
    }

    // 1. Find the bot associated with this message
    let bot;
    if (bot_id) {
      const { data } = await supabaseAdmin.from('bots').select('*').eq('id', bot_id).single();
      bot = data;
    } else {
      const { data } = await supabaseAdmin.from('bots')
        .select('*')
        .eq('whatsapp_phone_number', bot_phone)
        .eq('whatsapp_enabled', true)
        .maybeSingle();
      bot = data;
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

    // 3. Logic based on status (Handoff)
    if (conv.status === 'pending' || (conv.status === 'closed' && bot.stop_ai_after_handoff)) {
      await supabaseAdmin.from('conversations').update({
        history: [...(conv.history || []), { role: 'user', content: text }],
        last_message: text,
        last_message_at: new Date().toISOString(),
      }).eq('id', conv.id);
      
      return NextResponse.json({ ok: true, mode: 'manual' });
    }

    // 4. Process with AI
    // Get knowledge sources for this bot (if implemented)
    const { data: knowledge } = await supabaseAdmin
      .from('knowledge_sources')
      .select('type, name, content')
      .eq('bot_id', bot.id);
    
    const { aiResponse, handoffTriggered } = await processMessage(
      bot.system_prompt,
      conv.history || [],
      text,
      bot.transfer_condition,
      knowledge || []
    );

    // 5. Update history and status
    const newHistory = [
      ...(conv.history || []),
      { role: 'user', content: text },
      { role: 'assistant', content: aiResponse },
    ];

    const updateData: any = {
      history: newHistory,
      last_message: aiResponse,
      last_message_at: new Date().toISOString(),
    };

    if (handoffTriggered) {
      updateData.status = 'pending';
      updateData.handoff_at = new Date().toISOString();
    }

    await supabaseAdmin.from('conversations').update(updateData).eq('id', conv.id);

    // 6. Return response to the bridge
    return NextResponse.json({ 
      ok: true, 
      reply: aiResponse,
      handoff: handoffTriggered 
    });

  } catch (error: any) {
    console.error('WhatsApp Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
