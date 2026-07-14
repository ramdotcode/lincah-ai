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

export async function GET() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('bots')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  
  // Clean Data: Only send columns that exist in the DB
  const botData: any = {
    name: body.name,
    system_prompt: body.system_prompt,
    welcome_message: body.welcome_message,
    transfer_condition: body.transfer_condition,
    stop_ai_after_handoff: body.stop_ai_after_handoff,
    silent_handoff: body.silent_handoff,
    ai_model: body.ai_model,
    ai_label: body.ai_label,
    ai_pipeline_status: body.ai_pipeline_status,
    telegram_token: body.telegram_token,
    // Kolom whatsapp_* tidak ditulis lagi — koneksi WA sekarang level akun
    // (tabel whatsapp_connections via /api/platforms/whatsapp)
    followup_enabled: body.followup_enabled,
    followup_mode: body.followup_mode === 'ai' ? 'ai' : 'template',
    followup_delay_hours: body.followup_delay_hours,
    followup_max_count: body.followup_max_count,
    followup_template: body.followup_template,
    followup_stages: body.followup_stages,
    followup_label_ids: Array.isArray(body.followup_label_ids) ? body.followup_label_ids : undefined,
    followup_wa_hourly_limit: body.followup_wa_hourly_limit,
    tools_enabled: body.tools_enabled,
    widget_enabled: body.widget_enabled,
    user_id: user.id,
    updated_at: new Date().toISOString()
  };

  // If there's an ID, we include it for UPSERT to work
  if (body.id) {
    const { data: existing } = await supabaseAdmin
      .from('bots')
      .select('user_id')
      .eq('id', body.id)
      .maybeSingle();
    if (existing && existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: not your bot' }, { status: 403 });
    }
    botData.id = body.id;
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .upsert(botData)
    .select()
    .single();

  if (error) {
    console.error('SUPABASE_UPSERT_ERROR:', error);
    return NextResponse.json({ 
      error: error.message, 
      details: error.details,
      sent_data: botData
    }, { status: 400 });
  }

  // Fase E1: webhook membaca bot dari cache — hapus setelah save
  const staleKeys = [cacheKeys.botById(data.id)];
  if (data.whatsapp_phone_number) staleKeys.push(cacheKeys.botByPhone(data.whatsapp_phone_number));
  await invalidateCache(...staleKeys);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from('bots')
    .select('user_id')
    .eq('id', id)
    .maybeSingle();
  if (existing && existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden: not your bot' }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from('bots').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
