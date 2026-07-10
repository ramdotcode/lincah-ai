import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser, getOwnedBotIds } from '@/lib/apiAuth';
import { isAdmin } from '@/lib/roles';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Admin melihat statistik global; owner hanya bot miliknya
    let botIds: string[] | null = null;
    if (!(await isAdmin(user.id))) {
      botIds = await getOwnedBotIds(user.id);
      if (botIds.length === 0) {
        return NextResponse.json({ totalLeads: 0, pendingHandoffs: 0, aiResponses: 0, activeSessions: 0 });
      }
    }

    const scoped = () => {
      let q = supabaseAdmin.from('conversations').select('*', { count: 'exact', head: true });
      if (botIds) q = q.in('bot_id', botIds);
      return q;
    };

    const { count: totalLeads } = await scoped();
    const { count: pendingHandoffs } = await scoped().eq('status', 'pending');

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
