import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const ORDER_STATUSES = ['new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled'];

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

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Semua order milik bot-bot user, terbaru dulu
  const { data: bots } = await supabaseAdmin
    .from('bots')
    .select('id, name')
    .eq('user_id', user.id);
  const botIds = (bots || []).map(b => b.id);
  if (botIds.length === 0) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .in('bot_id', botIds)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const botNames: Record<string, string> = {};
  for (const b of bots || []) botNames[b.id] = b.name;
  const withBot = (data || []).map(o => ({ ...o, bot_name: botNames[o.bot_id] || '-' }));

  return NextResponse.json(withBot);
}

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (!ORDER_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  // Pastikan order milik bot user
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, bot_id, bots!inner(user_id)')
    .eq('id', body.id)
    .maybeSingle();

  if (!order || (order as any).bots?.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ status: body.status })
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
