import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser, canAccessConversation } from '@/lib/apiAuth';

const MAX_LABELS_PER_CONVERSATION = 5;

// Ganti seluruh set label sebuah percakapan (replace-set, bukan append)
export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const conversationId = body.conversation_id;
  const labelIds: string[] = Array.isArray(body.label_ids) ? body.label_ids : [];

  if (!conversationId) {
    return NextResponse.json({ error: 'conversation_id required' }, { status: 400 });
  }
  if (labelIds.length > MAX_LABELS_PER_CONVERSATION) {
    return NextResponse.json(
      { error: `Maksimal ${MAX_LABELS_PER_CONVERSATION} label per percakapan` },
      { status: 400 }
    );
  }

  // Percakapan harus milik user (via bot ownership)
  if (!(await canAccessConversation(user.id, conversationId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Semua label harus milik user
  if (labelIds.length > 0) {
    const { data: owned } = await supabaseAdmin
      .from('labels')
      .select('id')
      .eq('user_id', user.id)
      .in('id', labelIds);
    if ((owned || []).length !== new Set(labelIds).size) {
      return NextResponse.json({ error: 'invalid label_ids' }, { status: 400 });
    }
  }

  // Replace set: hapus semua lalu pasang ulang
  const { error: delError } = await supabaseAdmin
    .from('conversation_labels')
    .delete()
    .eq('conversation_id', conversationId);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 400 });

  if (labelIds.length > 0) {
    const rows = [...new Set(labelIds)].map(label_id => ({
      conversation_id: conversationId,
      label_id,
    }));
    const { error: insError } = await supabaseAdmin.from('conversation_labels').insert(rows);
    if (insError) return NextResponse.json({ error: insError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, label_ids: [...new Set(labelIds)] });
}
