import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser } from '@/lib/apiAuth';
import { invalidateCache, cacheKeys } from '@/lib/cache';

const LABEL_COLORS = ['red', 'orange', 'amber', 'emerald', 'sky', 'blue', 'violet', 'pink'];

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('labels')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const color = LABEL_COLORS.includes(body.color) ? body.color : 'blue';

  const { data, error } = await supabaseAdmin
    .from('labels')
    .insert({ user_id: user.id, name, color })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Label dengan nama itu sudah ada' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await invalidateCache(cacheKeys.aiLabels(user.id));
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, string | boolean> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
    if (!name) return NextResponse.json({ error: 'invalid name' }, { status: 400 });
    updates.name = name;
  }
  if (body.color !== undefined) {
    if (!LABEL_COLORS.includes(body.color)) {
      return NextResponse.json({ error: 'invalid color' }, { status: 400 });
    }
    updates.color = body.color;
  }
  if (body.ai_enabled !== undefined) {
    if (typeof body.ai_enabled !== 'boolean') {
      return NextResponse.json({ error: 'invalid ai_enabled' }, { status: 400 });
    }
    updates.ai_enabled = body.ai_enabled;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('labels')
    .update(updates)
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await invalidateCache(cacheKeys.aiLabels(user.id));
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // conversation_labels ikut terhapus via FK on delete cascade
  const { error } = await supabaseAdmin
    .from('labels')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await invalidateCache(cacheKeys.aiLabels(user.id));
  return NextResponse.json({ ok: true });
}
