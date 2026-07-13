import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { invalidateCache, cacheKeys } from '@/lib/cache';

const TOOL_TYPES = ['check_stock', 'check_shipping', 'create_order'];

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
    .from('bot_tools')
    .select('*')
    .eq('bot_id', botId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.bot_id) return NextResponse.json({ error: 'bot_id required' }, { status: 400 });
  if (!TOOL_TYPES.includes(body.tool_type)) {
    return NextResponse.json({ error: 'invalid tool_type' }, { status: 400 });
  }

  if (!(await ownsBot(user.id, body.bot_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('bot_tools')
    .upsert(
      {
        bot_id: body.bot_id,
        tool_type: body.tool_type,
        enabled: body.enabled !== false,
        config: body.config || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'bot_id,tool_type' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await invalidateCache(cacheKeys.tools(body.bot_id));

  return NextResponse.json(data);
}
