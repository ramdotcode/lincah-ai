import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser } from '@/lib/apiAuth';

// Merge beberapa kontak (orang yang sama lintas kanal) menjadi satu kontak primer.
// Identitas kanal, percakapan, dan data profil kontak yang di-merge dipindah ke primer.
// Butuh migrasi 0023 (contact_identities).
const FILL_FIELDS = ['name', 'username', 'phone', 'email', 'company', 'address'] as const;

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const primaryId: string = body.primary_id;
  const mergeIds: string[] = Array.isArray(body.merge_ids)
    ? [...new Set(body.merge_ids)].filter((id): id is string => typeof id === 'string' && id !== primaryId)
    : [];

  if (!primaryId || mergeIds.length === 0) {
    return NextResponse.json({ error: 'primary_id dan minimal satu merge_id wajib' }, { status: 400 });
  }

  // Ambil semua kontak yang terlibat, pastikan milik user
  const allIds = [primaryId, ...mergeIds];
  const { data: contacts, error: fetchError } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('user_id', user.id)
    .in('id', allIds);

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 });
  if (!contacts || contacts.length !== allIds.length) {
    return NextResponse.json({ error: 'Sebagian kontak tidak ditemukan / bukan milik Anda' }, { status: 403 });
  }

  const primary = contacts.find(c => c.id === primaryId)!;
  const merges = contacts.filter(c => c.id !== primaryId);

  // 1. Pindahkan identitas kanal & percakapan ke primer (sebelum hapus, agar tidak
  //    ikut ter-cascade). Unique (user_id, platform, external_id) tetap valid karena
  //    setiap identitas sudah unik lintas kontak.
  const { error: identErr } = await supabaseAdmin
    .from('contact_identities')
    .update({ contact_id: primaryId })
    .eq('user_id', user.id)
    .in('contact_id', mergeIds);
  if (identErr) return NextResponse.json({ error: identErr.message }, { status: 400 });

  const { error: convErr } = await supabaseAdmin
    .from('conversations')
    .update({ contact_id: primaryId })
    .in('contact_id', mergeIds);
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 400 });

  // 2. Gabungkan profil: fill-if-empty untuk field identitas, union tags,
  //    gabung notes, ambil last_seen_at paling baru.
  const updates: Record<string, any> = {};
  for (const field of FILL_FIELDS) {
    if (!primary[field]) {
      const donor = merges.find(m => m[field]);
      if (donor) updates[field] = donor[field];
    }
  }

  const tagSet = new Set<string>(primary.tags || []);
  for (const m of merges) for (const t of m.tags || []) tagSet.add(t);
  if (tagSet.size !== (primary.tags || []).length) updates.tags = [...tagSet].slice(0, 20);

  const noteParts = [primary.notes, ...merges.map(m => m.notes)].filter(Boolean);
  const mergedNotes = [...new Set(noteParts)].join('\n');
  if (mergedNotes && mergedNotes !== (primary.notes || '')) updates.notes = mergedNotes.slice(0, 2000);

  const allLastSeen = [primary.last_seen_at, ...merges.map(m => m.last_seen_at)].filter(Boolean).sort();
  const newestLastSeen = allLastSeen[allLastSeen.length - 1];
  if (newestLastSeen && newestLastSeen !== primary.last_seen_at) updates.last_seen_at = newestLastSeen;

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('contacts').update(updates).eq('id', primaryId);
  }

  // 3. Hapus kontak yang sudah di-merge (identitas & percakapannya sudah dipindah)
  const { error: delErr } = await supabaseAdmin
    .from('contacts')
    .delete()
    .eq('user_id', user.id)
    .in('id', mergeIds);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  const { data: result } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', primaryId)
    .maybeSingle();

  return NextResponse.json({ ok: true, contact: result, merged: mergeIds.length });
}
