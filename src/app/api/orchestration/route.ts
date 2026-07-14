import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { invalidateCache, cacheKeys } from '@/lib/cache';

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

async function getUser() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Ambil bot parent sekaligus memastikan miliknya user
async function getOwnedBot(userId: string, botId: string) {
  const { data } = await supabaseAdmin
    .from('bots')
    .select('id, orchestration_enabled, revert_to_parent_condition, orchestration_parent_position, whatsapp_phone_number')
    .eq('id', botId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

// Konfigurasi orchestration satu bot: toggle, kondisi balik, assignments,
// plus daftar bot lain milik user untuk dropdown child
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const botId = searchParams.get('botId');
  if (!botId) return NextResponse.json({ error: 'botId required' }, { status: 400 });

  const bot = await getOwnedBot(user.id, botId);
  if (!bot) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ data: assignments }, { data: bots }] = await Promise.all([
    supabaseAdmin
      .from('agent_assignments')
      .select('id, child_bot_id, assign_condition, position')
      .eq('parent_bot_id', botId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('bots')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name', { ascending: true }),
  ]);

  const nameById = new Map((bots || []).map(b => [b.id, b.name]));

  return NextResponse.json({
    enabled: !!bot.orchestration_enabled,
    revert_to_parent_condition: bot.revert_to_parent_condition || '',
    parent_position: bot.orchestration_parent_position || null,
    assignments: (assignments || []).map(a => ({
      ...a,
      child_name: nameById.get(a.child_bot_id) || 'Unknown',
    })),
    // Kandidat child: semua bot user selain bot ini
    available_bots: (bots || []).filter(b => b.id !== botId),
  });
}

// Save Configuration: simpan seluruh konfigurasi sekaligus (replace-all)
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const botId = body.botId;
  if (!botId) return NextResponse.json({ error: 'botId required' }, { status: 400 });

  const bot = await getOwnedBot(user.id, botId);
  if (!bot) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const assignments: { child_bot_id: string; assign_condition: string; position?: { x: number; y: number } | null }[] =
    Array.isArray(body.assignments) ? body.assignments : [];

  // Validasi: child bukan bot ini sendiri, tidak dobel, kondisi terisi,
  // dan semua child memang milik user
  const childIds = assignments.map(a => a.child_bot_id);
  if (childIds.includes(botId)) {
    return NextResponse.json({ error: 'Bot tidak bisa menjadi child dirinya sendiri' }, { status: 400 });
  }
  if (new Set(childIds).size !== childIds.length) {
    return NextResponse.json({ error: 'Bot yang sama tidak bisa jadi child dua kali' }, { status: 400 });
  }
  if (assignments.some(a => !a.child_bot_id || !a.assign_condition?.trim())) {
    return NextResponse.json({ error: 'Setiap child wajib punya bot dan kondisi assign' }, { status: 400 });
  }
  if (childIds.length > 0) {
    const { data: ownedChildren } = await supabaseAdmin
      .from('bots')
      .select('id')
      .eq('user_id', user.id)
      .in('id', childIds);
    if ((ownedChildren || []).length !== childIds.length) {
      return NextResponse.json({ error: 'Forbidden: child bot bukan milikmu' }, { status: 403 });
    }
  }

  const { error: botError } = await supabaseAdmin
    .from('bots')
    .update({
      orchestration_enabled: !!body.enabled,
      revert_to_parent_condition: body.revert_to_parent_condition?.trim() || null,
      orchestration_parent_position: body.parent_position || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', botId);
  if (botError) return NextResponse.json({ error: botError.message }, { status: 400 });

  // Replace-all: UI mengirim state lengkap, jadi hapus lalu tulis ulang
  const { error: deleteError } = await supabaseAdmin
    .from('agent_assignments')
    .delete()
    .eq('parent_bot_id', botId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  if (assignments.length > 0) {
    const { error: insertError } = await supabaseAdmin.from('agent_assignments').insert(
      assignments.map(a => ({
        parent_bot_id: botId,
        child_bot_id: a.child_bot_id,
        assign_condition: a.assign_condition.trim(),
        position: a.position || null,
      }))
    );
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Runtime membaca toggle & kondisi dari cache bot — dua-duanya harus segar
  await invalidateCache(
    cacheKeys.assignments(botId),
    cacheKeys.botById(botId),
    ...(bot.whatsapp_phone_number ? [cacheKeys.botByPhone(bot.whatsapp_phone_number)] : [])
  );

  return NextResponse.json({ ok: true });
}
