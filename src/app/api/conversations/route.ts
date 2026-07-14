import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser, getOwnedBotIds } from '@/lib/apiAuth';
import { isAdmin } from '@/lib/roles';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminView = await isAdmin(user.id);
    let botIds: string[] = [];
    if (!adminView) {
      botIds = await getOwnedBotIds(user.id);
      if (botIds.length === 0) return NextResponse.json([]);
    }

    const buildQuery = (select: string) => {
      let q = supabaseAdmin
        .from('conversations')
        .select(select)
        .order('last_message_at', { ascending: false });
      if (!adminView) q = q.in('bot_id', botIds);
      return q;
    };

    // Coba embed labels; fail-open ke select polos kalau migrasi 0020 belum jalan
    let { data, error } = await buildQuery('*, conversation_labels(labels(id, name, color))');
    if (error) {
      ({ data, error } = await buildQuery('*'));
      if (error) throw error;
    }

    // Ratakan embed label jadi conversations[].labels = [{id, name, color}]
    const flattened = (data || []).map((row: any) => {
      const { conversation_labels, ...conv } = row;
      return {
        ...conv,
        labels: (conversation_labels || [])
          .map((cl: any) => cl.labels)
          .filter(Boolean),
      };
    });

    return NextResponse.json(flattened);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
