import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { count: totalLeads } = await supabaseAdmin.from('conversations').select('*', { count: 'exact', head: true });
    const { count: pendingHandoffs } = await supabaseAdmin.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    
    // We can count AI responses from history, but for now simple counts
    return NextResponse.json({
      totalLeads: totalLeads || 0,
      pendingHandoffs: pendingHandoffs || 0,
      aiResponses: 0, // Placeholder or deeper query
      activeSessions: totalLeads || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
