import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { invalidateCache, cacheKeys } from '@/lib/cache';

async function getUser() {
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
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Koneksi WhatsApp level akun (1 user = 1 WA) + daftar bot untuk dropdown
// "AI agent yang menjawab". session_key = key sesi worker Baileys.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: connection }, { data: bots }] = await Promise.all([
    supabaseAdmin
      .from('whatsapp_connections')
      .select('id, bot_id, enabled, phone_number, bot_type, phone_id, access_token')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabaseAdmin
      .from('bots')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name', { ascending: true }),
  ]);

  return NextResponse.json({
    connection: connection || null,
    bots: bots || [],
    session_key: user.id,
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.bot_id) {
    return NextResponse.json({ error: 'Pilih AI agent yang menjawab WhatsApp' }, { status: 400 });
  }

  // Bot penjawab harus milik user
  const { data: bot } = await supabaseAdmin
    .from('bots')
    .select('id')
    .eq('id', body.bot_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!bot) return NextResponse.json({ error: 'Forbidden: bot bukan milikmu' }, { status: 403 });

  // Untuk invalidasi cache: key lama (bot_id/phone sebelumnya) juga harus segar
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_connections')
    .select('bot_id, phone_number')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from('whatsapp_connections')
    .upsert(
      {
        user_id: user.id,
        bot_id: body.bot_id,
        enabled: !!body.enabled,
        phone_number: body.phone_number?.trim() || null,
        bot_type: body.bot_type === 'official' ? 'official' : 'baileys',
        phone_id: body.phone_id?.trim() || null,
        access_token: body.access_token?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('id, bot_id, enabled, phone_number, bot_type, phone_id, access_token')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Webhook membaca koneksi via cache dengan berbagai key — bersihkan semuanya
  const staleKeys = new Set<string>([
    cacheKeys.waConnection(user.id),
    cacheKeys.waConnection(body.bot_id),
  ]);
  if (existing?.bot_id) staleKeys.add(cacheKeys.waConnection(existing.bot_id));
  if (existing?.phone_number) staleKeys.add(cacheKeys.waConnection(`phone:${existing.phone_number}`));
  if (data.phone_number) staleKeys.add(cacheKeys.waConnection(`phone:${data.phone_number}`));
  await invalidateCache(...staleKeys);

  return NextResponse.json({ connection: data, session_key: user.id });
}
