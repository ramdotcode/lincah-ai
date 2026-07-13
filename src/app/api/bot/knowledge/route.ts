import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { invalidateCache, cacheKeys } from '@/lib/cache';
import { reindexKnowledgeSource } from '@/lib/rag';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

// Pastikan bot milik user sebelum operasi apa pun pada knowledge-nya
async function ownsBot(userId: string, botId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('bots')
    .select('id')
    .eq('id', botId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const botId = searchParams.get('botId');

  if (!botId) return NextResponse.json({ error: 'botId required' }, { status: 400 });
  if (!(await ownsBot(user.id, botId))) {
    return NextResponse.json({ error: 'Forbidden: not your bot' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('knowledge_sources')
    .select('*')
    .eq('bot_id', botId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  if (!body.bot_id || !(await ownsBot(user.id, body.bot_id))) {
    return NextResponse.json({ error: 'Forbidden: not your bot' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('knowledge_sources')
    .upsert({
      id: body.id,
      bot_id: body.bot_id,
      type: body.type,
      name: body.name,
      content: body.content,
      metadata: body.metadata || {},
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await invalidateCache(cacheKeys.knowledge(data.bot_id));

  // RAG (Fase E2): bangun ulang chunk + embedding untuk source ini.
  // Ditunggu di sini (bukan fire-and-forget) agar tidak terpotong serverless freeze;
  // gagal pun tidak apa-apa — webhook otomatis jatuh ke knowledge penuh.
  await reindexKnowledgeSource(data);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  // Ambil bot_id dulu untuk cek kepemilikan + invalidasi cache setelah delete
  const { data: existing } = await supabaseAdmin
    .from('knowledge_sources')
    .select('bot_id')
    .eq('id', id)
    .maybeSingle();

  if (existing?.bot_id && !(await ownsBot(user.id, existing.bot_id))) {
    return NextResponse.json({ error: 'Forbidden: not your bot' }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from('knowledge_sources').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (existing?.bot_id) await invalidateCache(cacheKeys.knowledge(existing.bot_id));

  return NextResponse.json({ ok: true });
}
