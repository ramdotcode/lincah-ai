import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser, getOwnedBotIds } from '@/lib/apiAuth';
import { isAdmin } from '@/lib/roles';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let query = supabaseAdmin
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false });

    // Admin melihat semua; owner hanya percakapan milik bot-nya
    if (!(await isAdmin(user.id))) {
      const botIds = await getOwnedBotIds(user.id);
      if (botIds.length === 0) return NextResponse.json([]);
      query = query.in('bot_id', botIds);
    }

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
