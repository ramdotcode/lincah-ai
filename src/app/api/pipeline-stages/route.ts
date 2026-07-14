import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser, getOwnedBotIds } from '@/lib/apiAuth';
import { invalidateCache, cacheKeys } from '@/lib/cache';
import { ensureStagesForUser } from '@/lib/pipelineStages';
import { STAGE_COLORS, slugifyStageKey } from '@/lib/stageConstants';

const STAGE_TYPES = ['open', 'won', 'lost'];

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const stages = await ensureStagesForUser(user.id);
  return NextResponse.json(stages);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : '';
  if (!label) return NextResponse.json({ error: 'label required' }, { status: 400 });

  // Pastikan default ter-seed dulu, lalu tentukan key & posisi unik
  const existing = await ensureStagesForUser(user.id);
  let key = slugifyStageKey(label) || `stage-${existing.length + 1}`;
  if (existing.some(s => s.key === key)) key = `${key}-${existing.length + 1}`;

  const color = STAGE_COLORS.includes(body.color) ? body.color : 'blue';
  const type = STAGE_TYPES.includes(body.type) ? body.type : 'open';
  const position = existing.length; // taruh di akhir

  const { data, error } = await supabaseAdmin
    .from('pipeline_stages')
    .insert({ user_id: user.id, key, label, color, position, type })
    .select('key, label, color, position, type')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Stage sudah ada' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await invalidateCache(cacheKeys.stages(user.id));
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // Mode reorder batch: { order: [key, key, ...] }
  if (Array.isArray(body.order)) {
    const keys: string[] = body.order.filter((k: unknown): k is string => typeof k === 'string');
    for (let i = 0; i < keys.length; i++) {
      await supabaseAdmin
        .from('pipeline_stages')
        .update({ position: i })
        .eq('user_id', user.id)
        .eq('key', keys[i]);
    }
    await invalidateCache(cacheKeys.stages(user.id));
    const stages = await ensureStagesForUser(user.id);
    return NextResponse.json(stages);
  }

  // Mode edit satu stage by key
  const key = body.key;
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const updates: Record<string, string> = {};
  if (body.label !== undefined) {
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : '';
    if (!label) return NextResponse.json({ error: 'invalid label' }, { status: 400 });
    updates.label = label;
  }
  if (body.color !== undefined) {
    if (!STAGE_COLORS.includes(body.color)) return NextResponse.json({ error: 'invalid color' }, { status: 400 });
    updates.color = body.color;
  }
  if (body.type !== undefined) {
    if (!STAGE_TYPES.includes(body.type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 });
    updates.type = body.type;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('pipeline_stages')
    .update(updates)
    .eq('user_id', user.id)
    .eq('key', key)
    .select('key, label, color, position, type')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await invalidateCache(cacheKeys.stages(user.id));
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = new URL(req.url).searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const stages = await ensureStagesForUser(user.id);
  if (stages.length <= 1) {
    return NextResponse.json({ error: 'Minimal satu stage harus ada' }, { status: 400 });
  }
  if (!stages.some(s => s.key === key)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Reassign percakapan di stage ini ke stage pertama (fallback), lalu hapus stage.
  const fallback = stages.find(s => s.key !== key)!;
  const botIds = await getOwnedBotIds(user.id);
  if (botIds.length > 0) {
    await supabaseAdmin
      .from('conversations')
      .update({ stage: fallback.key, stage_updated_by: 'manual' })
      .eq('stage', key)
      .in('bot_id', botIds);
  }

  const { error } = await supabaseAdmin
    .from('pipeline_stages')
    .delete()
    .eq('user_id', user.id)
    .eq('key', key);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await invalidateCache(cacheKeys.stages(user.id));
  return NextResponse.json({ ok: true, reassignedTo: fallback.key });
}
