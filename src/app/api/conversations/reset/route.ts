import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser, canAccessConversation } from '@/lib/apiAuth';

// Restart percakapan: kosongkan history supaya AI mulai dari nol lagi
// (dipakai untuk tes ulang alur bot pada satu kontak, tanpa ganggu chat lain).
// `resetCrm` juga mengembalikan jejak CRM percakapan itu: stage, label, order,
// ticket, follow-up, dan field kontak yang diisi AI.
//
// Tidak menghapus: kontak itu sendiri (biar chat berikutnya tetap ter-link),
// nama/telepon kontak, dan event_logs (jejak audit untuk debugging).

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, resetCrm = true } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }
    if (!(await canAccessConversation(user.id, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id, contact_id')
      .eq('id', id)
      .maybeSingle();

    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 1. Reset percakapan: history kosong, kembali ke mode AI, lepas handoff
    const convReset: Record<string, any> = {
      history: [],
      status: 'active',
      last_message: null,
      last_message_at: null,
      handoff_at: null,
      active_agent_id: null,
      active_child_bot_id: null,
    };
    if (resetCrm) {
      convReset.stage = 'new';
      convReset.stage_updated_by = null;
      convReset.deal_value = null;
    }

    const { error: convError } = await supabaseAdmin
      .from('conversations')
      .update(convReset)
      .eq('id', id);

    if (convError) {
      console.error('Conversation reset error:', convError);
      return NextResponse.json({ error: 'Failed to reset conversation' }, { status: 500 });
    }

    // 2. Tabel turunan. Fail-soft per tabel: tabel yang belum ada (migrasi
    // belum jalan) tidak boleh menggagalkan restart.
    const cleared: string[] = [];
    const wipe = async (table: string, column = 'conversation_id') => {
      const { error } = await supabaseAdmin.from(table).delete().eq(column, id);
      if (!error) cleared.push(table);
    };

    await wipe('followups');
    if (resetCrm) {
      await wipe('conversation_labels');
      await wipe('orders');
      await wipe('tickets');
    }

    // 3. Field kontak yang diisi AI (nama & telepon dipertahankan supaya
    // chat berikutnya tetap nyambung ke kontak yang sama)
    if (resetCrm && conv.contact_id) {
      const { error } = await supabaseAdmin
        .from('contacts')
        .update({ email: null, company: null, address: null, notes: null, tags: [] })
        .eq('id', conv.contact_id)
        .eq('user_id', user.id);
      if (!error) cleared.push('contacts');
    }

    return NextResponse.json({ ok: true, resetCrm, cleared });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
