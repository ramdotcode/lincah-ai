import { NextRequest, NextResponse } from 'next/server';
import { processMessage } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser, canAccessConversation } from '@/lib/apiAuth';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversationId } = await req.json();

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 });
    }

    if (!(await canAccessConversation(user.id, conversationId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Get conversation and bot context
    const { data: conv, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('*, bots!bot_id(*)')
      .eq('id', conversationId)
      .single();

    if (convError || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 2. Get knowledge context
    const { data: knowledge } = await supabaseAdmin
      .from('knowledge_sources')
      .select('type, name, content')
      .eq('bot_id', (conv as any).bots.id);
    
    const knowledgeSources = (knowledge || []) as any[];

    // 3. Ask AI for a SUGGESTION (different prompt style)
    const systemPrompt = `
      ${(conv as any).bots.system_prompt}
      
      ### TASK
      You are an AI assistant helping a human agent. 
      Based on the conversation history and the knowledge provided, suggest a perfect response for the human agent to send.
      The suggestion should be professional, accurate, and follow the brand voice.
      Reply ONLY with the suggested message content. No conversational fillers like "Here is a suggestion:".
    `.trim();

    const { aiResponse } = await processMessage(
      systemPrompt,
      conv.history || [],
      "", // No new user message, just processing history
      (conv as any).bots.transfer_condition,
      knowledgeSources,
      (conv as any).bots.ai_model || 'groq'
    );

    return NextResponse.json({ suggestion: aiResponse });

  } catch (error: any) {
    console.error('Suggestion Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
