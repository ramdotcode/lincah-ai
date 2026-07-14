import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUser, getOwnedBotIds } from '@/lib/apiAuth';
import { isAdmin } from '@/lib/roles';
import { getStagesForUser } from '@/lib/pipelineStages';
import { DEFAULT_STAGES } from '@/lib/stageConstants';

const DAYS = 14;

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Admin melihat statistik global; owner hanya bot miliknya
    let botIds: string[] | null = null;
    if (!(await isAdmin(user.id))) {
      botIds = await getOwnedBotIds(user.id);
      if (botIds.length === 0) {
        return NextResponse.json(emptyStats());
      }
    }

    const scopeConv = () => {
      let q = supabaseAdmin.from('conversations').select('*', { count: 'exact', head: true });
      if (botIds) q = q.in('bot_id', botIds);
      return q;
    };
    const scopeEvents = (eventType: string) => {
      let q = supabaseAdmin
        .from('event_logs')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', eventType);
      if (botIds) q = q.in('bot_id', botIds);
      return q;
    };
    const scopeOrders = () => {
      let q = supabaseAdmin.from('orders').select('*', { count: 'exact', head: true });
      if (botIds) q = q.in('bot_id', botIds);
      return q;
    };

    // Stage pipeline custom akun (Fase 7)
    const stageDefs = await getStagesForUser(user.id);

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (DAYS - 1));
    const sinceIso = since.toISOString();

    let dailyConvQuery = supabaseAdmin
      .from('conversations')
      .select('created_at')
      .gte('created_at', sinceIso);
    if (botIds) dailyConvQuery = dailyConvQuery.in('bot_id', botIds);

    let dailyAiQuery = supabaseAdmin
      .from('event_logs')
      .select('created_at')
      .eq('event_type', 'message_processed')
      .gte('created_at', sinceIso);
    if (botIds) dailyAiQuery = dailyAiQuery.in('bot_id', botIds);

    const [
      { count: totalConversations },
      { count: pendingHandoffs },
      { count: aiResponses },
      { count: followupsSent },
      { count: totalOrders },
      stageCounts,
      { data: dailyConvRows },
      { data: dailyAiRows },
    ] = await Promise.all([
      scopeConv(),
      scopeConv().eq('status', 'pending'),
      scopeEvents('message_processed'),
      scopeEvents('followup_sent'),
      scopeOrders(),
      Promise.all(stageDefs.map(s => scopeConv().eq('stage', s.key).then(r => r.count || 0))),
      dailyConvQuery,
      dailyAiQuery,
    ]);

    // Agregasi per hari (kunci YYYY-MM-DD waktu lokal server)
    const daily: { date: string; conversations: number; aiResponses: number }[] = [];
    const dayIndex = new Map<string, number>();
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = toDayKey(d);
      dayIndex.set(key, daily.length);
      daily.push({ date: key, conversations: 0, aiResponses: 0 });
    }
    for (const row of dailyConvRows || []) {
      const idx = dayIndex.get(toDayKey(new Date(row.created_at)));
      if (idx !== undefined) daily[idx].conversations++;
    }
    for (const row of dailyAiRows || []) {
      const idx = dayIndex.get(toDayKey(new Date(row.created_at)));
      if (idx !== undefined) daily[idx].aiResponses++;
    }

    const stages = Object.fromEntries(stageDefs.map((s, i) => [s.key, stageCounts[i]]));
    const stageDefsOut = stageDefs.map(s => ({ key: s.key, label: s.label, color: s.color }));

    // Forecast nilai deal (Fase 9): jumlah per tipe stage
    let dealQuery = supabaseAdmin
      .from('conversations')
      .select('stage, deal_value')
      .not('deal_value', 'is', null);
    if (botIds) dealQuery = dealQuery.in('bot_id', botIds);
    const { data: dealRows } = await dealQuery;

    const openKeys = new Set(stageDefs.filter(s => s.type === 'open').map(s => s.key));
    const wonKeys = new Set(stageDefs.filter(s => s.type === 'won').map(s => s.key));
    let pipelineValue = 0;
    let wonValue = 0;
    for (const r of dealRows || []) {
      const v = Number(r.deal_value) || 0;
      if (openKeys.has(r.stage)) pipelineValue += v;
      else if (wonKeys.has(r.stage)) wonValue += v;
    }

    return NextResponse.json({
      totalConversations: totalConversations || 0,
      pendingHandoffs: pendingHandoffs || 0,
      aiResponses: aiResponses || 0,
      followupsSent: followupsSent || 0,
      totalOrders: totalOrders || 0,
      pipelineValue,
      wonValue,
      stages,
      stageDefs: stageDefsOut,
      daily,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function toDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyStats() {
  return {
    totalConversations: 0,
    pendingHandoffs: 0,
    aiResponses: 0,
    followupsSent: 0,
    totalOrders: 0,
    pipelineValue: 0,
    wonValue: 0,
    stages: Object.fromEntries(DEFAULT_STAGES.map(s => [s.key, 0])),
    stageDefs: DEFAULT_STAGES.map(s => ({ key: s.key, label: s.label, color: s.color })),
    daily: [],
  };
}
