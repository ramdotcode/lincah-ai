import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from './supabase';
import { isAdmin } from './roles';

// Helper auth bersama untuk API routes (dipakai untuk mengamankan route
// conversations/stats/reply/suggest — sebelumnya tanpa auth sama sekali).
// Pola sama dengan route bot/agents: sesi Supabase + dev bypass user pertama.

export async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    if (users && users.users.length > 0) user = users.users[0] as any;
  }
  return user;
}

/** Id semua bot milik user (untuk memfilter data lintas tabel). */
export async function getOwnedBotIds(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('bots')
    .select('id')
    .eq('user_id', userId);
  return (data || []).map(b => b.id);
}

/**
 * Boleh akses percakapan ini? Admin selalu boleh; selain itu harus pemilik
 * bot dari percakapan tersebut.
 */
export async function canAccessConversation(
  userId: string,
  conversationId: string
): Promise<boolean> {
  if (await isAdmin(userId)) return true;

  const { data } = await supabaseAdmin
    .from('conversations')
    .select('id, bots!inner(user_id)')
    .eq('id', conversationId)
    .maybeSingle();

  return !!data && (data as any).bots?.user_id === userId;
}
