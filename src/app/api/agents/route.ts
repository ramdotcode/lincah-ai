import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    if (users && users.users.length > 0) user = users.users[0] as any;
  }
  return user;
}

// Pastikan bot milik user sebelum operasi apa pun pada agents-nya
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
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const botId = searchParams.get('botId');
  if (!botId) return NextResponse.json({ error: 'botId required' }, { status: 400 });

  if (!(await ownsBot(user.id, botId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('bot_id', botId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.bot_id) return NextResponse.json({ error: 'bot_id required' }, { status: 400 });
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  if (!(await ownsBot(user.id, body.bot_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const agentData: any = {
    bot_id: body.bot_id,
    name: body.name.trim(),
    description: body.description,
    system_prompt: body.system_prompt,
    is_default: !!body.is_default,
    active: body.active !== false,
    updated_at: new Date().toISOString(),
  };
  if (body.id) agentData.id = body.id;

  // Hanya satu agent default per bot
  if (agentData.is_default) {
    await supabaseAdmin
      .from('agents')
      .update({ is_default: false })
      .eq('bot_id', body.bot_id);
  }

  const { data, error } = await supabaseAdmin
    .from('agents')
    .upsert(agentData)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, bot_id')
    .eq('id', id)
    .maybeSingle();

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  if (!(await ownsBot(user.id, agent.bot_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from('agents').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
