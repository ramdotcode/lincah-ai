import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser } from '@/lib/apiAuth';

// Field yang boleh diubah user lewat API. user_id/platform/external_id/source
// tidak pernah boleh disentuh dari client.
const EDITABLE_FIELDS = ['name', 'username', 'phone', 'email', 'company', 'address', 'notes'] as const;

function normalizeTags(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const tags = input
    .filter((t): t is string => typeof t === 'string')
    .map(t => t.trim().slice(0, 40))
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 20);
}

function pickEditableFields(body: Record<string, any>): Record<string, any> {
  const updates: Record<string, any> = {};
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) {
      updates[key] = typeof body[key] === 'string' && body[key].trim() ? body[key].trim() : null;
    }
  }
  if (body.tags !== undefined) {
    const tags = normalizeTags(body.tags);
    if (tags) updates.tags = tags;
  }
  return updates;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const runQuery = (select: string) =>
    supabaseAdmin
      .from('contacts')
      .select(select)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(500);

  // Coba embed contact_identities; fail-open ke tanpa-identities bila migrasi 0023 belum jalan
  let { data, error } = await runQuery(
    '*, conversations(id, stage, last_message_at), contact_identities(platform, external_id)'
  );
  if (error) {
    ({ data, error } = await runQuery('*, conversations(id, stage, last_message_at)'));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Ratakan embed conversations + identities jadi agregat yang dibutuhkan halaman Contacts
  const contacts = (data || []).map((row: any) => {
    const convs: any[] = Array.isArray(row.conversations) ? row.conversations : [];
    const sorted = [...convs].sort((a, b) =>
      (b.last_message_at || '').localeCompare(a.last_message_at || '')
    );
    const latest = sorted[0] || null;
    const { conversations: _omit, contact_identities, ...contact } = row;
    // Identitas: pakai tabel bila ada, jika belum (pre-migrasi) turunkan dari kolom primer
    let identities: Array<{ platform: string; external_id: string }> = Array.isArray(contact_identities)
      ? contact_identities
      : [];
    if (identities.length === 0 && contact.platform && contact.external_id) {
      identities = [{ platform: contact.platform, external_id: contact.external_id }];
    }
    return {
      ...contact,
      identities,
      conversationCount: convs.length,
      lastConversationId: latest?.id || null,
      lastStage: latest?.stage || null,
      lastMessageAt: latest?.last_message_at || null,
    };
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      user_id: user.id,
      source: 'manual',
      ...pickEditableFields(body),
      name: body.name.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(
    { ...data, conversationCount: 0, lastConversationId: null, lastStage: null, lastMessageAt: null },
    { status: 201 }
  );
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates = pickEditableFields(body);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  // Pastikan kontak milik user
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, user_id')
    .eq('id', body.id)
    .maybeSingle();

  if (!contact || contact.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // conversations.contact_id otomatis null via FK on delete set null
  const { error } = await supabaseAdmin
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
