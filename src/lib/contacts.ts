// CRM Contacts — kontak nyata level akun, dibuat/di-link otomatis oleh webhook
// saat percakapan belum punya contact_id.
//
// Pencocokan kanal memakai tabel `contact_identities` (Fase 6, sumber kebenaran:
// satu kontak bisa punya banyak identitas kanal setelah merge). Kolom
// contacts.platform/external_id dipertahankan sebagai identitas PRIMER (tampilan).
// Sebelum migrasi 0023 dijalankan, otomatis fail-open ke pencocokan lama via contacts.

import { supabaseAdmin } from '@/lib/supabase';

export interface ContactSeed {
  userId: string;
  platform: 'telegram' | 'whatsapp' | 'webchat';
  externalId: string; // = conversations.chat_id
  name?: string | null;
  username?: string | null;
  phone?: string | null; // whatsapp: sama dengan externalId
}

// Cari contact_id dari identitas kanal. identitiesAvailable=false berarti tabel
// contact_identities belum ada (pre-migrasi 0023) → pemanggil pakai fallback lama.
async function findByIdentity(
  seed: ContactSeed
): Promise<{ contactId: string | null; identitiesAvailable: boolean }> {
  const { data, error } = await supabaseAdmin
    .from('contact_identities')
    .select('contact_id')
    .eq('user_id', seed.userId)
    .eq('platform', seed.platform)
    .eq('external_id', seed.externalId)
    .maybeSingle();
  if (error) return { contactId: null, identitiesAvailable: false };
  return { contactId: data?.contact_id ?? null, identitiesAvailable: true };
}

// Cari-atau-buat kontak untuk sebuah percakapan lalu tautkan contact_id-nya.
// Tidak pernah throw — kegagalan kontak tidak boleh mematahkan alur balasan.
export async function ensureContactForConversation(
  conversationId: string,
  seed: ContactSeed
): Promise<string | null> {
  try {
    const now = new Date().toISOString();

    // 1. Cari kontak lewat identitas kanal (sumber kebenaran = contact_identities)
    const { contactId: viaIdentity, identitiesAvailable } = await findByIdentity(seed);
    let contactId = viaIdentity;

    // Fallback pre-migrasi: cocokkan langsung ke kolom primer di contacts
    if (!contactId && !identitiesAvailable) {
      const { data: legacy } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('user_id', seed.userId)
        .eq('platform', seed.platform)
        .eq('external_id', seed.externalId)
        .maybeSingle();
      contactId = legacy?.id || null;
    }

    if (contactId) {
      // Fill-if-empty: jangan timpa data yang sudah ada (bisa hasil edit manual)
      const { data: existing } = await supabaseAdmin
        .from('contacts')
        .select('name, username, phone')
        .eq('id', contactId)
        .maybeSingle();
      const updates: Record<string, string> = { last_seen_at: now };
      if (existing && !existing.name && seed.name?.trim()) updates.name = seed.name.trim();
      if (existing && !existing.username && seed.username?.trim()) updates.username = seed.username.trim();
      if (existing && !existing.phone && seed.phone?.trim()) updates.phone = seed.phone.trim();
      await supabaseAdmin.from('contacts').update(updates).eq('id', contactId);
    } else {
      // Buat kontak baru (identitas primer disimpan di kolom contacts juga)
      const { data: created, error: insertError } = await supabaseAdmin
        .from('contacts')
        .insert({
          user_id: seed.userId,
          platform: seed.platform,
          external_id: seed.externalId,
          name: seed.name?.trim() || null,
          username: seed.username?.trim() || null,
          phone: seed.phone?.trim() || null,
          source: 'auto',
          last_seen_at: now,
        })
        .select('id')
        .single();

      if (created) {
        contactId = created.id;
      } else if (insertError?.code === '23505') {
        // Race antar-webhook: kontak keburu dibuat → ambil yang sudah ada
        const { data: raced } = await supabaseAdmin
          .from('contacts')
          .select('id')
          .eq('user_id', seed.userId)
          .eq('platform', seed.platform)
          .eq('external_id', seed.externalId)
          .maybeSingle();
        contactId = raced?.id || null;
      } else if (insertError) {
        console.error('[Contacts] insert failed:', insertError);
      }

      // Catat identitas kanal (idempoten; dilewati bila tabel belum ada)
      if (contactId && identitiesAvailable) {
        await supabaseAdmin
          .from('contact_identities')
          .upsert(
            { user_id: seed.userId, contact_id: contactId, platform: seed.platform, external_id: seed.externalId },
            { onConflict: 'user_id,platform,external_id', ignoreDuplicates: true }
          );
      }
    }

    // 2. Tautkan percakapan ke kontaknya (hanya jika belum ter-link)
    if (contactId) {
      await supabaseAdmin
        .from('conversations')
        .update({ contact_id: contactId })
        .eq('id', conversationId)
        .is('contact_id', null);
    }

    return contactId;
  } catch (error) {
    console.error('[Contacts] ensureContactForConversation failed:', error);
    return null;
  }
}
